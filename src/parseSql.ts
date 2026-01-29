import { Column, Table, SqlBlock } from "./interfaces";
import { cleanSql } from "./utils/cleanSql";

/**
 * Groups SQL lines into logical blocks representing CREATE TABLE statements.
 * Each block contains a header (CREATE TABLE line) and a body (columns and constraints).
 * 
 * @param lines - Array of SQL lines already cleaned/normalized
 * @returns Array of SQL blocks with structure {header, body[]}
 * 
 * @example
 * const lines = [
 *   "CREATE TABLE users (",
 *   "id INT,",
 *   "name VARCHAR(100)",
 *   ")",
 *   "CREATE TABLE orders (",
 *   "order_id INT",
 *   ")"
 * ];
 * const blocks = groupIntoBlocks(lines);
 * // [
 * //   { header: "CREATE TABLE users (", body: ["id INT,", "name VARCHAR(100)", ")"] },
 * //   { header: "CREATE TABLE orders (", body: ["order_id INT", ")"] }
 * // ]
 */
const groupIntoBlocks = (lines: string[]): SqlBlock[] => {
  const blocks: SqlBlock[] = [];
  let currentBlock: SqlBlock | null = null;

  for (const line of lines) {
    // Início de um novo bloco CREATE TABLE
    if (/^CREATE\s+TABLE/i.test(line)) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { header: line, body: [] };
      continue;
    }

    // Adiciona linha ao bloco atual
    if (currentBlock) {
      currentBlock.body.push(line);
    }
  }

  if (currentBlock) blocks.push(currentBlock);
  return blocks;
};

/**
 * Extracts the table name from a CREATE TABLE header.
 *
 * Supports optional IF NOT EXISTS and various quoting styles.
 * - CREATE TABLE `tableName` ...
 * - CREATE TABLE IF NOT EXISTS tableName ...
 * - CREATE TABLE [tableName] ...
 * - CREATE TABLE tableName ...
 * - CREATE TABLE "table.Name" ...
 * @param header - The CREATE TABLE header line
 * @returns The table name or null if not found
 */
const extractTableName = (header: string): string | null => {
  const match = header.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"'[]?([\w.]+)[`"'\]]?/i
  );
  return match?.[1] || null;
};


/**
 * Processes FOREIGN KEY definitions that may span multiple lines.
 * Combines sequential lines until a complete FOREIGN KEY statement is found.
 * 
 * Supports formats:
 * - FOREIGN KEY (column) REFERENCES table(column)
 * - CONSTRAINT fk_name FOREIGN KEY (column) REFERENCES table(column)
 * 
 * @param lines - Array of table body lines
 * @param startIndex - Starting index to begin the search
 * @returns Object with FK data and number of consumed lines, or null if not found
 */
const extractForeignKey = (lines: string[], startIndex: number): {
  foreignKey: string;
  referenceTable: string;
  referenceColumn: string;
  linesConsumed: number;
} | null => {
  const combinedLines: string[] = [];
  let i = startIndex;

  // collect lines until a complete FOREIGN KEY statement is found
  while (i < lines.length) {
    combinedLines.push(lines[i]);
    const combined = combinedLines.join(" ");

    // Try to match complete FOREIGN KEY definition
    const match = combined.match(
      /(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)\s+REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)/i
    );

    if (match) {
      return {
        foreignKey: match[1],
        referenceTable: match[2],
        referenceColumn: match[3],
        linesConsumed: i - startIndex + 1
      };
    }

    i++;
    
    // Protect against infinite loop
    if (i - startIndex > 10) break;
  }

  return null;
};

/**
 * Extracts column definition from a line.
 * Ignore
 * - PRIMARY KEY
 * - UNIQUE
 * - INDEX / KEY
 * - CONSTRAINT
 * - FOREIGN KEY
 * - CHECK
 * @param line - A line from the table body
 * @returns Column definition or null if not a column definition
 */
const extractColumnDefinition = (line: string): Column | null => {
  
  if (
    /^\s*PRIMARY\s+KEY/i.test(line) ||
    /^\s*UNIQUE/i.test(line) ||
    /^\s*INDEX/i.test(line) ||
    /^\s*KEY/i.test(line) ||
    /^\s*CONSTRAINT/i.test(line) ||
    /^\s*FOREIGN\s+KEY/i.test(line) ||
    /^\s*CHECK/i.test(line)
  ) {
    return null;
  }

  // const columnRegex = /^\s*([\w_]+)\s+([^,]+)/i;
  const columnRegex = /^\s*([\w_]+)\s+(.+)/i; 
  const match = line.match(columnRegex);
  
  if (!match) return null;

  const name = match[1];
  let type = match[2].trim();

  // Remove trailing comma if exists
  type = type.replace(/,\s*$/, '');

  return { name, type };
};


