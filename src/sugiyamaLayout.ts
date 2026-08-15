import { Table } from "./interfaces";

/**
 * Layered graph layout (Sugiyama-style) for the table diagram.
 *
 * Two independent phases, run in sequence by svgGenerator.ts:
 *   1. `assignLevels` — assigns every table a horizontal "layer" (level)
 *      based on its foreign-key dependencies, so referenced tables always
 *      end up to one side of the tables that reference them.
 *   2. `minimizeCrossings` — within each level, orders tables vertically
 *      to reduce (not guarantee-eliminate — this is a heuristic) how many
 *      relationship lines cross each other.
 *
 * Known limitation, intentionally deferred to a future version: this is
 * a *simplified* Sugiyama layering, without "dummy nodes" for edges that
 * skip levels, and without strongly-connected-component (SCC) collapsing
 * before layering. Two consequences worth knowing if extending this file:
 *   - `minimizeCrossings` only considers neighbors in the *immediately
 *     adjacent* level when computing its barycenter score. An edge whose
 *     source and target are more than one level apart has zero influence
 *     on ordering for that edge — it's neither wrong nor crashing, it
 *     just isn't optimized.
 *   - A direct foreign-key cycle between two distinct tables (A→B, B→A)
 *     can never produce `levels.get(A) === levels.get(B)` — proven by
 *     case analysis on `resolve()` below, not just tested empirically:
 *     whichever table's resolution starts the cycle always ends up
 *     exactly one level above the other. A *self-referencing* foreign key
 *     (e.g. `employees.manager_id → employees.id`) is a different,
 *     unaffected case — comparing a table's level to itself is trivially
 *     always equal, which is exactly what routes those connections
 *     through svgGenerator.ts's U-shape path instead of a regular elbow.
 */

/**
 * Assigns every table a level: a root table (no foreign key to another
 * table present in the model) is level 0, and any other table is
 * `max(level of every table it references) + 1`.
 *
 * Cycle handling: `resolve()` tracks which tables are currently mid-
 * resolution in `tablesInProgress`. If a table's own dependency chain
 * loops back to a table that's still being resolved (a genuine FK cycle,
 * not just recursion depth), that specific back-reference contributes 0
 * to the level calculation instead of recursing infinitely — it does not
 * skip or approximate anything else about the cycle, it only prevents
 * revisiting a table that's already on the call stack.
 */
export const assignLevels = (tables: Table[]): Map<string, number> => {
    const levels = new Map<string, number>();
    const tableByName = new Map(tables.map(table => [table.tableName, table]));

    const resolve = (tableName: string, tablesInProgress: Set<string>): number => {
        if (levels.has(tableName)) return levels.get(tableName)!;
        if (tablesInProgress.has(tableName)) return 0; // cycle guard — see module docs
        tablesInProgress.add(tableName);

        const table = tableByName.get(tableName);
        if (!table || table.foreignKey.length === 0) {
            levels.set(tableName, 0);
            tablesInProgress.delete(tableName);
            return 0;
        }

        let maxReferencedLevel = -1;
        for (const foreignKey of table.foreignKey) {
            if (foreignKey.referenceTable === tableName) continue; // self-reference, see module docs
            if (!tableByName.has(foreignKey.referenceTable)) continue;
            maxReferencedLevel = Math.max(
                maxReferencedLevel,
                resolve(foreignKey.referenceTable, tablesInProgress)
            );
        }

        const level = maxReferencedLevel + 1;
        levels.set(tableName, level);
        tablesInProgress.delete(tableName);
        return level;
    };

    tables.forEach(table => resolve(table.tableName, new Set()));
    return levels;
};

/**
 * Orders tables within each level to reduce relationship-line crossings,
 * using the barycenter heuristic: repeatedly move each table to the
 * average position of its neighbors in the adjacent level, alternating
 * forward and backward passes until the ordering stabilizes. This is the
 * same technique classic Sugiyama-style layered graph drawing uses,
 * simplified as described in this module's top-level docs.
 *
 * @returns tableName → its 0-based position within its own level.
 */
