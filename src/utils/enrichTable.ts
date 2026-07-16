import { Table } from "../interfaces";

export const enrichTables = (tables: Table[]): Table[] => {

    // First pass: calculate isPK for all columns in all tables
    const enrichedTables = tables.map(table => {
        const columns = table.column.map(column => {
            let isPK = false;

            if (column.type.toUpperCase().includes("PRIMARY KEY")) {
                isPK = true;
            } else {
                const lower = column.name.toLowerCase();
                isPK =
                    lower === "id" ||
                    lower === `${table.tableName.toLowerCase()}_id`;
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

    // Second pass: calculate isFK and fkReference using already-enriched tables
    const enrichedMap = new Map(enrichedTables.map(t => [t.tableName, t]));

    return enrichedTables.map(table => {
        const columns = table.column.map(column => {
            //----------------------------------
            // FOREIGN KEY
            //----------------------------------
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

        //----------------------------------
        // PRIMARY KEY NAME (for easy access)
        //----------------------------------
        const primaryKeyName = columns.find(c => c.isPK)?.name ?? 'id';

        return {
            ...table,
            column: columns,
            primaryKeyName
        };
    });

};