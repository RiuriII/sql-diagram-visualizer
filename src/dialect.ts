import { TokenizerConfig } from "./tokenize";

/**
 * Dialect-independent representation of a parsed CREATE TABLE header.
 *
 * Produced by the State Machine and passed to the dialect so it can decide
 * whether the statement represents a supported table definition.
 */
export interface CreateTableHeader {
  /**
   * Modifier keywords found between CREATE and TABLE
   * (e.g. TEMP, TEMPORARY, UNLOGGED).
   */
  modifiers: string[];

  /** Whether "IF NOT EXISTS" was present right after TABLE. */
  ifNotExists: boolean;

  /** The table name, already extracted with quotes stripped. */
  tableName: string;

  /**
   * Whether the CREATE TABLE statement has a column-list body.
   */
  hasBody: boolean;
}

/**
 * Encapsulates all SQL dialect-specific behavior used by the Tokenizer
 * and State Machine. Whenever a decision depends on which database
 * produced the SQL, it is delegated to a SqlDialect instance instead of
 * being hardcoded upstream.
 */
export interface SqlDialect {
  readonly name: string;

  /** Passed straight through to `tokenize()` for this dialect's SQL. */
  readonly tokenizer: TokenizerConfig;

  /**
   * SQL keywords recognized by the State Machine for structural parsing.
   */
  readonly keywords: ReadonlySet<string>;

  /**
   * Valid modifier keywords that may appear between CREATE and TABLE.
   */
  readonly createTableModifierKeywords: ReadonlySet<string>;

  /**
   * Keywords that begin table-level definitions rather than column definitions.
   */
  readonly nonColumnKeywords: ReadonlySet<string>;

  /**
   * Decides whether a given CREATE TABLE header should become a Table in
   * the intermediate model based on dialect-specific rules.
   *
   * @param header - The structurally parsed CREATE TABLE header.
   * @returns True if the statement represents a supported table definition.
   */
  readonly isSupportedCreateTable: (header: CreateTableHeader) => boolean;
}

export const mysqlDialect: SqlDialect = {
  name: "mysql",

  tokenizer: {
    extraLineCommentMarkers: ["#"],
  },

  keywords: new Set([
    "CREATE",
    "TABLE",
    "IF",
    "NOT",
    "EXISTS",
    "PRIMARY",
    "KEY",
    "FOREIGN",
    "REFERENCES",
    "CONSTRAINT",
  ]),

  // Empty in v1: MySQL defines no CREATE TABLE modifiers between
  // CREATE and TABLE. Any identifier found there is treated as a
  // syntax error by the State Machine.
  createTableModifierKeywords: new Set(),

  nonColumnKeywords: new Set([
    "PRIMARY",
    "UNIQUE",
    "INDEX",
    "KEY",
    "CONSTRAINT",
    "FOREIGN",
    "CHECK",
  ]),

  // Only CREATE TABLE statements with a body are modeled.
  isSupportedCreateTable: (header) => header.hasBody,
};

export const postgresDialect: SqlDialect = {
  name: "postgres",

  tokenizer: {
    extraLineCommentMarkers: [],
  },

  keywords: new Set([
    "CREATE",
    "TABLE",
    "IF",
    "NOT",
    "EXISTS",
    "PRIMARY",
    "KEY",
    "FOREIGN",
    "REFERENCES",
    "CONSTRAINT",
  ]),


  // Supported PostgreSQL CREATE TABLE modifiers.
  createTableModifierKeywords: new Set(["TEMP", "TEMPORARY", "UNLOGGED"]),

  nonColumnKeywords: new Set([
    "PRIMARY",
    "UNIQUE",
    "CONSTRAINT",
    "FOREIGN",
    "CHECK",
    "EXCLUDE", 
    "LIKE",
  ]),

  // Only CREATE TABLE statements with a body are modeled.
  // PostgreSQL's LIKE clause is handled later during body parsing.
  isSupportedCreateTable: (header) => header.hasBody,
};