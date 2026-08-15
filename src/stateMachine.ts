import { Token, TokenType } from "./tokenize";
import { SqlDialect, CreateTableHeader } from "./dialect";
import { ForeignKey, Table } from "./interfaces";

/**
 * Generic SQL State Machine.
 *
 * Consumes the flat token sequence produced by the Tokenizer and produces
 * the same intermediate Table[] shape the rest of the pipeline already
 * expects (before enrichTables). It has NO knowledge of any specific SQL
 * dialect — every decision that depends on "which database produced this
 * SQL" is delegated to the SqlDialect passed in.
 *
 * Flow (mirrors the agreed design): Scanning -> Header Recognition ->
 * Body Parsing -> emit Table -> resume Scanning. Statements rejected at
 * any point (not CREATE TABLE, or CREATE TABLE the dialect doesn't model)
 * are simply skipped by letting Scanning continue from wherever parsing
 * stopped — Scanning already ignores every token that isn't a literal
 * CREATE, so no separate paren-depth-tracking "skip" algorithm is needed.
 *
 * Fail-fast throughout: any malformed construct inside a statement the
 * State Machine has committed to modeling (unterminated body, incomplete
 * FOREIGN KEY, missing table/column name, etc.) throws a StateMachineError
 * immediately, with the position of the problem. Statements outside its
 * scope (CREATE INDEX, CREATE SEQUENCE, CREATE VIEW, ...) are not errors —
 * they're simply not CREATE TABLE, and are left alone.
 */

export class StateMachineError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number
  ) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "StateMachineError";
  }
}

/** Safety cap for how many words between CREATE and TABLE we'll scan before
 * concluding this isn't a CREATE TABLE statement. Same spirit as the caps
 * already used in the tokenizer/old parser (e.g. extractForeignKey). */
const HEADER_LOOKAHEAD_CAP = 10;

const toUpperValue = (token: Token): string => token.value.toUpperCase();

const isNameToken = (token: Token | undefined): boolean =>
  token !== undefined &&
  (token.type === TokenType.Identifier || token.type === TokenType.QuotedIdentifier);

const isPunctuation = (token: Token | undefined, value: string): boolean =>
  token !== undefined && token.type === TokenType.Punctuation && token.value === value;

/**
 * Matches a structural SQL keyword (CREATE, TABLE, IF, NOT, EXISTS,
 * FOREIGN, KEY, REFERENCES, CONSTRAINT, ...). Requires both that the token
 * literally spells the word AND that the dialect endorses it via
 * `dialect.keywords` — this is what makes `dialect.keywords` load-bearing
 * rather than decorative: a dialect that omits a word from this set simply
 * won't have that grammar recognized.
 */
const isKeyword = (token: Token | undefined, word: string, dialect: SqlDialect): boolean =>
  token !== undefined &&
  token.type === TokenType.Identifier &&
  toUpperValue(token) === word &&
  dialect.keywords.has(word);

const sqlSlice = (sql: string, from: Token, to: Token): string => sql.slice(from.start, to.end);

/**
 * Consumes a dot-separated identifier chain (e.g. `public.users`,
 * `db.schema.users`, or a bare `users`) starting at `index`, returning the
 * *last* component as the effective name. This is what lets schema/database
 * qualifiers be dropped uniformly across dialects, instead of hardcoding a
 * specific prefix like "public." (PostgreSQL-only) or any one dialect's
 * convention.
 */
export const consumeQualifiedName = (
  tokens: Token[],
  index: number
): { name: string; nextIndex: number } | null => {
  if (!isNameToken(tokens[index])) return null;

  let name = tokens[index].value;
  let currentIndex = index + 1;

  while (isPunctuation(tokens[currentIndex], ".") && isNameToken(tokens[currentIndex + 1])) {
    name = tokens[currentIndex + 1].value;
    currentIndex += 2;
  }

  return { name, nextIndex: currentIndex };
};

interface HeaderParseResult {
  isCreateTable: boolean;
  header?: CreateTableHeader;
  /** Index of the '(' token starting the body, only set when hasBody is true. */
  bodyStartIndex?: number;
  /** Index to resume scanning from in every case (matched or not). */
  nextIndex: number;
}

