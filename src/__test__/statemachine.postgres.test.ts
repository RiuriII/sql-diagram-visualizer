/// <reference  types="jest" />

import { tokenize } from "../tokenize";
import { postgresDialect } from "../dialect";
import { runStateMachine, StateMachineError } from "../stateMachine";
import { Table } from "../interfaces";

/**
 * These tests deliberately do NOT re-test generic grammar already covered
 * by stateMachine.test.ts (comma-splitting, nested parens, generic FK
 * shapes, etc.) — that coverage is dialect-agnostic by construction and
 * already proven against MySQL. This file focuses specifically on what
 * changes when the dialect passed in is `postgresDialect` instead of
 * `mysqlDialect`: the whole point of the architecture is that the same
 * State Machine handles both correctly just by swapping the Dialect.
 */
const run = (sql: string): Table[] => {
  const tokens = tokenize(sql, postgresDialect.tokenizer);
  return runStateMachine(tokens, sql, postgresDialect);
};

describe("PostgreSQL — comments", () => {
  it("does NOT treat '#' as a comment marker (unlike MySQL)", () => {
    const sql = "CREATE TABLE t (id INT, tag VARCHAR(10) DEFAULT '#tag');";
    const tables = run(sql);
    expect(tables[0].column).toEqual([
      { name: "id", type: "INT" },
      { name: "tag", type: "VARCHAR(10) DEFAULT '#tag'" },
    ]);
  });

  it("still treats '--' as a comment, same as MySQL", () => {
    const sql = "CREATE TABLE t (\n  id INT, -- primary key\n  name TEXT\n);";
    const tables = run(sql);
    expect(tables[0].column.map((c) => c.name)).toEqual(["id", "name"]);
  });
});

describe("PostgreSQL — double-quoted identifiers", () => {
  it("supports double-quoted table and column names", () => {
    const sql = 'CREATE TABLE "Users" ("Full Name" TEXT);';
    const tables = run(sql);
    expect(tables[0].tableName).toBe("Users");
    expect(tables[0].column[0].name).toBe("Full Name");
  });

  it("supports a reserved word as a double-quoted column name", () => {
    const sql = 'CREATE TABLE settings ("key" VARCHAR(100), value TEXT);';
    const tables = run(sql);
    expect(tables[0].column.map((c) => c.name)).toEqual(["key", "value"]);
  });
});

describe("PostgreSQL — schema-qualified names", () => {
  it("drops the 'public.' schema qualifier from a table name", () => {
    const tables = run("CREATE TABLE public.users (id INT);");
    expect(tables[0].tableName).toBe("users");
  });

  it("drops the schema qualifier from a REFERENCES target", () => {
    const sql = `
      CREATE TABLE public.countries (id INT PRIMARY KEY);
      CREATE TABLE public.cities (
        id INT PRIMARY KEY,
        country_id INT REFERENCES public.countries(id)
      );
    `;
    const tables = run(sql);
    const cities = tables.find((t) => t.tableName === "cities")!;
    expect(cities.foreignKey).toEqual([{ foreignKey: "country_id", referenceTable: "countries" }]);
  });
});

describe("PostgreSQL — CREATE TABLE modifiers", () => {
  it("accepts CREATE TEMP TABLE", () => {
    const tables = run("CREATE TEMP TABLE session_data (id INT);");
    expect(tables[0].tableName).toBe("session_data");
  });

  it("accepts CREATE TEMPORARY TABLE (the non-abbreviated form)", () => {
    const tables = run("CREATE TEMPORARY TABLE session_data (id INT);");
    expect(tables[0].tableName).toBe("session_data");
  });

  it("accepts CREATE UNLOGGED TABLE", () => {
    const tables = run("CREATE UNLOGGED TABLE carts (id INT);");
    expect(tables[0].tableName).toBe("carts");
  });

  it("still rejects a modifier MySQL and Postgres both don't have, as a syntax error", () => {
    expect(() => run("CREATE POTATO TABLE users (id INT);")).toThrow(StateMachineError);
  });

  it("rejects MySQL's TEMPORARY-like non-word (sanity: MySQL has none, Postgres set is independent)", () => {
    expect(() => run("CREATE FOOBAR TABLE users (id INT);")).toThrow(StateMachineError);
  });
});

