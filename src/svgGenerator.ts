import * as Handlebars from "handlebars";
import {
    Column,
    Connection,
    ForeignKey,
    SvgTable,
    Table,
} from "./interfaces";
import {
    assignLevels,
    calculateTableWidth,
    minimizeCrossings,
} from "./sugiyamaLayout";
import { LAYOUT, svgTemplate, tableTemplate } from "./svgTemplates";
import { detectHops, ElbowConnection, Hop, renderSegmentWithHops } from "./pathCrossings";

/**
 * Renders the ER diagram: positions every table on a layered grid
 * (sugiyama-layout.ts), routes a relationship line between every foreign
 * key and the table it references, and compiles everything into a single
 * SVG document (svg-templates.ts).
 *
 * Relationship lines carry no on-diagram text label — only the footer
 * legend (built in `svgGenerator` below) names what each colored line
 * represents. An earlier version rendered a floating label at each line's
 * midpoint; it was removed because a label's position depends only on its
 * own line's geometry, with no awareness of the tables and other lines
 * sitting on top of or behind it in a busy diagram, so it would routinely
 * end up unreadable — sitting behind a table or cut across by another
 * connection.
 */


const PALETTE = [
    "#8B29A6", "#0D0C0C", "#232dfa", "#BA1511",
    "#0692E1", "#F58804", "#1A9A5B", "#E0B800",
    "#a10000", "#3f1054", "#4419d2", "#2b8334",
];


const CORNER_R = 8;

/** Radius, in px, of the semicircular "hop" arc drawn where two
 *  different connections' lines cross. */
const HOP_RADIUS = 7;

/** Minimum distance, in px, between two hops on the same segment before
 *  they're merged into one (see path-crossings.ts's detectHops). */
const MIN_HOP_GAP = HOP_RADIUS * 2.5;

/**
 * Builds an orthogonal SVG path with rounded corners.
 *
 * - Different levels: H→V→H elbow. The vertical segment's X position
 *   (`midX`) is passed in explicitly rather than computed here, so the
 *   caller can offset it to keep overlapping lines visually separated
 *   (see `spreadVerticalSegments`). Each of the three logical segments is
 *   rendered via `renderSegmentWithHops` so any detected crossing with
 *   another connection gets a small arc "hop" at the exact crossing point
 *   (see path-crossings.ts).
 * - Same level: U-shape routed underneath both tables. This is a live,
 *   exercised path — not a rare edge case — because a self-referencing
 *   foreign key (e.g. `employees.manager_id → employees.id`) always
 *   compares a table's level to itself, which is trivially always equal.
 *   A direct cycle between two *distinct* tables never reaches this
 *   branch; see sugiyama-layout.ts's module docs for why. Hops are not
 *   yet supported on this path shape.
 */
