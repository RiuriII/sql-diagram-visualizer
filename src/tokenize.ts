/**
 * Generic SQL Tokenizer.
 *
 * This tokenizer is dialect-agnostic. It converts a normalized SQL string
 * into a flat sequence of tokens, leaving all dialect-specific decisions
 * to the Dialect and State Machine layers.
 *
 * Design decisions:
 * - Input is a normalized SQL string.
 * - Output is a Token[] (input size is capped upstream).
 * - SQL-standard comments (`--` and `/* *\/`) are always recognized.
 * - Additional line-comment markers are provided via TokenizerConfig.
 * - Backticks (`) and double quotes (") are treated as generic quoted
 *   identifier delimiters.
 * - Symbols are emitted one character at a time (compound operators such
 *   as >=, <=, != and <> are intentionally not grouped).
 * - The cursor advances by Unicode code point rather than UTF-16 code unit.
 * - Fail-fast: unterminated quoted identifiers, string literals and block
 *   comments immediately throw a TokenizerError.
 *
 * Known limitations (v1):
 * - Escaped quotes inside string literals or quoted identifiers are not
 *   supported yet.
 */
 

export enum TokenType {
  Identifier = "Identifier", // bare word: users, id, VARCHAR, CREATE, PRIMARY...
  QuotedIdentifier = "QuotedIdentifier", // `users`, "Users"
  StringLiteral = "StringLiteral", // 'active'
  NumberLiteral = "NumberLiteral", // 100, 10 (used in VARCHAR(255), NUMERIC(10,2))
  Punctuation = "Punctuation", // ( ) , ; .
  Symbol = "Symbol", // Fallback token for single-character operators and unknown symbols.
  EOF = "EOF",
}

export interface Token {
  type: TokenType;
  value: string; // decoded value (no surrounding quotes, no escapes)
  raw: string; // original lexeme, including quotes — useful for debugging/errors
  line: number; // 1-based
  column: number; // 1-based
  start: number; // absolute offset in the normalized text
  end: number; // absolute offset, exclusive
}

/**
 * Dialect-specific tokenizer configuration.
 */
export interface TokenizerConfig {
  extraLineCommentMarkers?: string[];
}

/**
 * Thrown when the input cannot be represented as a valid, complete sequence
 * of tokens (e.g. an unterminated quoted identifier, string literal, or
 * block comment). Always carries the position where the offending construct
 * started, so callers can point the user at the exact spot in the file.
 */
export class TokenizerError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number
  ) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "TokenizerError";
  }
}

const PUNCTUATION_CHARS = new Set(["(", ")", ",", ";", "."]);

const isDigit = (char: string): boolean => char >= "0" && char <= "9";

// Identifier validation follows Unicode letter/number semantics so
// accented identifiers  survive tokenization unchanged.
const canStartIdentifier = (char: string): boolean => /[\p{L}_]/u.test(char);
const canContinueIdentifier = (char: string): boolean => /[\p{L}\p{N}_]/u.test(char);

/**
 * Tokenizes a normalized SQL string into a flat sequence of tokens.
 *
 * Assumes `sql` has already passed through the Normalizer (BOM removed,
 * line endings normalized to `\n`, control characters stripped). This
 * function performs no normalization of its own.
 *
 * @param sql - Normalized SQL source text.
 * @param config - Dialect-provided tokenizer configuration.
 * @returns A complete Token[] ending with an EOF token.
 * @throws {TokenizerError} If the input contains an unterminated quoted
 *         identifier, string literal, or block comment.
 */
