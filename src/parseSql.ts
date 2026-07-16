import { Column, Table, SqlBlock } from "./interfaces";
import { cleanMysql } from "./utils/cleanSql";
import { enrichTables } from "./utils/enrichTable";

/**
 * Counts the net change in parenthesis depth for a line (e.g. "(" adds 1, ")" subtracts 1).
 * Used to detect where a CREATE TABLE statement's column list actually closes,
 * instead of naively assuming the statement ends right before the next CREATE TABLE.
 */
const countParenDelta = (line: string): number => {
  let delta = 0;
  for (const ch of line) {
    if (ch === "(") delta++;
    else if (ch === ")") delta--;
  }
  return delta;
};

/**
 * Groups SQL lines into logical blocks representing CREATE TABLE statements.
 * Each block contains a header (CREATE TABLE line) and a body (columns and constraints).
 *
 * A block is closed when the parenthesis depth opened by the CREATE TABLE
 * header returns to zero (i.e. the column-list parenthesis has closed), not
 * simply when the next CREATE TABLE line appears. This matters because real
 * dumps commonly place other statements between two CREATE TABLE statements
 * (e.g. ALTER TABLE ... OWNER TO, CREATE SEQUENCE, COMMENT ON ...). Lines
 * that appear outside of an open CREATE TABLE statement are intentionally
 * ignored, instead of being misattributed as columns of the previous table.
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
  let depth = 0;
  let inStatement = false;

  for (const line of lines) {
    // Início de um novo bloco CREATE TABLE (só reconhecido fora de um bloco já aberto)
    if (!inStatement && /^CREATE\s+TABLE/i.test(line)) {
      currentBlock = { header: line, body: [] };
      inStatement = true;
      depth = countParenDelta(line);

      if (depth <= 0) {
        // Statement completo já na própria linha do header (raro, mas possível)
        blocks.push(currentBlock);
        currentBlock = null;
        inStatement = false;
        depth = 0;
      }
      continue;
    }

    // Adiciona linha ao bloco atual, apenas se estivermos dentro de um statement aberto
    if (inStatement && currentBlock) {
      currentBlock.body.push(line);
      depth += countParenDelta(line);

      if (depth <= 0) {
        blocks.push(currentBlock);
        currentBlock = null;
        inStatement = false;
        depth = 0;
      }
    }
    // Linhas fora de um statement CREATE TABLE aberto (ex: ALTER TABLE, COMMENT ON,
    // CREATE SEQUENCE entre duas tabelas) são intencionalmente descartadas aqui.
  }

  // Statement que nunca fechou (SQL truncado/malformado): devolve o que foi coletado
  if (currentBlock) blocks.push(currentBlock);
  return blocks;
};

// /**
//  * Extracts the table name from a CREATE TABLE header.
//  *
//  * Supports optional IF NOT EXISTS and various quoting styles.
//  * - CREATE TABLE `tableName` ...
//  * - CREATE TABLE IF NOT EXISTS tableName ...
//  * - CREATE TABLE [tableName] ...
//  * - CREATE TABLE tableName ...
//  * - CREATE TABLE "table.Name" ...
//  * @param header - The CREATE TABLE header line
//  * @returns The table name or null if not found
//  */
// const extractTableName = (header: string): string | null => {
//   const match = header.match(
//     /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"'[]?([\w.]+)[`"'\]]?/i
//   );
//   return match?.[1] || null;
// };

/**
 * Extracts the table name from a CREATE TABLE header.
 *
 * Supports optional IF NOT EXISTS and various quoting styles.
 * - CREATE TABLE `tableName` ...
 * - CREATE TABLE `Table Name` ...        (quoted identifier, may contain spaces)
 * - CREATE TABLE IF NOT EXISTS tableName ...
 * - CREATE TABLE tableName ...
 * - CREATE TABLE "table.Name" ...
 * - CREATE TABLE "Table Name" ...
 *
 * Quoted identifiers are matched with their opening/closing quote character
 * paired explicitly (backtick-to-backtick, quote-to-quote, bracket-to-bracket)
 * so the captured name can safely contain spaces - unquoted identifiers never
 * contain spaces in valid SQL, so that path is unchanged.
 *
 * @param header - The CREATE TABLE header line
 * @returns The table name or null if not found
 */