const buildPath = (
    sourceX: number, sourceY: number,
    targetX: number, targetY: number,
    midX: number,
    sameLevel: boolean,
    sourceBottom: number,
    targetBottom: number,
    hops: Hop[]
): string => {
    if (sameLevel) {
        const routeY = Math.max(sourceBottom, targetBottom) + 40;

        // Tables nearly aligned vertically → nudge sideways
        if (Math.abs(targetX - sourceX) < CORNER_R * 3) {
            const nudgeX = sourceX + 50;
            return [
                `M ${sourceX} ${sourceBottom}`,
                `L ${sourceX} ${routeY - CORNER_R}`,
                `Q ${sourceX} ${routeY} ${nudgeX} ${routeY}`,
                `L ${nudgeX} ${routeY - CORNER_R}`,
                `L ${nudgeX} ${targetBottom}`,
            ].join(" ");
        }

        const horizontalDirection = targetX > sourceX ? 1 : -1;
        return [
            `M ${sourceX} ${sourceBottom}`,
            `L ${sourceX} ${routeY - CORNER_R}`,
            `Q ${sourceX} ${routeY} ${sourceX + horizontalDirection * CORNER_R} ${routeY}`,
            `L ${targetX - horizontalDirection * CORNER_R} ${routeY}`,
            `Q ${targetX} ${routeY} ${targetX} ${routeY - CORNER_R}`,
            `L ${targetX} ${targetBottom}`,
        ].join(" ");
    }

    // Same Y → straight horizontal. Still decomposed into the same two
    // horizontal logical segments (0 and 2) used for hop detection, so a
    // crossing detected against either half is still rendered — only the
    // (here zero-length) middle vertical segment is skipped.
    if (Math.abs(sourceY - targetY) < 1) {
        let pathData = `M ${sourceX} ${sourceY}`;
        pathData += renderSegmentWithHops(sourceX, sourceY, midX, sourceY, hops, HOP_RADIUS, 0, 0, 0);
        pathData += renderSegmentWithHops(midX, targetY, targetX, targetY, hops, HOP_RADIUS, 2, 0, 0);
        return pathData;
    }

    // H-V-H with rounded corners.
    //
    // `horizontalDirection` is the travel direction (source → mid →
    // target). Roughly half of all real connections run right-to-left (a
    // referencing table is commonly laid out to the right of the table it
    // references), so the corner inset must be applied AGAINST the
    // direction of travel (`midX - horizontalDirection * cornerRadius`),
    // not with a direction-blind `midX - cornerRadius` — using a fixed
    // subtraction there was a pre-existing bug: for right-to-left
    // connections it made the straight run overshoot past the corner
    // point before the rounding curve began, producing a small visible
    // backward kink instead of a clean rounded turn.
    const horizontalDistance = Math.abs(targetX - sourceX);
    const cornerRadius = Math.max(0, Math.min(CORNER_R, horizontalDistance / 2 - 1));
    const horizontalDirection = targetX >= sourceX ? 1 : -1;
    const verticalDirection = targetY > sourceY ? 1 : -1;

    let pathData = `M ${sourceX} ${sourceY}`;
    pathData += renderSegmentWithHops(sourceX, sourceY, midX, sourceY, hops, HOP_RADIUS, 0, 0, cornerRadius);
    if (cornerRadius > 0) pathData += ` Q ${midX} ${sourceY} ${midX} ${sourceY + verticalDirection * cornerRadius}`;
    pathData += renderSegmentWithHops(midX, sourceY, midX, targetY, hops, HOP_RADIUS, 1, cornerRadius, cornerRadius);
    if (cornerRadius > 0) pathData += ` Q ${midX} ${targetY} ${midX + horizontalDirection * cornerRadius} ${targetY}`;
    pathData += renderSegmentWithHops(midX, targetY, targetX, targetY, hops, HOP_RADIUS, 2, cornerRadius, 0);
    return pathData;
};

/** Y center of a column row inside a table (relative to table top). */
const columnRowCenterY = (columnIndex: number): number =>
    LAYOUT.headerRowHeight + columnIndex * LAYOUT.rowHeight + LAYOUT.rowHeight / 2;



/** Minimum horizontal distance between parallel vertical segments. */
const MIN_VERT_SPACING = 14;

/** True when two Y-ranges share at least one pixel. */
const rangesOverlap = (
    rangeAMin: number, rangeAMax: number,
    rangeBMin: number, rangeBMax: number
): boolean => rangeAMin <= rangeBMax && rangeBMin <= rangeAMax;

/**
 * Pre-path connection data used by the spreading algorithm.
 * Only different-level connections carry a vertical segment at midX.
 */
interface PendingConnection {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    midX: number;
    originalMidX: number;
    yMin: number;
    yMax: number;
    sameLevel: boolean;
    sourceBottom: number;
    targetBottom: number;
    sourceTable: string;
    targetTable: string;
    sourceColumn: string;
    targetColumn: string;
}