export const tokenize = (sql: string, config: TokenizerConfig = {}): Token[] => {
  const extraLineCommentMarkers = config.extraLineCommentMarkers ?? [];
  const tokens: Token[] = [];

  const length = sql.length;
  let offset = 0;
  let line = 1;
  let column = 1;

  // Advances the cursor by one Unicode code point while keeping
  // line and column counters synchronized.
  const advance = (): string => {
    const codePoint = sql.codePointAt(offset)!;
    const char = String.fromCodePoint(codePoint);
    offset += char.length; // 1 UTF-16 unit normally, 2 for a surrogate pair
    if (char === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
    return char;
  };

  // Returns the current character without advancing the cursor.
  const peek = (): string | undefined => {
    if (offset >= length) return undefined;
    const codePoint = sql.codePointAt(offset);
    return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
  };

  const startsWith = (text: string, atOffset: number = offset): boolean =>
    sql.startsWith(text, atOffset);

  while (offset < length) {

    const char = peek()!;

    // --- 1. Whitespace: skip, no token emitted ---
    if (char === " " || char === "\t" || char === "\n") {
      advance();
      continue;
    }

    const tokenStartOffset = offset;
    const tokenStartLine = line;
    const tokenStartColumn = column;

    // --- 2. Line comments: standard `--` plus any dialect-provided markers ---
    const lineCommentMarker = ["--", ...extraLineCommentMarkers].find((marker) =>
      startsWith(marker)
    );

    if (lineCommentMarker) {
      while (offset < length && peek() !== "\n") advance();
      continue;
    }

    // --- 3. Block comments `/* ... */` (includes MySQL's `/*! ... */`, treated as a plain comment) ---
    if (startsWith("/*")) {
      advance(); // '/'
      advance(); // '*'
      let delimiterClosed = false;
      while (offset < length) {
        if (startsWith("*/")) {
          advance(); // '*'
          advance(); // '/'
          delimiterClosed = true;
          break;
        }
        advance();
      }
      if (!delimiterClosed) {
        throw new TokenizerError(
          "Unterminated block comment",
          tokenStartLine,
          tokenStartColumn
        );
      }
      continue;
    }

    // --- 4. Quoted identifiers: ` or " ---
    if (char === "`" || char === '"') {
      const quoteChar = char;
      advance(); // opening quote
      let value = "";
      let delimiterClosed = false;
      while (offset < length) {
        const peekChar = peek()!;
        if (peekChar === quoteChar) {
          advance();
          delimiterClosed = true;
          break;
        }
        value += advance();
      }
      if (!delimiterClosed) {
        throw new TokenizerError(
          `Unterminated quoted identifier starting with ${quoteChar}`,
          tokenStartLine,
          tokenStartColumn
        );
      }
      tokens.push({
        type: TokenType.QuotedIdentifier,
        value,
        raw: sql.slice(tokenStartOffset, offset),
        line: tokenStartLine,
        column: tokenStartColumn,
        start: tokenStartOffset,
        end: offset,
      });
      continue;
    }

    // --- 5. String literals: ' ---
    if (char === "'") {
      advance(); // opening quote
      let value = "";
      let delimiterClosed = false;
      while (offset < length) {
        const peekChar = peek()!;
        if (peekChar === "'") {
          advance();
          delimiterClosed = true;
          break;
        }
        value += advance();
      }
      if (!delimiterClosed) {
        throw new TokenizerError(
          "Unterminated string literal",
          tokenStartLine,
          tokenStartColumn
        );
      }
      tokens.push({
        type: TokenType.StringLiteral,
        value,
        raw: sql.slice(tokenStartOffset, offset),
        line: tokenStartLine,
        column: tokenStartColumn,
        start: tokenStartOffset,
        end: offset,
      });
      continue;
    }

    // --- 6. Numbers: sequence of digits ---
    if (isDigit(char)) {
      let value = "";
      while (offset < length && isDigit(peek()!)) {
        value += advance();
      }
      tokens.push({
        type: TokenType.NumberLiteral,
        value,
        raw: value,
        line: tokenStartLine,
        column: tokenStartColumn,
        start: tokenStartOffset,
        end: offset,
      });
      continue;
    }

    // --- 7. Unquoted identifiers ---
    if (canStartIdentifier(char)) {
      let value = "";
      while (offset < length && canContinueIdentifier(peek()!)) {
        value += advance();
      }
      tokens.push({
        type: TokenType.Identifier,
        value,
        raw: value,
        line: tokenStartLine,
        column: tokenStartColumn,
        start: tokenStartOffset,
        end: offset,
      });
      continue;
    }

    // --- 8. Punctuation: ( ) , ; . ---
    if (PUNCTUATION_CHARS.has(char)) {
      advance();
      tokens.push({
        type: TokenType.Punctuation,
        value: char,
        raw: char,
        line: tokenStartLine,
        column: tokenStartColumn,
        start: tokenStartOffset,
        end: offset,
      });
      continue;
    }

    // --- 9. Symbol: fallback, single character ---
    advance();
    tokens.push({
      type: TokenType.Symbol,
      value: char,
      raw: char,
      line: tokenStartLine,
      column: tokenStartColumn,
      start: tokenStartOffset,
      end: offset,
    });
  }

  // --- 10. EOF ---
  tokens.push({
    type: TokenType.EOF,
    value: "",
    raw: "",
    line,
    column,
    start: offset,
    end: offset,
  });

  return tokens;
};