const extractTableName = (header: string): string | null => {
  // Quoted identifier: capture everything between the matching pair of
  // quote characters, spaces included.
  const quotedMatch = header.match(
     /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w.]+\.)?(?:`([^`]+)`|"([^"]+)"|\[([^\]]+)\])/i
  );
  if (quotedMatch) {
    return quotedMatch[1] ?? quotedMatch[2] ?? quotedMatch[3] ?? null;
  }
 
  // Unquoted identifier: word chars and dots only (unchanged - unquoted SQL
  // identifiers cannot contain spaces).
  const unquotedMatch = header.match(
     /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w.]+\.)?([\w.]+)/i
  );
  return unquotedMatch?.[1] || null;
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
    // Suporta identificadores entre crases/aspas (`col`, "col", 'col'), comuns
    // em dumps do mysqldump, além de identificadores sem aspas.
    const match = combined.match(
      /(?:CONSTRAINT\s+["'`]?\w+["'`]?\s+)?FOREIGN\s+KEY\s*\(\s*["'`]?(\w+)["'`]?\s*\)\s+REFERENCES\s+["'`]?(\w+)["'`]?\s*\(\s*["'`]?(\w+)["'`]?\s*\)/i
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
 * Maximum number of lines a single column definition is allowed to span
 * (e.g. a multi-line MySQL ENUM). This is a deliberate, accepted limit:
 * SQL that is more malformed/unusual than this is treated as unsupported
 * rather than guessed at. Mirrors the same style of safety cap already
 * used by extractForeignKey.
 */
const MAX_COLUMN_DEFINITION_LINES = 10;

/**
 * Extracts a column definition starting at a given line, combining
 * subsequent lines when the definition spans multiple lines.
 *
 * The most common real-world case for this is a MySQL ENUM split across
 * lines, e.g.:
 *   status ENUM(
 *     'active',
 *     'inactive',
 *     'pending'
 *   ) NOT NULL,
 *
 * Uses the same parenthesis-depth strategy already used elsewhere in this
 * file (countParenDelta / groupIntoBlocks / extractForeignKey): if the
 * starting line leaves an open parenthesis, keep consuming lines until the
 * depth returns to zero (or below, for a closing line like ") NOT NULL,").
 * Single-line definitions - the common case - resolve on the first line
 * with the exact same behavior as before this change.
 *
 * Ignore:
 * - PRIMARY KEY
 * - UNIQUE
 * - INDEX / KEY
 * - CONSTRAINT
 * - FOREIGN KEY
 * - CHECK
 *
 * @param lines - Array of table body lines
 * @param startIndex - Index of the line where the definition starts
 * @returns The Column and number of lines consumed, or null if the line is
 *          not a column definition, or if an opened parenthesis never
 *          closes within MAX_COLUMN_DEFINITION_LINES (known, accepted
 *          limitation - not something we try to recover from).
 */
const extractColumnDefinition = (lines: string[], startIndex: number): {
  column: Column;
  linesConsumed: number;
} | null => {
  const firstLine = lines[startIndex];

  if (
    /^\s*PRIMARY\s+KEY\b/i.test(firstLine) ||
    /^\s*UNIQUE\b/i.test(firstLine) ||
    /^\s*INDEX\b/i.test(firstLine) ||
    /^\s*KEY\b/i.test(firstLine) ||
    /^\s*CONSTRAINT\b/i.test(firstLine) ||
    /^\s*FOREIGN\s+KEY\b/i.test(firstLine) ||
    /^\s*CHECK\b/i.test(firstLine)
  ) {
    return null;
  }

  const combinedLines: string[] = [];
  let depth = 0;
  let i = startIndex;

  while (i < lines.length) {
    combinedLines.push(lines[i]);
    depth += countParenDelta(lines[i]);

    if (depth <= 0) break;

    i++;
    if (i - startIndex >= MAX_COLUMN_DEFINITION_LINES) {
      // Parenthesis never closed within the supported range: known,
      // accepted limitation - do not guess, just give up on this line.
      return null;
    }
  }

  if (depth > 0) return null; // ran out of lines without closing

  const combined = combinedLines.join(" ").trim();

  // const columnRegex = /^\s*([\w_]+)\s+([^,]+)/i;
  const columnRegex = /^\s*([\w_]+)\s+(.+)/i;
  const match = combined.match(columnRegex);

  if (!match) return null;

  const name = match[1];
  let type = match[2].trim();

  // Remove trailing comma if exists
  type = type.replace(/,\s*$/, '');

  return { column: { name, type }, linesConsumed: i - startIndex + 1 };
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

    // Try to process column (may span multiple lines, e.g. multi-line ENUM)
    const columnResult = extractColumnDefinition(block.body, i);
    if (columnResult) {
      table.column.push(columnResult.column);
      i += columnResult.linesConsumed;
      continue;
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
    const cleanedSql = cleanMysql(sql);
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

    return enrichTables(tables);
  } catch (err: any) {
    console.error("Failed to parse SQL:", err);
    throw new Error(`Failed to convert file: ${err.message}`);
  }
};