/**
 * Recognizes a CREATE TABLE header starting at `createIndex` (which points
 * at the CREATE token). Looks ahead only for the literal TABLE keyword —
 * every word found before it is treated as a candidate modifier, validated
 * against the dialect only once we've committed to "this is CREATE TABLE".
 * If TABLE never appears within the lookahead cap, this simply isn't a
 * CREATE TABLE statement (CREATE INDEX, CREATE SEQUENCE, CREATE VIEW, ...)
 * — out of scope, not an error.
 */
export const parseHeader = (
  tokens: Token[],
  createIndex: number,
  dialect: SqlDialect
): HeaderParseResult => {
  const modifierTokens: Token[] = [];
  let tableIndex = -1;

  for (let lookaheadOffset = 0; lookaheadOffset < HEADER_LOOKAHEAD_CAP; lookaheadOffset++) {

    const lookaheadIndex = createIndex + 1 + lookaheadOffset;

    const currentToken = tokens[lookaheadIndex];

    if (currentToken.type !== TokenType.Identifier) break;

    if (isKeyword(currentToken, "TABLE", dialect)) {
      tableIndex = lookaheadIndex;
      break;
    }

    modifierTokens.push(currentToken);
  }

  if (tableIndex === -1) {
    // Not a CREATE TABLE. Resume scanning right after CREATE — Scanning's
    // uniform "ignore anything that isn't CREATE" behavior handles the
    // rest of this other statement correctly on its own.
    return { isCreateTable: false, nextIndex: createIndex + 1 };
  }

  for (const modifierToken of modifierTokens) {
    if (!dialect.createTableModifierKeywords.has(toUpperValue(modifierToken))) {
      throw new StateMachineError(
        `Unsupported CREATE TABLE modifier "${modifierToken.value}" for dialect "${dialect.name}"`,
        modifierToken.line,
        modifierToken.column
      );
    }
  }

  let headerIndex = tableIndex + 1;

  let ifNotExists = false;
  if (isKeyword(tokens[headerIndex], "IF", dialect)) {
    if (!isKeyword(tokens[headerIndex + 1], "NOT", dialect) || !isKeyword(tokens[headerIndex + 2], "EXISTS", dialect)) {
      throw new StateMachineError(
        `Expected "NOT EXISTS" after "IF" in CREATE TABLE header`,
        tokens[headerIndex].line,
        tokens[headerIndex].column
      );
    }
    ifNotExists = true;
    headerIndex += 3;
  }

  const nameResult = consumeQualifiedName(tokens, headerIndex);
  if (!nameResult) {
    throw new StateMachineError(
      "Expected a table name after CREATE TABLE",
      tokens[headerIndex].line,
      tokens[headerIndex].column
    );
  }

  const tableName = nameResult.name;
  headerIndex = nameResult.nextIndex;

  const hasBody = isPunctuation(tokens[headerIndex], "(");
  const modifiers = modifierTokens.map((t) => t.value);

  const header: CreateTableHeader = { modifiers, ifNotExists, tableName, hasBody };

  return {
    isCreateTable: true,
    header,
    bodyStartIndex: hasBody ? headerIndex : undefined,
    nextIndex: headerIndex,
  };
};

/**
 * Splits the tokens of a table body (between the outer '(' and its matching
 * ')') into one array per column/constraint definition, using parenthesis
 * depth to decide where a comma actually separates definitions (depth 1)
 * versus where it's just part of a nested type parameter list like
 * NUMERIC(10,2) (depth 2+). This is the direct replacement for the old
 * line-based countParenDelta approach.
 *
 * A comma immediately following '(' or another comma (an empty definition)
 * is a StateMachineError — it signals a genuinely malformed list, not a
 * stylistic choice. A single trailing comma right before the closing ')' is
 * tolerated, since it loses no information and is a common convenience in
 * hand-written SQL.
 */
