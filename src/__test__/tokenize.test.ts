/// <reference types="jest" />

import { tokenize, TokenType, TokenizerError, Token } from "../tokenize";
import { mysqlDialect } from "../dialect";

/**
 * Helper to strip position/raw noise when a test only cares about the
 * type/value sequence produced by the tokenizer.
 */
const shape = (tokens: Token[]) =>
  tokens.map((t) => ({ type: t.type, value: t.value }));

describe("tokenize — basic token recognition", () => {
  it("tokenizes a bare identifier", () => {
    const tokens = tokenize("users");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Identifier, value: "users" },
      { type: TokenType.EOF, value: "" },
    ]);
  });

  it("tokenizes punctuation as individual tokens", () => {
    const tokens = tokenize("(),;.");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Punctuation, value: "(" },
      { type: TokenType.Punctuation, value: ")" },
      { type: TokenType.Punctuation, value: "," },
      { type: TokenType.Punctuation, value: ";" },
      { type: TokenType.Punctuation, value: "." },
      { type: TokenType.EOF, value: "" },
    ]);
  });

  it("tokenizes an integer number", () => {
    const tokens = tokenize("255");
    expect(shape(tokens)).toEqual([
      { type: TokenType.NumberLiteral, value: "255" },
      { type: TokenType.EOF, value: "" },
    ]);
  });

  it("tokenizes NUMERIC(10,2) as identifier + punctuation + numbers", () => {
    const tokens = tokenize("NUMERIC(10,2)");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Identifier, value: "NUMERIC" },
      { type: TokenType.Punctuation, value: "(" },
      { type: TokenType.NumberLiteral, value: "10" },
      { type: TokenType.Punctuation, value: "," },
      { type: TokenType.NumberLiteral, value: "2" },
      { type: TokenType.Punctuation, value: ")" },
      { type: TokenType.EOF, value: "" },
    ]);
  });

  it("skips whitespace without emitting tokens", () => {
    const tokens = tokenize("  users   id  ");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Identifier, value: "users" },
      { type: TokenType.Identifier, value: "id" },
      { type: TokenType.EOF, value: "" },
    ]);
  });

  it("emits Symbol tokens one character at a time, without grouping compound operators", () => {
    const tokens = tokenize(">=");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Symbol, value: ">" },
      { type: TokenType.Symbol, value: "=" },
      { type: TokenType.EOF, value: "" },
    ]);
  });
});

describe("tokenize — quoted identifiers", () => {
  it("tokenizes a backtick-quoted identifier and strips the quotes from value", () => {
    const tokens = tokenize("`users`");
    expect(tokens[0]).toMatchObject({
      type: TokenType.QuotedIdentifier,
      value: "users",
      raw: "`users`",
    });
  });

  it("tokenizes a double-quoted identifier", () => {
    const tokens = tokenize('"Users"');
    expect(tokens[0]).toMatchObject({
      type: TokenType.QuotedIdentifier,
      value: "Users",
      raw: '"Users"',
    });
  });

  it("supports quoted identifiers containing spaces", () => {
    const tokens = tokenize('"Table Name"');
    expect(tokens[0]).toMatchObject({
      type: TokenType.QuotedIdentifier,
      value: "Table Name",
    });
  });

  it("throws TokenizerError with the opening position for an unterminated backtick identifier", () => {
    expect(() => tokenize("`users")).toThrow(TokenizerError);
    try {
      tokenize("`users");
      fail("expected TokenizerError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TokenizerError);
      expect((err as TokenizerError).line).toBe(1);
      expect((err as TokenizerError).column).toBe(1);
    }
  });

  it("throws TokenizerError with the opening position for an unterminated double-quoted identifier", () => {
    const sql = 'id INT,\n"Users';
    try {
      tokenize(sql);
      fail("expected TokenizerError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TokenizerError);
      expect((err as TokenizerError).line).toBe(2);
      expect((err as TokenizerError).column).toBe(1);
    }
  });
});

describe("tokenize — string literals", () => {
  it("tokenizes a simple string literal", () => {
    const tokens = tokenize("'active'");
    expect(tokens[0]).toMatchObject({
      type: TokenType.StringLiteral,
      value: "active",
      raw: "'active'",
    });
  });

  it("throws TokenizerError for an unterminated string literal", () => {
    try {
      tokenize("DEFAULT 'active");
      fail("expected TokenizerError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TokenizerError);
      expect((err as TokenizerError).column).toBe(9); 
    }
  });
});

describe("tokenize — comments", () => {
  it("discards standard line comments (--) without emitting tokens", () => {
    const tokens = tokenize("id INT, -- primary key\nname TEXT");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Identifier, value: "id" },
      { type: TokenType.Identifier, value: "INT" },
      { type: TokenType.Punctuation, value: "," },
      { type: TokenType.Identifier, value: "name" },
      { type: TokenType.Identifier, value: "TEXT" },
      { type: TokenType.EOF, value: "" },
    ]);
  });

  it("discards block comments, including multi-line ones", () => {
    const tokens = tokenize("id /* this is\na comment */ INT");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Identifier, value: "id" },
      { type: TokenType.Identifier, value: "INT" },
      { type: TokenType.EOF, value: "" },
    ]);
  });

  it("discards MySQL conditional comments (/*! ... */) like any other block comment", () => {
    const tokens = tokenize("/*!40101 SET NAMES utf8 */ CREATE TABLE");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Identifier, value: "CREATE" },
      { type: TokenType.Identifier, value: "TABLE" },
      { type: TokenType.EOF, value: "" },
    ]);
  });

  it("throws TokenizerError for an unterminated block comment", () => {
    try {
      tokenize("id INT /* never closed");
      fail("expected TokenizerError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TokenizerError);
      expect((err as TokenizerError).column).toBe(8); // where /* opens
    }
  });

  it("does NOT treat '#' as a comment marker by default (no dialect config)", () => {
    const tokens = tokenize("id INT # not a comment here");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Identifier, value: "id" },
      { type: TokenType.Identifier, value: "INT" },
      { type: TokenType.Symbol, value: "#" },
      { type: TokenType.Identifier, value: "not" },
      { type: TokenType.Identifier, value: "a" },
      { type: TokenType.Identifier, value: "comment" },
      { type: TokenType.Identifier, value: "here" },
      { type: TokenType.EOF, value: "" },
    ]);
  });

  it("treats '#' as a line comment when using MySqlDialect's tokenizer config", () => {
    const tokens = tokenize("id INT # this is a comment\nname TEXT", mysqlDialect.tokenizer);
    expect(shape(tokens)).toEqual([
      { type: TokenType.Identifier, value: "id" },
      { type: TokenType.Identifier, value: "INT" },
      { type: TokenType.Identifier, value: "name" },
      { type: TokenType.Identifier, value: "TEXT" },
      { type: TokenType.EOF, value: "" },
    ]);
  });
});

