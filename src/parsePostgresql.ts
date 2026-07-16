import { Column, Table, SqlBlock } from "./interfaces";
import { cleanPostgresql } from "./utils/cleanSql";
import { enrichTables } from "./utils/enrichTable";

/**
 * Counts the net change in parenthesis depth for a line (e.g. "(" adds 1, ")" subtracts 1).
 * Used to detect where a CREATE TABLE statement's column list actually closes.
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
 * Groups SQL lines into logical CREATE TABLE blocks for PostgreSQL.
 * Handles PostgreSQL-specific formatting (public schema, IF NOT EXISTS, etc.).
 *
 * A block closes when the parenthesis depth opened by the CREATE TABLE
 * header returns to zero, not simply when the next CREATE TABLE line
 * appears. This matters a lot for pg_dump output specifically, which
 * routinely places ALTER TABLE ... OWNER TO, CREATE SEQUENCE, COMMENT ON,
 * and SET statements between CREATE TABLE statements. Those lines now fall
 * outside any open statement and are naturally ignored, instead of being
 * misattributed as columns of the previous table.
 */
const groupIntoBlocks = (lines: string[]): SqlBlock[] => {
  const blocks: SqlBlock[] = [];
  let currentBlock: SqlBlock | null = null;
  let depth = 0;
  let inStatement = false;

  for (const line of lines) {
    if (!inStatement && /^CREATE\s+TABLE/i.test(line)) {
      currentBlock = { header: line, body: [] };
      inStatement = true;
      depth = countParenDelta(line);

      if (depth <= 0) {
        blocks.push(currentBlock);
        currentBlock = null;
        inStatement = false;
        depth = 0;
      }
      continue;
    }

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
    // Linhas fora de um statement CREATE TABLE aberto (ruído típico de pg_dump
    // entre tabelas) são intencionalmente descartadas aqui.
  }

  if (currentBlock) blocks.push(currentBlock);
  return blocks;
};

// /**
//  * Extracts table name from PostgreSQL CREATE TABLE statement.
//  * Supports:
//  * - CREATE TABLE table_name
//  * - CREATE TABLE "table_name"
//  * - CREATE TABLE public.table_name
//  * - CREATE TABLE IF NOT EXISTS ...
//  */
// const extractTableName = (header: string): string | null => {
//   const match = header.match(
//     /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["'`]?([\w.]+)["'`]?/i
//   );
//   return match?.[1] || null;
// };


/**
 * Extracts table name from PostgreSQL CREATE TABLE statement.
 * Supports:
 * - CREATE TABLE table_name
 * - CREATE TABLE "table_name"
 * - CREATE TABLE "Table Name"       (quoted identifier, may contain spaces)
 * - CREATE TABLE public.table_name
 * - CREATE TABLE public."Table Name"
 * - CREATE TABLE IF NOT EXISTS ...
 *
 * Quoted identifiers are matched with their opening/closing quote character
 * paired explicitly, so the captured name can safely contain spaces -
 * unquoted identifiers never contain spaces in valid SQL, so that path is
 * unchanged.
 */
const extractTableName = (header: string): string | null => {
  // Quoted identifier: capture everything between the matching pair of
  // quote characters, spaces included.
  const quotedMatch = header.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/i
  );
  if (quotedMatch) {
    return quotedMatch[1] ?? quotedMatch[2] ?? quotedMatch[3] ?? null;
  }
 
  // Unquoted identifier: word chars and dots only (unchanged - unquoted SQL
  // identifiers cannot contain spaces).
  const unquotedMatch = header.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([\w.]+)/i
  );
  return unquotedMatch?.[1] || null;
};



/**
 * Extracts FOREIGN KEY definitions (multi-line support) - PostgreSQL style.
 * Supports:
 * - CONSTRAINT fk_name FOREIGN KEY (col) REFERENCES table(col)
 * - FOREIGN KEY (col) REFERENCES table(col)
 * - Inline REFERENCES in column definition
 */
