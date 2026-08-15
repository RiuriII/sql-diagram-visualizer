import { Table } from "../interfaces";

/**
 * Enriches intermediate Table objects with inferred relational metadata.
 *
 * This function takes the intermediate table representation produced by the
 * State Machine and infers primary and foreign key metadata. The enrichment
 * is performed in two passes to ensure primary keys are available before
 * resolving foreign key references across tables.
 *
 * Rather than performing additional SQL parsing, this step relies on
 * naming heuristics and the metadata already extracted during parsing.
 *
 * @param tables - Intermediate Table objects produced by the State Machine.
 * @returns The enriched Table objects with inferred primary and foreign key metadata.
 */
export const enrichTables = (tables: Table[]): Table[] => {

    // First pass: infer primary key metadata for every table.
    const enrichedTables = tables.map(table => {
        const columns = table.column.map(column => {
            let isPK = false;

            if (column.type.toUpperCase().includes("PRIMARY KEY")) {
                isPK = true;
            } else {
                const lowerColumnName  = column.name.toLowerCase();
                isPK =
                    lowerColumnName  === "id" ||
                    lowerColumnName  === `${table.tableName.toLowerCase()}_id`;
            }

            return {
                ...column,
                isPK,
                isFK: false,
                fkReference: undefined
            };
        });

        return {
            ...table,
            column: columns
        };
    });

    // Second pass: resolve foreign key metadata using the inferred primary keys.
    const enrichedMap = new Map(enrichedTables.map(t => [t.tableName, t]));

    return enrichedTables.map(table => {
        const columns = table.column.map(column => {
            
            const fk = table.foreignKey.find(
                foreignKey => foreignKey.foreignKey === column.name
            );

            let fkReference: string | undefined;

            if (fk) {
                const referencedTable = enrichedMap.get(fk.referenceTable);
                const referencedPK =
                    referencedTable?.column.find(c => c.isPK)?.name
                    ?? "id";

                fkReference = `${fk.referenceTable}.${referencedPK}`;
            }

            return {
                ...column,
                isFK: !!fk,
                fkReference
            };
        });

      
        const primaryKeyName = columns.find(c => c.isPK)?.name ?? 'id';

        return {
            ...table,
            column: columns,
            primaryKeyName
        };
    });

};