export const splitBodyDefinitions = (
  tokens: Token[],
  openParenIndex: number
): { definitions: Token[][]; closeParenIndex: number } => {
  const definitions: Token[][] = [];
  let current: Token[] = [];
  let depth = 1;
  let currentIndex = openParenIndex + 1;

  while (true) {
    const currentToken = tokens[currentIndex];

    if (currentToken.type === TokenType.EOF) {
      throw new StateMachineError(
        "Unterminated CREATE TABLE body — reached end of file before a matching ')'",
        tokens[openParenIndex].line,
        tokens[openParenIndex].column
      );
    }

    if (isPunctuation(currentToken, "(")) {
      depth++;
      current.push(currentToken);
      currentIndex++;
      continue;
    }

    if (isPunctuation(currentToken, ")")) {
      depth--;
      if (depth === 0) {
        if (current.length > 0) definitions.push(current);
        return { definitions, closeParenIndex: currentIndex };
      }
      current.push(currentToken);
      currentIndex++;
      continue;
    }

    if (isPunctuation(currentToken, ",") && depth === 1) {
      if (current.length === 0) {
        throw new StateMachineError(
          "Unexpected ',' — empty definition in CREATE TABLE body",
          currentToken.line,
          currentToken.column
        );
      }
      definitions.push(current);
      current = [];
      currentIndex++;
      continue;
    }

    current.push(currentToken);
    currentIndex++;
  }
};

/** Finds the first index (>= startFrom) where `matchers` match consecutively. */
const findSequence = (
  definitionTokens: Token[],
  startFrom: number,
  tokenMatchers: Array<(t: Token) => boolean>
): number => {
  for (let currentIndex = startFrom; currentIndex <= definitionTokens.length - tokenMatchers.length; currentIndex++) {
    if (tokenMatchers.every((m, offset) => m(definitionTokens[currentIndex + offset]))) return currentIndex;
  }
  return -1;
};

/**
 * Extracts `(col) REFERENCES table(col?)` starting at the FOREIGN token of
 * a constraint definition (an optional leading `CONSTRAINT name` has
 * already been skipped over by the caller via findSequence).
 */
const extractForeignKeyConstraint = (
  definitionTokens: Token[],
  foreignIndex: number,
  dialect: SqlDialect
): ForeignKey => {
  const expect = (index: number, check: (t: Token) => boolean, what: string): Token => {
    const currentToken = definitionTokens[index];
    if (!currentToken || !check(currentToken)) {
      const errorToken = currentToken ?? definitionTokens[definitionTokens.length - 1];
      throw new StateMachineError(`Malformed FOREIGN KEY constraint — expected ${what}`, errorToken.line, errorToken.column);
    }
    return currentToken;
  };

  let currentIndex = foreignIndex;

  expect(currentIndex, (t) => isKeyword(t, "FOREIGN", dialect), '"FOREIGN"');
  currentIndex++;

  expect(currentIndex, (t) => isKeyword(t, "KEY", dialect), '"KEY"');
  currentIndex++;

  expect(currentIndex, (t) => isPunctuation(t, "("), '"("');
  currentIndex++;

  const columnToken = expect(currentIndex, isNameToken, "a column name");
  currentIndex++;

  expect(currentIndex, (t) => isPunctuation(t, ")"), '")"');
  currentIndex++;

  expect(currentIndex, (t) => isKeyword(t, "REFERENCES", dialect), '"REFERENCES"');
  currentIndex++;

  const refNameResult = consumeQualifiedName(definitionTokens, currentIndex);
  if (!refNameResult) {
    const errorToken = definitionTokens[currentIndex] ?? definitionTokens[definitionTokens.length - 1];
    throw new StateMachineError(
      "Malformed FOREIGN KEY constraint — expected a referenced table name",
      errorToken.line,
      errorToken.column
    );
  }

  return { foreignKey: columnToken.value, referenceTable: refNameResult.name };
};

/**
 * Processes a single column/constraint definition (already isolated by
 * splitBodyDefinitions) and mutates `table` accordingly.
 */