/**
 * Detects clusters of vertical segments that are too close together
 * (both in X and in Y) and spreads them apart so they run in parallel
 * without visual overlap.
 *
 * Algorithm:
 *  1. Sort non-same-level connections by midX then yMin.
 *  2. Walk the sorted list, grouping consecutive connections whose
 *     vertical segments are within MIN_VERT_SPACING in X AND overlap in Y.
 *  3. For each cluster of size > 1, redistribute midX values evenly
 *     around the cluster's centroid, clamped to stay between source and
 *     target edges.
 */
const spreadVerticalSegments = (pendingConnections: PendingConnection[]): void => {
    // Same-level connections don't have a vertical segment to spread —
    // they route as a U-shape instead (see buildPath).
    const connectionsWithVerticalSegment: PendingConnection[] = [];
    for (const connection of pendingConnections) {
        if (!connection.sameLevel) connectionsWithVerticalSegment.push(connection);
    }

    if (connectionsWithVerticalSegment.length <= 1) return;

    // Stable sort: primary by midX, secondary by yMin
    connectionsWithVerticalSegment.sort(
        (connectionA, connectionB) => connectionA.midX - connectionB.midX || connectionA.yMin - connectionB.yMin
    );

    const clusters: PendingConnection[][] = [];
    let currentCluster: PendingConnection[] = [connectionsWithVerticalSegment[0]];

    for (let connectionIndex = 1; connectionIndex < connectionsWithVerticalSegment.length; connectionIndex++) {
        const previousConnection = currentCluster[currentCluster.length - 1];
        const currentConnection = connectionsWithVerticalSegment[connectionIndex];

        const xClose = Math.abs(currentConnection.midX - previousConnection.midX) < MIN_VERT_SPACING;
        const yOverlap = rangesOverlap(
            previousConnection.yMin, previousConnection.yMax,
            currentConnection.yMin, currentConnection.yMax
        );

        if (xClose && yOverlap) {
            currentCluster.push(currentConnection);
        } else {
            clusters.push(currentCluster);
            currentCluster = [currentConnection];
        }
    }
    clusters.push(currentCluster);


    for (const cluster of clusters) {
        if (cluster.length <= 1) continue;

        // Consistent ordering within the cluster
        cluster.sort(
            (connectionA, connectionB) =>
                connectionA.originalMidX - connectionB.originalMidX || connectionA.yMin - connectionB.yMin
        );

        // Center the spread around the cluster's natural midpoint
        const centerMidX =
            cluster.reduce((sum, connection) => sum + connection.originalMidX, 0) / cluster.length;
        const totalSpan = (cluster.length - 1) * MIN_VERT_SPACING;
        const spreadStartX = centerMidX - totalSpan / 2;

        for (let positionIndex = 0; positionIndex < cluster.length; positionIndex++) {
            const newMidX = spreadStartX + positionIndex * MIN_VERT_SPACING;

            // Clamp so the vertical segment stays between source and target X
            const minAllowedX = Math.min(cluster[positionIndex].sourceX, cluster[positionIndex].targetX) + MIN_VERT_SPACING;
            const maxAllowedX = Math.max(cluster[positionIndex].sourceX, cluster[positionIndex].targetX) - MIN_VERT_SPACING;
            cluster[positionIndex].midX = Math.max(minAllowedX, Math.min(maxAllowedX, newMidX));
        }
    }
};


const tableTemplateCompiled = Handlebars.compile(tableTemplate);

interface PositionedTable extends SvgTable {
    level: number;
    columns: Column[];
}

