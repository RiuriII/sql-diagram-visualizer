import { Column, Table } from "./interfaces";

// Clean SQL to remove unnecessary lines
const cleanSql = (sqlContent: string): string[] => {
    return sqlContent.split('\n')
        .filter(line => !line.trim().match(/^(CREATE DATABASE|USE library|CREATE TABLE\s+\w+\.\w+\s+LIKE\s+\w+\.\w+|--|#)/i));
};

// Parses a column definition line and extracts the name and type
const extractColumnDefinition = (line: string): Column | null => {
    // Regex to match column definition
    const columnRegex = /^\s*([\w_]+)\s+([^,]+)/i;
    const columnMatch = line.match(columnRegex);

    if (!columnMatch) {
        return null;
    }
    const name = columnMatch[1];
    const type = columnMatch[2];
    return { name, type };
};

// Parses special column types (like ENUM or DECIMAL) with additional parameters
const extractSpecialColumnType = (type: string, line: string): RegExpMatchArray | null => {
    // Regex to match special type
    const specialTypeRegex = new RegExp(`^\\s*([\\w_]+)\\s+${type}\\s*\\(([^)]+)\\)\\s*([^,]*)`, 'i');
    return line.match(specialTypeRegex);

};

// Main function to parse SQL statements into a structured format
export const parseSql = (sql: string): Table[] => {

    let schemaJson: Table[] = [];

    // Special column types to handle
    const specialTypes = ['ENUM', 'DECIMAL'];

    const cleanedSql = cleanSql(sql);


    for (const line of cleanedSql) {
        const { length, [length - 1]: lastSchema } = schemaJson;

        if (line.match(/CREATE TABLE/)) {
            // Extract table name
            const tableName = line.split(' ')[2];
            schemaJson.push({ tableName, column: [], foreignKey: [] });
            continue;
        }

        const foreignKeyRegex = /FOREIGN KEY\((\w+)\) REFERENCES (\w+)\((\w+)\)/;
        const foreignKeyMatch = line.match(foreignKeyRegex);

        if (foreignKeyMatch) {
            const foreignKey = foreignKeyMatch[1];
            const referenceTable = foreignKeyMatch[2];
            lastSchema.foreignKey.push({ foreignKey, referenceTable });
            continue;
        }

        let matchedSpecialType = false;

        for (const type of specialTypes) {

            const specialTypeMatch = extractSpecialColumnType(type, line);

            if (specialTypeMatch) {
                const name = specialTypeMatch[1];
                const typeDef = `${type}(${specialTypeMatch[2]}) ${specialTypeMatch[3].trim()}`;
                lastSchema.column.push({ name, type: typeDef });
                matchedSpecialType = true;
                break;
            }
        }

        // Handle standard column types
        if (!matchedSpecialType) {
            const columnDefinition: Column | null = extractColumnDefinition(line);

            if (columnDefinition) {
                const { name, type } = columnDefinition;
                lastSchema.column.push({ name, type });
            }
        }

    }
    

    if(schemaJson.length === 0 ||  schemaJson[0].column.length === 0) {       
        throw new Error('No table found in SQL');
    }

    return schemaJson;

};