describe("PostgreSQL — EXCLUDE constraints", () => {
  it("discards an EXCLUDE constraint without modeling it as a column", () => {
    const sql = `
      CREATE TABLE reservations (
        id INT PRIMARY KEY,
        room_id INT,
        during TSRANGE,
        EXCLUDE USING gist (room_id WITH =, during WITH &&)
      );
    `;
    const tables = run(sql);
    expect(tables[0].column.map((c) => c.name)).toEqual(["id", "room_id", "during"]);
    expect(tables[0].foreignKey).toEqual([]);
  });
});

describe("PostgreSQL — LIKE ... INCLUDING ALL", () => {
  it("does not crash, and does not model LIKE as a bogus column", () => {
    const sql = `
      CREATE TABLE settings (id INT PRIMARY KEY, "key" VARCHAR(100));
      CREATE TABLE settings_backup (
        LIKE settings INCLUDING ALL
      );
    `;
    expect(() => run(sql)).not.toThrow();
  });

  it("results in the LIKE-clause table being filtered out entirely (zero real columns)", () => {
    const sql = `
      CREATE TABLE settings (id INT PRIMARY KEY, "key" VARCHAR(100));
      CREATE TABLE settings_backup (
        LIKE settings INCLUDING ALL
      );
      CREATE TABLE real_table (id INT);
    `;
    const tables = run(sql);
    expect(tables.map((t) => t.tableName)).toEqual(["settings", "real_table"]);
  });
});

describe("PostgreSQL — SERIAL / GENERATED ALWAYS AS IDENTITY types", () => {
  it("captures SERIAL as raw type text, unmodified", () => {
    const tables = run("CREATE TABLE t (id SERIAL PRIMARY KEY, name TEXT);");
    expect(tables[0].column[0]).toEqual({ name: "id", type: "SERIAL PRIMARY KEY" });
  });

  it("captures GENERATED ALWAYS AS IDENTITY as raw type text, unmodified", () => {
    const tables = run("CREATE TABLE t (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY);");
    expect(tables[0].column[0].type).toBe("BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY");
  });
});

describe("PostgreSQL — statements correctly ignored (out of CREATE TABLE scope)", () => {
  const casesAround = (statement: string) => `
    CREATE TABLE before_stmt (id INT);
    ${statement}
    CREATE TABLE after_stmt (id INT);
  `;

  it.each([
    ["CREATE INDEX", "CREATE INDEX idx_name ON before_stmt (id);"],
    ["CREATE SEQUENCE", "CREATE SEQUENCE audit_log_id_seq;"],
    ["ALTER SEQUENCE ... OWNED BY", "ALTER SEQUENCE audit_log_id_seq OWNED BY before_stmt.id;"],
    ["ALTER TABLE OWNER TO", "ALTER TABLE before_stmt OWNER TO admin;"],
    ["COMMENT ON TABLE", "COMMENT ON TABLE before_stmt IS 'a comment';"],
    ["SET", "SET search_path = public, pg_catalog;"],
  ])("%s has zero effect on the resulting tables", (_label, statement) => {
    const tables = run(casesAround(statement));
    expect(tables.map((t) => t.tableName)).toEqual(["before_stmt", "after_stmt"]);
  });
});

describe("PostgreSQL — inline REFERENCES produces the same model shape as MySQL", () => {
  it("produces both a column and a foreignKey entry for an inline REFERENCES", () => {
    const sql = `
      CREATE TABLE customers (id INT PRIMARY KEY);
      CREATE TABLE carts (
        id INT PRIMARY KEY,
        customer_id INT REFERENCES customers(id)
      );
    `;
    const tables = run(sql);
    const carts = tables.find((t) => t.tableName === "carts")!;
    expect(carts.column).toEqual([
      { name: "id", type: "INT PRIMARY KEY" },
      { name: "customer_id", type: "INT" },
    ]);
    expect(carts.foreignKey).toEqual([{ foreignKey: "customer_id", referenceTable: "customers" }]);
  });
});