const tablesGenerator = (
    tables: Table[],
    levels: Map<string, number>,
    order: Map<string, number>
): PositionedTable[] => {
    const tablesByLevel = new Map<number, Table[]>();
    for (const table of tables) {
        const level = levels.get(table.tableName) ?? 0;
        if (!tablesByLevel.has(level)) tablesByLevel.set(level, []);
        tablesByLevel.get(level)!.push(table);
    }

    const sortedLevels = Array.from(tablesByLevel.keys()).sort((levelA, levelB) => levelA - levelB);

    const tableWidthByName = new Map<string, number>();
    for (const table of tables) {
        tableWidthByName.set(table.tableName, calculateTableWidth(table.column, LAYOUT.fontSize));
    }

    // Every level occupies its own horizontal band, wide enough for the
    // widest table in it, so tables in the next level never overlap it.
    const xPositionByLevel = new Map<number, number>();
    let cursorX = LAYOUT.origin.x;
    for (const level of sortedLevels) {
        xPositionByLevel.set(level, cursorX);
        const maxWidthInLevel = Math.max(
            ...tablesByLevel.get(level)!.map(table => tableWidthByName.get(table.tableName)!)
        );
        cursorX += maxWidthInLevel + LAYOUT.padding.x;
    }

    const positionedTables: PositionedTable[] = [];

    for (const level of sortedLevels) {
        const orderedTablesInLevel = tablesByLevel
            .get(level)!
            .slice()
            .sort(
                (tableA, tableB) =>
                    (order.get(tableA.tableName) ?? 0) - (order.get(tableB.tableName) ?? 0)
            );

        let cursorY = LAYOUT.origin.y;

        for (const table of orderedTablesInLevel) {
            const tableWidth = tableWidthByName.get(table.tableName)!;
            const tableHeight =
                LAYOUT.headerRowHeight +
                table.column.length * LAYOUT.rowHeight +
                26;

            const templateColumns = table.column.map((column, columnIndex) => ({
                ...column,
                rowY: LAYOUT.headerRowHeight + columnIndex * LAYOUT.rowHeight,
                rowH: LAYOUT.rowHeight,
                rowWidth: tableWidth - 2,
                rowFill: columnIndex % 2 === 1 ? "#f7f5fa" : "#ffffff",
                typeX: tableWidth - 15,
                nameWeight: column.isPK || column.isFK ? "700" : "500",
            }));

            const pkCount = table.column.filter(column => column.isPK).length;
            const fkCount = table.column.filter(column => column.isFK).length;
            const plainCount = table.column.length - pkCount - fkCount;

            const tableMarkup = tableTemplateCompiled({
                tableName: table.tableName,
                tableWidth,
                tableHeight,
                level,
                columnCount: table.column.length,
                enrichedColumns: templateColumns,
                tableFooterY:
                    LAYOUT.headerRowHeight + table.column.length * LAYOUT.rowHeight,
                tableFooterTextY:
                    LAYOUT.headerRowHeight +
                    table.column.length * LAYOUT.rowHeight +
                    17,
                pkCount,
                fkCount,
                plainCount,
            });

            positionedTables.push({
                tableName: table.tableName,
                tableMarkup,
                posX: xPositionByLevel.get(level)!,
                posY: cursorY,
                tableWidth,
                tableHeight,
                columns: table.column,
                foreignKey: table.foreignKey,
                level,
            });

            cursorY += tableHeight + LAYOUT.padding.y;
        }
    }

    return positionedTables;
};


/**
 * Builds one relationship connection per foreign key: resolves its exact
 * source/target endpoints (which row on each table's edge), spreads out
 * any that would otherwise overlap (`spreadVerticalSegments`), detects
 * line crossings and assigns arc-jump hops (`detectHops`), then renders
 * every connection's final SVG path (`buildPath`).
 */