/**
 * Processes a complete SQL block (CREATE TABLE) and extracts its columns and foreign keys.
 * Iterates through the block body, identifying and processing each type of element.
 *
 * @param block - SQL block with header (CREATE TABLE) and body (definitions)
 * @returns Complete Table object or null if table name is not found
 *
 * @example
 * const block = {
 *   header: "CREATE TABLE users (",
 *   body: [
 *     "id INT,",
 *     "name VARCHAR(100),",
 *     "PRIMARY KEY (id),",
 *     "FOREIGN KEY (dept_id) REFERENCES departments(id)",
 *     ")"
 *   ]
 * };
 * const table = processBlock(block);
 * // {
 * //   tableName: "users",
 * //   column: [
 * //     { name: "id", type: "INT" },
 * //     { name: "name", type: "VARCHAR(100)" }
 * //   ],
 * //   foreignKey: [
 * //     { foreignKey: "dept_id", referenceTable: "departments" }
 * //   ]
 * // }
 */
const processBlock = (block: SqlBlock): Table | null => {
  const tableName = extractTableName(block.header);
  if (!tableName) return null;

  const table: Table = {
    tableName,
    column: [],
    foreignKey: []
  };

  let i = 0;
  while (i < block.body.length) {
    const line = block.body[i];

    // Try to process FOREIGN KEY (may span multiple lines)
    if (/FOREIGN\s+KEY/i.test(line) || /CONSTRAINT.*FOREIGN/i.test(line)) {
      const fkResult = extractForeignKey(block.body, i);
      if (fkResult) {
        table.foreignKey.push({
          foreignKey: fkResult.foreignKey,
          referenceTable: fkResult.referenceTable
        });
        i += fkResult.linesConsumed;
        continue;
      }
    }

    // Try to process column
    const column = extractColumnDefinition(line);
    if (column) {
      table.column.push(column);
    }

    i++;
  }

  return table;
};



/**
 * Função principal que faz o parsing completo de um arquivo SQL.
 * Converte SQL raw em uma estrutura JSON de tabelas com colunas e foreign keys.
 * 
 * Fluxo de processamento:
 * 1. Limpa e normaliza o SQL (remove comentários, normaliza espaços)
 * 2. Agrupa linhas em blocos CREATE TABLE
 * 3. Processa cada bloco extraindo tabelas, colunas e FKs
 * 4. Valida que pelo menos uma tabela foi encontrada
 * 
 * @param sql - String contendo o código SQL completo
 * @returns Array de objetos Table com estrutura completa
 * @throws {Error} Se nenhuma tabela for encontrada ou se houver erro no parsing
 * 
 * @example
 * const sql = `
 *   CREATE TABLE users (
 *     id INT PRIMARY KEY,
 *     name VARCHAR(100) NOT NULL
 *   );
 *   
 *   CREATE TABLE orders (
 *     order_id INT PRIMARY KEY,
 *     user_id INT,
 *     FOREIGN KEY (user_id) REFERENCES users(id)
 *   );
 * `;
 * 
 * const tables = parseSql(sql);
 * // [
 * //   {
 * //     tableName: "users",
 * //     column: [
 * //       { name: "id", type: "INT PRIMARY KEY" },
 * //       { name: "name", type: "VARCHAR(100) NOT NULL" }
 * //     ],
 * //     foreignKey: []
 * //   },
 * //   {
 * //     tableName: "orders",
 * //     column: [
 * //       { name: "order_id", type: "INT PRIMARY KEY" },
 * //       { name: "user_id", type: "INT" }
 * //     ],
 * //     foreignKey: [
 * //       { foreignKey: "user_id", referenceTable: "users" }
 * //     ]
 * //   }
 * // ]
 */
export const parseSql = (sql: string): Table[] => {
  try {
    const cleanedSql = cleanSql(sql);
    const blocks = groupIntoBlocks(cleanedSql);
    
    const tables: Table[] = [];
    
    for (const block of blocks) {
      const table = processBlock(block);
      if (table && table.column.length > 0) {
        tables.push(table);
      }
    }

    if (tables.length === 0) {
      throw new Error("No table found in SQL or empty table definitions");
    }

    return tables;
  } catch (err: any) {
    console.error("Failed to parse SQL:", err);
    throw new Error(`Failed to convert file: ${err.message}`);
  }
};