export const processDefinition = (definition: Token[], dialect: SqlDialect, table: Table, sql: string): void => {
  const firstToken = definition[0];

  const isConstraintOnly =
    firstToken.type === TokenType.Identifier && dialect.nonColumnKeywords.has(toUpperValue(firstToken));

  if (isConstraintOnly) {
    const foreignIndex = findSequence(definition, 0, [
      (t) => isKeyword(t, "FOREIGN", dialect),
      (t) => isKeyword(t, "KEY", dialect),
    ]);

    if (foreignIndex !== -1) {
      table.foreignKey.push(extractForeignKeyConstraint(definition, foreignIndex, dialect));
    }
    // Any other constraint (PRIMARY KEY, UNIQUE, bare INDEX/KEY, CHECK,
    // EXCLUDE) carries no information our model captures — discarded here,
    // matching current behavior: PK is inferred later by enrichTables via
    // naming heuristics, not from this constraint.
    return;
  }

  if (!isNameToken(firstToken)) {
    throw new StateMachineError(
      "Expected a column name or a known constraint keyword",
      firstToken.line,
      firstToken.column
    );
  }

  const columnName = firstToken.value;
  const referencesIndex = findSequence(definition, 1, [(t) => isKeyword(t, "REFERENCES", dialect)]);

  if (referencesIndex === -1) {
    const remainingTokens = definition.slice(1);
    if (remainingTokens.length === 0) {
      throw new StateMachineError(`Column "${columnName}" is missing a type`, firstToken.line, firstToken.column);
    }
    const columnType = sqlSlice(sql, remainingTokens[0], remainingTokens[remainingTokens.length - 1]);
    table.column.push({ name: columnName, type: columnType });
    return;
  }

  const typeTokens = definition.slice(1, referencesIndex);
  if (typeTokens.length === 0) {
    throw new StateMachineError(`Column "${columnName}" is missing a type`, firstToken.line, firstToken.column);
  }
  const columnType = sqlSlice(sql, typeTokens[0], typeTokens[typeTokens.length - 1]);

  const refNameResult = consumeQualifiedName(definition, referencesIndex + 1);
  if (!refNameResult) {
    const errorToken  = definition[referencesIndex + 1] ?? definition[definition.length - 1];
    throw new StateMachineError(
      "Malformed inline REFERENCES — expected a referenced table name",
      errorToken.line,
      errorToken.column
    );
  }

  table.column.push({ name: columnName, type: columnType});
  table.foreignKey.push({ foreignKey: columnName, referenceTable: refNameResult.name });
};

/**
 * Runs the full State Machine over a token stream, producing the same
 * Table[] shape the rest of the pipeline (enrichTables, svgGenerator)
 * already expects — pre-enrichment, exactly as parseSql/parsePostgresql
 * produce today.
 *
 * @param tokens - Output of `tokenize()`.
 * @param sql - The same normalized SQL string the tokens were produced
 *              from — required to slice raw "type" spans (Strategy B).
 * @param dialect - Dialect rules to apply (MySqlDialect, ...).
 * @throws {StateMachineError} On any malformed construct within a
 *         statement the State Machine has committed to modeling.
 */
export const runStateMachine = (tokens: Token[], sql: string, dialect: SqlDialect): Table[] => {
  const tables: Table[] = [];
  let tokenIndex = 0;

  while (tokens[tokenIndex].type !== TokenType.EOF) {
    const token = tokens[tokenIndex];

    if (!isKeyword(token, "CREATE", dialect)) {
      tokenIndex++;
      continue;
    }

    const headerResult = parseHeader(tokens, tokenIndex, dialect);

    if (!headerResult.isCreateTable) {
      tokenIndex = headerResult.nextIndex;
      continue;
    }

    const header = headerResult.header!;

    if (!header.hasBody || !dialect.isSupportedCreateTable(header)) {
      // Not modeled (e.g. MySQL's `CREATE TABLE new LIKE old;`). Resume
      // scanning from wherever header parsing stopped — no separate skip
      // logic needed, see module-level comment.
      tokenIndex = headerResult.nextIndex;
      continue;
    }

    const { definitions, closeParenIndex } = splitBodyDefinitions(tokens, headerResult.bodyStartIndex!);

    const table: Table = { tableName: header.tableName, column: [], foreignKey: [] };

    for (const def of definitions) {
      processDefinition(def, dialect, table, sql);
    }

    tables.push(table);
    tokenIndex = closeParenIndex + 1;
  }

  // A CREATE TABLE with no actual columns (e.g. a body made up entirely of
  // constraints) isn't modeled — mirrors the existing filter applied today
  // in parseSql/parsePostgresql before returning to the caller.
  return tables.filter((t) => t.column.length > 0);
};