const connectionsGenerator = (
    tables: Table[],
    svgTables: PositionedTable[],
    levels: Map<string, number>
): (Connection & { colorIndex: number })[] => {
    const svgTableByName = new Map(svgTables.map(table => [table.tableName, table]));
    const pendingConnections: PendingConnection[] = [];

    for (const table of tables) {
        const source = svgTableByName.get(table.tableName);
        if (!source) continue;

        for (const foreignKey of table.foreignKey) {
            const target = svgTableByName.get(foreignKey.referenceTable);
            if (!target) continue;

            const sameLevel =
                (levels.get(table.tableName) ?? 0) ===
                (levels.get(foreignKey.referenceTable) ?? 0);

            let sourceX: number, sourceY: number, targetX: number, targetY: number;

            if (sameLevel) {
                sourceX = source.posX + source.tableWidth / 2;
                sourceY = source.posY + source.tableHeight;
                targetX = target.posX + target.tableWidth / 2;
                targetY = target.posY + target.tableHeight;
            } else {
                const foreignKeyColumnIndex = source.columns.findIndex(
                    column => column.name === foreignKey.foreignKey
                );
                const sourceRowY =
                    foreignKeyColumnIndex >= 0
                        ? columnRowCenterY(foreignKeyColumnIndex)
                        : source.tableHeight / 2;

                const targetTableData =
                    tables.find(t => t.tableName === foreignKey.referenceTable) ?? table;
                const targetPrimaryKeyName = targetTableData.primaryKeyName ?? "id";
                const primaryKeyColumnIndex = target.columns.findIndex(
                    column => column.name === targetPrimaryKeyName
                );
                const targetRowY =
                    primaryKeyColumnIndex >= 0
                        ? columnRowCenterY(primaryKeyColumnIndex)
                        : target.tableHeight / 2;

                const sourceOnRight = source.posX < target.posX;
                sourceX = source.posX + (sourceOnRight ? source.tableWidth : 0);
                sourceY = source.posY + sourceRowY;
                targetX = target.posX + (sourceOnRight ? 0 : target.tableWidth);
                targetY = target.posY + targetRowY;
            }

            const midX = (sourceX + targetX) / 2;

            pendingConnections.push({
                sourceX,
                sourceY,
                targetX,
                targetY,
                midX,
                originalMidX: midX,
                yMin: Math.min(sourceY, targetY),
                yMax: Math.max(sourceY, targetY),
                sameLevel,
                sourceBottom: source.posY + source.tableHeight,
                targetBottom: target.posY + target.tableHeight,
                sourceTable: table.tableName,
                targetTable: foreignKey.referenceTable,
                sourceColumn: foreignKey.foreignKey,
                targetColumn:
                    tables.find(t => t.tableName === foreignKey.referenceTable)
                        ?.primaryKeyName ?? "id",
            });
        }
    }

    spreadVerticalSegments(pendingConnections);

    // Scope (phase 1): only different-level (H-V-H elbow) connections are
    // considered — same-level (U-shape) connections are excluded, see
    // path-crossings.ts's module documentation.
    const elbowConnections: ElbowConnection[] = pendingConnections
        .map((connection, index) => ({ connection, index }))
        .filter(({ connection }) => !connection.sameLevel)
        .map(({ connection, index }) => ({
            index,
            segments: [
                { x1: connection.sourceX, y1: connection.sourceY, x2: connection.midX, y2: connection.sourceY },
                { x1: connection.midX, y1: connection.sourceY, x2: connection.midX, y2: connection.targetY },
                { x1: connection.midX, y1: connection.targetY, x2: connection.targetX, y2: connection.targetY },
            ] as [
                { x1: number; y1: number; x2: number; y2: number },
                { x1: number; y1: number; x2: number; y2: number },
                { x1: number; y1: number; x2: number; y2: number }
            ],
        }));

    const hopsByConnectionIndex = detectHops(elbowConnections, MIN_HOP_GAP);

    const connections: (Connection & { colorIndex: number })[] = [];

    for (let connectionIndex = 0; connectionIndex < pendingConnections.length; connectionIndex++) {
        const connection = pendingConnections[connectionIndex];

        const pathData = buildPath(
            connection.sourceX, connection.sourceY, connection.targetX, connection.targetY,
            connection.midX,
            connection.sameLevel,
            connection.sourceBottom,
            connection.targetBottom,
            hopsByConnectionIndex.get(connectionIndex) ?? []
        );

        const colorIndex = connectionIndex % PALETTE.length;

        connections.push({
            sourcePosX: connection.sourceX,
            sourcePosY: connection.sourceY,
            targetPosX: connection.targetX,
            targetPosY: connection.targetY,
            color: PALETTE[colorIndex],
            colorIndex,
            label: "",
            sourceColumn: connection.sourceColumn,
            targetColumn: connection.targetColumn,
            sourceTable: connection.sourceTable,
            targetTable: connection.targetTable,
            pathData,
            labelX: 0,
            labelY: 0,
        });
    }

    return connections;
};

