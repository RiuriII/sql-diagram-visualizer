/// <reference types="jest" />

import { mysqlDialect, CreateTableHeader, postgresDialect } from "../dialect";


describe("mysqlDialect — tokenizer config", () => {
  it("exposes '#' as an extra line comment marker", () => {
    expect(mysqlDialect.tokenizer.extraLineCommentMarkers).toEqual(["#"]);
  });
});

describe("mysqlDialect — keywords", () => {
  it("recognizes the structural keywords needed for headers and FK grammar", () => {
    const expected = [
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
    ];
    for (const kw of expected) {
      expect(mysqlDialect.keywords.has(kw)).toBe(true);
    }
  });
});

describe("mysqlDialect — createTableModifierKeywords", () => {
  it("is empty, since MySQL accepts no modifier words between CREATE and TABLE", () => {
    expect(mysqlDialect.createTableModifierKeywords.size).toBe(0);
  });
});

describe("mysqlDialect — nonColumnKeywords", () => {
  it("includes MySQL-specific bare INDEX/KEY constraint markers", () => {
    expect(mysqlDialect.nonColumnKeywords.has("INDEX")).toBe(true);
    expect(mysqlDialect.nonColumnKeywords.has("KEY")).toBe(true);
  });

  it("includes the constraint keywords shared with other dialects", () => {
    const shared = ["PRIMARY", "UNIQUE", "CONSTRAINT", "FOREIGN", "CHECK"];
    for (const kw of shared) {
      expect(mysqlDialect.nonColumnKeywords.has(kw)).toBe(true);
    }
  });

  it("does not include EXCLUDE, which is PostgreSQL-only", () => {
    expect(mysqlDialect.nonColumnKeywords.has("EXCLUDE")).toBe(false);
  });
});

describe("mysqlDialect — isSupportedCreateTable", () => {
  const baseHeader: CreateTableHeader = {
    modifiers: [],
    ifNotExists: false,
    tableName: "users",
    hasBody: true,
  };

  it("accepts a standard CREATE TABLE with a column-list body", () => {
    expect(mysqlDialect.isSupportedCreateTable(baseHeader)).toBe(true);
  });

  it("accepts CREATE TABLE IF NOT EXISTS with a body", () => {
    expect(
      mysqlDialect.isSupportedCreateTable({ ...baseHeader, ifNotExists: true })
    ).toBe(true);
  });

  it("rejects a bodyless header, matching MySQL's `CREATE TABLE new LIKE old;` clone form", () => {
    expect(
      mysqlDialect.isSupportedCreateTable({ ...baseHeader, hasBody: false })
    ).toBe(false);
  });

  it("rejection is driven purely by hasBody, independent of table name or ifNotExists", () => {
    expect(
      mysqlDialect.isSupportedCreateTable({
        modifiers: [],
        ifNotExists: true,
        tableName: "anything",
        hasBody: false,
      })
    ).toBe(false);
  });
});

describe("postgresDialect — tokenizer config", () => {
  it("has no extra line comment markers ('#' is not a comment in PostgreSQL)", () => {
    expect(postgresDialect.tokenizer.extraLineCommentMarkers).toEqual([]);
  });
});

describe("postgresDialect — keywords", () => {
  it("recognizes the same structural keywords needed for headers and FK grammar", () => {
    const expected = [
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
    ];
    for (const kw of expected) {
      expect(postgresDialect.keywords.has(kw)).toBe(true);
    }
  });
});

describe("postgresDialect — createTableModifierKeywords", () => {
  it("accepts TEMP, TEMPORARY and UNLOGGED", () => {
    expect(postgresDialect.createTableModifierKeywords.has("TEMP")).toBe(true);
    expect(postgresDialect.createTableModifierKeywords.has("TEMPORARY")).toBe(true);
    expect(postgresDialect.createTableModifierKeywords.has("UNLOGGED")).toBe(true);
  });

  it("does not accept MySQL-only or unrelated modifiers", () => {
    expect(postgresDialect.createTableModifierKeywords.has("POTATO")).toBe(false);
  });
});

describe("postgresDialect — nonColumnKeywords", () => {
  it("includes EXCLUDE, which is PostgreSQL-only", () => {
    expect(postgresDialect.nonColumnKeywords.has("EXCLUDE")).toBe(true);
  });

  it("includes LIKE, so a LIKE-clause body is discarded rather than modeled as a bogus column", () => {
    expect(postgresDialect.nonColumnKeywords.has("LIKE")).toBe(true);
  });

  it("does not include bare INDEX/KEY, which MySQL supports but PostgreSQL does not allow inline", () => {
    expect(postgresDialect.nonColumnKeywords.has("INDEX")).toBe(false);
    expect(postgresDialect.nonColumnKeywords.has("KEY")).toBe(false);
  });

  it("includes the constraint keywords shared with MySQL", () => {
    const shared = ["PRIMARY", "UNIQUE", "CONSTRAINT", "FOREIGN", "CHECK"];
    for (const kw of shared) {
      expect(postgresDialect.nonColumnKeywords.has(kw)).toBe(true);
    }
  });
});

describe("postgresDialect — isSupportedCreateTable", () => {
  const baseHeader: CreateTableHeader = {
    modifiers: [],
    ifNotExists: false,
    tableName: "users",
    hasBody: true,
  };

  it("accepts a standard CREATE TABLE with a column-list body", () => {
    expect(postgresDialect.isSupportedCreateTable(baseHeader)).toBe(true);
  });

  it("accepts CREATE TEMP TABLE / CREATE UNLOGGED TABLE headers (modifiers are validated separately by the State Machine)", () => {
    expect(
      postgresDialect.isSupportedCreateTable({ ...baseHeader, modifiers: ["TEMP"] })
    ).toBe(true);
  });

  it("accepts a header for `CREATE TABLE new (LIKE old INCLUDING ALL)`, since it does have a body", () => {

    expect(postgresDialect.isSupportedCreateTable(baseHeader)).toBe(true);
  });

  it("rejects a bodyless header", () => {
    expect(
      postgresDialect.isSupportedCreateTable({ ...baseHeader, hasBody: false })
    ).toBe(false);
  });
});