export const minimizeCrossings = (
    tables: Table[],
    levels: Map<string, number>,
    iterationCount: number = 4
): Map<string, number> => {
    const tableByName = new Map(tables.map(table => [table.tableName, table]));

    const tableNamesByLevel = new Map<number, string[]>();
    for (const table of tables) {
        const level = levels.get(table.tableName) ?? 0;
        if (!tableNamesByLevel.has(level)) tableNamesByLevel.set(level, []);
        tableNamesByLevel.get(level)!.push(table.tableName);
    }

    const sortedLevels = Array.from(tableNamesByLevel.keys()).sort((levelA, levelB) => levelA - levelB);

    const alphabeticalOrder = (): Map<string, number> => {
        const order = new Map<string, number>();
        for (const [, tableNamesInLevel] of tableNamesByLevel) {
            tableNamesInLevel.sort((nameA, nameB) => nameA.localeCompare(nameB));
            tableNamesInLevel.forEach((tableName, orderIndex) => order.set(tableName, orderIndex));
        }
        return order;
    };

    // A single level has nothing to minimize — alphabetical is as good as
    // any other stable, deterministic order.
    if (sortedLevels.length <= 1) return alphabeticalOrder();

    // Alphabetical order is also the starting point the barycenter passes
    // iterate on, so later passes have a stable, deterministic baseline.
    const order = alphabeticalOrder();

    // forwardReferences[A] = tables that A references via FK   (A → targets)
    // backwardReferences[A] = tables that reference A via FK   (sources → A)
    const forwardReferences = new Map<string, string[]>();
    const backwardReferences = new Map<string, string[]>();
    for (const table of tables) {
        forwardReferences.set(table.tableName, []);
        backwardReferences.set(table.tableName, []);
    }
    for (const table of tables) {
        for (const foreignKey of table.foreignKey) {
            if (foreignKey.referenceTable === table.tableName) continue;
            if (!tableByName.has(foreignKey.referenceTable)) continue;
            forwardReferences.get(table.tableName)!.push(foreignKey.referenceTable);
            backwardReferences.get(foreignKey.referenceTable)!.push(table.tableName);
        }
    }

    /**
     * Single barycenter pass in one direction:
     * - "forward": sweeps level 1 → max, scoring each table against its
     *   neighbors in level-1 (via forwardReferences).
     * - "backward": sweeps level max-1 → 0, scoring each table against
     *   its neighbors in level+1 (via backwardReferences).
     */
    const barycenterPass = (direction: "forward" | "backward") => {
        const startLevelIndex = direction === "forward" ? 1 : sortedLevels.length - 2;
        const endLevelIndex = direction === "forward" ? sortedLevels.length - 1 : 0;
        const levelStep = direction === "forward" ? 1 : -1;
        const adjacentLevelOffset = direction === "forward" ? -1 : 1;

        for (
            let levelIndex = startLevelIndex;
            direction === "forward" ? levelIndex <= endLevelIndex : levelIndex >= endLevelIndex;
            levelIndex += levelStep
        ) {
            const level = sortedLevels[levelIndex];
            const tableNamesInLevel = tableNamesByLevel.get(level)!;
            const adjacentLevel = level + adjacentLevelOffset;

            const scoredTableNames = tableNamesInLevel.map(tableName => {
                const neighbors = (direction === "forward" ? forwardReferences : backwardReferences).get(tableName)!;
                const neighborsInAdjacentLevel = neighbors.filter(
                    neighborName => (levels.get(neighborName) ?? 0) === adjacentLevel
                );

                if (neighborsInAdjacentLevel.length === 0) {
                    // No neighbor in the adjacent level to score against
                    // (e.g. this table's only edges skip past it — see
                    // this module's top-level docs) — keep its current
                    // position rather than guessing.
                    return { tableName, score: order.get(tableName) ?? 0 };
                }

                let orderSum = 0;
                for (const neighborName of neighborsInAdjacentLevel) orderSum += order.get(neighborName) ?? 0;
                return { tableName, score: orderSum / neighborsInAdjacentLevel.length };
            });

            // Stable sort: equal barycenters keep alphabetical order.
            scoredTableNames.sort(
                (itemA, itemB) => itemA.score - itemB.score || itemA.tableName.localeCompare(itemB.tableName)
            );
            scoredTableNames.forEach((scoredItem, orderIndex) => order.set(scoredItem.tableName, orderIndex));
        }
    };

    for (let iterationIndex = 0; iterationIndex < iterationCount; iterationIndex++) {
        barycenterPass("forward");
        barycenterPass("backward");
    }

    return order;
};

// ── Layout helpers ────────────────────────────────────────────────────

/** Rough text-width estimate used only for pre-render sizing. */
export const estimateTextWidth = (text: string, fontSize: number): number =>
    text.length * fontSize * 0.6;

/** Minimum table width so columns don't clip. */
export const calculateTableWidth = (
    columns: { name: string; type: string }[],
    fontSize: number
): number => {
    const badgeAndMarginPadding = 100; // PK/FK badge + right-margin for type
    const minWidth = 240;
    let maxContentWidth = 0;
    for (const column of columns) {
        const columnWidth =
            estimateTextWidth(column.name, fontSize) +
            estimateTextWidth(column.type, fontSize - 2);
        if (columnWidth > maxContentWidth) maxContentWidth = columnWidth;
    }
    return Math.max(minWidth, Math.ceil(maxContentWidth + badgeAndMarginPadding));
};