const svgTemplateCompiled = Handlebars.compile(svgTemplate);

/**
 * Renders a complete ER diagram (as an SVG document string) from the
 * intermediate, enriched Table[] model.
 *
 * @throws {Error} If `databaseTables` is empty — there is nothing
 *         meaningful to lay out or render.
 */
export const svgGenerator = (databaseTables: Table[]): string => {
    if (databaseTables.length === 0)
        throw new Error("No tables found");

    const levels = assignLevels(databaseTables);
    const order = minimizeCrossings(databaseTables, levels);
    const svgTables = tablesGenerator(databaseTables, levels, order);
    const connections = connectionsGenerator(databaseTables, svgTables, levels);

    const maxX = Math.max(...svgTables.map(table => table.posX + table.tableWidth));
    const maxY = Math.max(...svgTables.map(table => table.posY + table.tableHeight));

    const svgWidth = Math.max(1200, maxX + LAYOUT.padding.x);
    const contentHeight = maxY + LAYOUT.padding.y;
    const legendY = contentHeight;
    const legendWidth = Math.min(560, svgWidth - 80);
    const footerY = legendY + LAYOUT.legendHeight + 40;
    const svgHeight = footerY + LAYOUT.footerHeight;

    let totalColumns = 0;
    let totalPrimaryKeys = 0;
    let totalForeignKeys = 0;
    for (const table of svgTables) {
        totalColumns += table.columns.length;
        totalPrimaryKeys += table.columns.filter(column => column.isPK).length;
        totalForeignKeys += table.columns.filter(column => column.isFK).length;
    }

    const levelValues = Array.from(
        new Set(svgTables.map(table => table.level))
    ).sort((levelA, levelB) => levelA - levelB);

    const referencedTableNames = new Set<string>();
    for (const table of databaseTables)
        for (const foreignKey of table.foreignKey) referencedTableNames.add(foreignKey.referenceTable);

    const stats = {
        tables: svgTables.length,
        columns: totalColumns,
        primaryKeys: totalPrimaryKeys,
        foreignKeys: totalForeignKeys,
        relationships: connections.length,
        levels: levelValues.length,
        rootTables: svgTables.filter(table => table.level === 0).length,
        leafTables: svgTables.filter(
            table => !referencedTableNames.has(table.tableName)
        ).length,
        avgColumns: (totalColumns / svgTables.length).toFixed(1),
    };

    const legendRelationships = connections.slice(0, 8).map((connection, index) => ({
        color: connection.color,
        label: `${connection.sourceTable}.${connection.sourceColumn} → ${connection.targetTable}.${connection.targetColumn}`,
        yPos: 60 + index * 12,
    }));

    const arrowMarkers = PALETTE.map((color, index) => ({ color, index }));

    return svgTemplateCompiled({
        svgWidth,
        svgHeight,
        headerHeight: LAYOUT.headerHeight,
        footerHeight: LAYOUT.footerHeight,
        legendHeight: LAYOUT.legendHeight,
        legendWidth,
        gridAreaHeight: svgHeight - LAYOUT.headerHeight - LAYOUT.footerHeight,
        gridSize: LAYOUT.gridSize,
        gridSizeMajor: LAYOUT.gridSize * 4,
        tables: svgTables,
        connections,
        legendY,
        footerY,
        stats,
        legendRelationships,
        arrowMarkers,
    });
};