describe("tokenize — unicode identifiers", () => {
  it("preserves accented characters in unquoted identifiers", () => {
    const tokens = tokenize("endereço usuário");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Identifier, value: "endereço" },
      { type: TokenType.Identifier, value: "usuário" },
      { type: TokenType.EOF, value: "" },
    ]);
  });

  it("treats an emoji as a single Symbol token, not part of an identifier", () => {
    const tokens = tokenize("nome🚀 TEXT");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Identifier, value: "nome" },
      { type: TokenType.Symbol, value: "🚀" },
      { type: TokenType.Identifier, value: "TEXT" },
      { type: TokenType.EOF, value: "" },
    ]);
  });

  it("reads astral-plane characters (surrogate pairs) as a single code point, not two", () => {
    // Regression guard: JS strings are UTF-16, so a character like 🚀 is
    // represented internally as two UTF-16 code units (a surrogate pair).
    // The tokenizer must advance by logical character (code point), not by
    // raw code unit, or it would split this into two invalid Symbol tokens.
    const tokens = tokenize("a🚀b");
    expect(shape(tokens)).toEqual([
      { type: TokenType.Identifier, value: "a" },
      { type: TokenType.Symbol, value: "🚀" },
      { type: TokenType.Identifier, value: "b" },
      { type: TokenType.EOF, value: "" },
    ]);

    expect(tokens.map((t) => t.column)).toEqual([1, 2, 3, 4]);
  });
});

describe("tokenize — line/column tracking", () => {
  it("tracks line and column across multiple lines", () => {
    const tokens = tokenize("id INT,\nname TEXT");
    const [id, int, comma, name, text] = tokens;

    expect(id).toMatchObject({ line: 1, column: 1 });
    expect(int).toMatchObject({ line: 1, column: 4 });
    expect(comma).toMatchObject({ line: 1, column: 7 });
    expect(name).toMatchObject({ line: 2, column: 1 });
    expect(text).toMatchObject({ line: 2, column: 6 });
  });

  it("reports correct start/end offsets for a raw span slice (State Machine strategy B)", () => {
    const sql = "price NUMERIC(10,2) DEFAULT 0";
    const tokens = tokenize(sql);

    const typeStart = tokens[1].start; // "NUMERIC"
    const typeEnd = tokens[tokens.length - 2].end; // "0" (before EOF)

    expect(sql.slice(typeStart, typeEnd)).toBe("NUMERIC(10,2) DEFAULT 0");
  });
});

describe("tokenize — EOF handling for constructs with no closing delimiter", () => {
  it("does not throw when an identifier ends naturally at EOF", () => {
    expect(() => tokenize("users")).not.toThrow();
  });

  it("does not throw when a number ends naturally at EOF", () => {
    expect(() => tokenize("255")).not.toThrow();
  });

  it("always terminates the token stream with a single EOF token", () => {
    const tokens = tokenize("a, b");
    expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
    expect(tokens.filter((t) => t.type === TokenType.EOF)).toHaveLength(1);
  });
});

describe("tokenize — realistic CREATE TABLE snippet (integration-style)", () => {
  it("tokenizes a full MySQL-style column definition correctly", () => {
    const sql = [
      "CREATE TABLE `orders` (",
      "  `id` INT PRIMARY KEY, # auto increment",
      "  `user_id` INT,",
      "  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)",
      ")",
    ].join("\n");

    const tokens = tokenize(sql, mysqlDialect.tokenizer);

    expect(tokens[0]).toMatchObject({ type: TokenType.Identifier, value: "CREATE" });
    expect(tokens[1]).toMatchObject({ type: TokenType.Identifier, value: "TABLE" });
    expect(tokens[2]).toMatchObject({ type: TokenType.QuotedIdentifier, value: "orders" });

    const values = tokens.map((t) => t.value);
    expect(values).not.toContain("auto");
    expect(values).not.toContain("increment");

    expect(tokens[tokens.length - 2]).toMatchObject({
      type: TokenType.Punctuation,
      value: ")",
    });
  });
});