const extractForeignKey = (lines: string[], startIndex: number): {
  foreignKey: string;
  referenceTable: string;
  referenceColumn?: string;
  linesConsumed: number;
} | null => {
  const combinedLines: string[] = [];
  let i = startIndex;

  while (i < lines.length) {
    combinedLines.push(lines[i]);
    const combined = combinedLines.join(" ").trim();

    // Match standard FK constraint
    // Suporta identificadores entre aspas em qualquer posição (coluna local,
    // tabela e coluna referenciadas), não só na tabela referenciada.
    const fkMatch = combined.match(
      /(?:CONSTRAINT\s+["'`]?\w+["'`]?\s+)?FOREIGN\s+KEY\s*\(\s*["'`]?(\w+)["'`]?\s*\)\s+REFERENCES\s+["'`]?(\w+)["'`]?\s*\(\s*["'`]?(\w+)["'`]?\s*\)/i
    );

    if (fkMatch) {
      return {
        foreignKey: fkMatch[1],
        referenceTable: fkMatch[2],
        referenceColumn: fkMatch[3],
        linesConsumed: i - startIndex + 1
      };
    }

    i++;
    if (i - startIndex > 15) break; // safety
  }

  return null;
};

/**
 * Extracts column definition, handling PostgreSQL specifics:
 * - Inline REFERENCES (e.g., user_id integer REFERENCES users(id))
 * - SERIAL, BIGSERIAL, etc.
 * - Column constraints (NOT NULL, DEFAULT, etc.)
 */
const extractColumnDefinition = (line: string): Column | null => {
  // Ignore constraint-only lines
  if (
    /^\s*(PRIMARY\s+KEY|UNIQUE|CONSTRAINT|FOREIGN\s+KEY|CHECK|EXCLUDE)\b/i.test(line) ||
    /^\s*[\)]+\s*,?\s*$/.test(line) // closing parentheses
  ) {
    return null;
  }

  // Handle inline REFERENCES (remove them for column type)
  let cleanedLine = line.replace(
    /\s+REFERENCES\s+["'`]?\w+["'`]?\s*\(\s*\w+\s*\)/i,
    ""
  );

  const columnRegex = /^\s*["'`]?([\w_]+)["'`]?\s+(.+)$/i;
  const match = cleanedLine.match(columnRegex);

  if (!match) return null;

  const name = match[1];
  let type = match[2].trim();

  // Remove trailing comma when the column definition closes the line.
  // This preserves commas that are part of type declarations such as NUMERIC(10,2).
  type = type.replace(/,\s*$/, "");

  return { name, type };
};

/**
 * Processes a single CREATE TABLE block for PostgreSQL.
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

    // Try FOREIGN KEY constraint
    if (/FOREIGN\s+KEY|CONSTRAINT.*FOREIGN/i.test(line)) {
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

    // Try column definition
    const column = extractColumnDefinition(line);
    if (column) {
      table.column.push(column);
    }

    i++;
  }

  return table;
};

/**
 * Main PostgreSQL SQL parser.
 * 
 * Converts raw PostgreSQL CREATE TABLE statements into structured Table objects.
 * Handles:
 * - public schema
 * - Quoted identifiers
 * - Inline REFERENCES
 * - Standard FK constraints
 * - SERIAL / GENERATED columns
 * 
 * @param sql - Raw PostgreSQL SQL dump
 * @returns Array of Table objects
 * @throws Error if no valid tables are found
 */
export const parsePostgresql = (sql: string): Table[] => {
  try {
    const cleanedSql = cleanPostgresql(sql);
    const blocks = groupIntoBlocks(cleanedSql);

    const tables: Table[] = [];

    for (const block of blocks) {
      const table = processBlock(block);
      if (table && table.column.length > 0) {
        tables.push(table);
      }
    }

    if (tables.length === 0) {
      throw new Error("No valid PostgreSQL tables found in the SQL");
    }

    return enrichTables(tables);
  } catch (err: any) {
    console.error("Failed to parse PostgreSQL SQL:", err);
    throw new Error(`Failed to parse PostgreSQL file: ${err.message}`);
  }
};