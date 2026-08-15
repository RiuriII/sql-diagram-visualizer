/// <reference types="jest"/>

import { tokenize, Token, TokenType } from "../tokenize";
import { mysqlDialect } from "../dialect";
import { Table } from "../interfaces";
import {
  runStateMachine,
  parseHeader,
  splitBodyDefinitions,
  processDefinition,
  consumeQualifiedName,
  StateMachineError,
} from "../stateMachine";

/** Tokenizes a snippet and drops the trailing EOF — convenient for building
 * isolated `def` arrays to feed directly into processDefinition. */
const defTokens = (text: string): Token[] => {
  const tokens = tokenize(text, mysqlDialect.tokenizer);
  return tokens.slice(0, -1);
};

const emptyTable = (): Table => ({ tableName: "t", column: [], foreignKey: [] });

describe("consumeQualifiedName", () => {
  it("returns a bare name unchanged", () => {
    const tokens = defTokens("users");
    const result = consumeQualifiedName(tokens, 0);
    expect(result).toEqual({ name: "users", nextIndex: 1 });
  });

  it("drops a single schema qualifier, keeping only the last component", () => {
    const tokens = defTokens("public.users");
    const result = consumeQualifiedName(tokens, 0);
    expect(result?.name).toBe("users");
  });

  it("drops multiple qualifiers (db.schema.users), keeping only the last", () => {
    const tokens = defTokens("db.schema.users");
    const result = consumeQualifiedName(tokens, 0);
    expect(result?.name).toBe("users");
  });

  it("works with quoted identifiers in the chain", () => {
    const tokens = defTokens('"public"."Users"');
    const result = consumeQualifiedName(tokens, 0);
    expect(result?.name).toBe("Users");
  });

  it("returns null when the token at index isn't a name token", () => {
    const tokens = defTokens("(");
    const result = consumeQualifiedName(tokens, 0);
    expect(result).toBeNull();
  });
});

describe("parseHeader — Header Recognition", () => {
  const parse = (sql: string) => {
    const tokens = tokenize(sql, mysqlDialect.tokenizer);
    return parseHeader(tokens, 0, mysqlDialect);
  };

  it("recognizes a standard CREATE TABLE with a body", () => {
    const result = parse("CREATE TABLE users (");
    expect(result.isCreateTable).toBe(true);
    expect(result.header).toEqual({
      modifiers: [],
      ifNotExists: false,
      tableName: "users",
      hasBody: true,
    });
  });

  it("recognizes CREATE TABLE IF NOT EXISTS", () => {
    const result = parse("CREATE TABLE IF NOT EXISTS users (");
    expect(result.header?.ifNotExists).toBe(true);
    expect(result.header?.tableName).toBe("users");
  });

  it("drops schema qualifiers from the table name", () => {
    const result = parse("CREATE TABLE public.users (");
    expect(result.header?.tableName).toBe("users");
  });

  it("detects hasBody = false for a bodyless header (LIKE-clone shape)", () => {
    const result = parse("CREATE TABLE new LIKE old");
    expect(result.header?.hasBody).toBe(false);
  });

  it("does not recognize CREATE INDEX as CREATE TABLE (no TABLE in lookahead)", () => {
    const result = parse("CREATE INDEX idx ON orders (id)");
    expect(result.isCreateTable).toBe(false);
    expect(result.nextIndex).toBe(1); // resumes right after CREATE
  });

  it("does not recognize CREATE SEQUENCE as CREATE TABLE", () => {
    const result = parse("CREATE SEQUENCE orders_id_seq");
    expect(result.isCreateTable).toBe(false);
  });

  it("respects the lookahead cap: TABLE beyond the cap is not found", () => {
    const filler = Array.from({ length: 10 }, (_, i) => `w${i}`).join(" ");
    const result = parse(`CREATE ${filler} TABLE users (`);
    expect(result.isCreateTable).toBe(false);
  });

  it("throws on an unsupported CREATE TABLE modifier for MySQL", () => {
    expect(() => parse("CREATE TEMPORARY TABLE users (")).toThrow(StateMachineError);
  });

  it("throws when IF is not followed by NOT EXISTS", () => {
    expect(() => parse("CREATE TABLE IF users (")).toThrow(StateMachineError);
  });

  it("throws when no table name follows TABLE", () => {
    expect(() => parse("CREATE TABLE (")).toThrow(StateMachineError);
  });

  it("includes line/column position in thrown errors", () => {
    try {
      parse("CREATE TABLE IF users (");
      fail("expected StateMachineError");
    } catch (err) {
      expect(err).toBeInstanceOf(StateMachineError);
      expect((err as StateMachineError).line).toBe(1);
    }
  });
});

describe("splitBodyDefinitions — Body Parsing", () => {
  const split = (bodyWithParens: string) => {
    const tokens = tokenize(bodyWithParens, mysqlDialect.tokenizer);
    return splitBodyDefinitions(tokens, 0);
  };

  it("splits simple comma-separated column definitions", () => {
    const { definitions } = split("(id INT, name TEXT)");
    expect(definitions).toHaveLength(2);
    expect(definitions[0].map((t) => t.value)).toEqual(["id", "INT"]);
    expect(definitions[1].map((t) => t.value)).toEqual(["name", "TEXT"]);
  });

  it("does not split on a comma nested inside type parameters, e.g. NUMERIC(10,2)", () => {
    const { definitions } = split("(price NUMERIC(10,2))");
    expect(definitions).toHaveLength(1);
    expect(definitions[0].map((t) => t.value)).toEqual(["price", "NUMERIC", "(", "10", ",", "2", ")"]);
  });

  it("does not split on commas nested two levels deep", () => {
    const { definitions } = split("(qty INT CHECK (qty IN (1,2,3)))");
    expect(definitions).toHaveLength(1);
  });

  it("tolerates a single trailing comma right before the closing paren", () => {
    const { definitions } = split("(id INT, name TEXT,)");
    expect(definitions).toHaveLength(2);
  });

  it("throws on a leading comma right after the opening paren", () => {
    expect(() => split("(, id INT)")).toThrow(StateMachineError);
  });

  it("throws on a double (empty) comma between definitions", () => {
    expect(() => split("(id INT,, name TEXT)")).toThrow(StateMachineError);
  });

  it("throws when the body never closes before EOF", () => {
    expect(() => split("(id INT, name TEXT")).toThrow(StateMachineError);
  });

  it("returns the correct closeParenIndex", () => {
    const tokens = tokenize("(id INT)", mysqlDialect.tokenizer);
    const { closeParenIndex } = splitBodyDefinitions(tokens, 0);
    expect(tokens[closeParenIndex].type).toBe(TokenType.Punctuation);
    expect(tokens[closeParenIndex].value).toBe(")");
  });

  it("returns zero definitions for an empty body", () => {
    const { definitions } = split("()");
    expect(definitions).toHaveLength(0);
  });
});

describe("processDefinition — column and constraint dispatch", () => {
  const sqlOf = (text: string) => text; 

  it("adds a plain column with its exact raw type text", () => {
    const text = "price NUMERIC(10, 2) NOT NULL";
    const table = emptyTable();
    processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text));
    expect(table.column).toEqual([{ name: "price", type: "NUMERIC(10, 2) NOT NULL" }]);
    expect(table.foreignKey).toEqual([]);
  });

  it("adds a column with an inline REFERENCES clause as both a column and a foreign key", () => {
    const text = "user_id INT REFERENCES users(id)";
    const table = emptyTable();
    processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text));
    expect(table.column).toEqual([{ name: "user_id", type: "INT" }]);
    expect(table.foreignKey).toEqual([{ foreignKey: "user_id", referenceTable: "users" }]);
  });

  it("resolves a schema-qualified referenced table in inline REFERENCES to its last component", () => {
    const text = "user_id INT REFERENCES public.users(id)";
    const table = emptyTable();
    processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text));
    expect(table.foreignKey[0].referenceTable).toBe("users");
  });

  it("discards a PRIMARY KEY constraint without adding a column or foreign key", () => {
    const text = "PRIMARY KEY (id)";
    const table = emptyTable();
    processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text));
    expect(table.column).toEqual([]);
    expect(table.foreignKey).toEqual([]);
  });

  it("discards a UNIQUE constraint", () => {
    const table = emptyTable();
    processDefinition(defTokens("UNIQUE (email)"), mysqlDialect, table, "UNIQUE (email)");
    expect(table.column).toEqual([]);
  });

  it("discards a bare INDEX definition (MySQL secondary index)", () => {
    const table = emptyTable();
    processDefinition(defTokens("INDEX idx_email (email)"), mysqlDialect, table, "INDEX idx_email (email)");
    expect(table.column).toEqual([]);
  });

  it("discards a bare KEY definition (MySQL INDEX synonym)", () => {
    const table = emptyTable();
    processDefinition(defTokens("KEY idx_email (email)"), mysqlDialect, table, "KEY idx_email (email)");
    expect(table.column).toEqual([]);
  });

  it("discards a CHECK constraint", () => {
    const table = emptyTable();
    processDefinition(defTokens("CHECK (price > 0)"), mysqlDialect, table, "CHECK (price > 0)");
    expect(table.column).toEqual([]);
  });

  it("extracts a table-level FOREIGN KEY constraint without a CONSTRAINT prefix", () => {
    const text = "FOREIGN KEY (user_id) REFERENCES users(id)";
    const table = emptyTable();
    processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text));
    expect(table.foreignKey).toEqual([{ foreignKey: "user_id", referenceTable: "users" }]);
    expect(table.column).toEqual([]); 
  });

  it("extracts a table-level FOREIGN KEY constraint with a named CONSTRAINT prefix", () => {
    const text = "CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)";
    const table = emptyTable();
    processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text));
    expect(table.foreignKey).toEqual([{ foreignKey: "user_id", referenceTable: "users" }]);
  });

  it("supports quoted identifiers throughout a FOREIGN KEY constraint", () => {
    const text = "FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)";
    const table = emptyTable();
    processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text));
    expect(table.foreignKey).toEqual([{ foreignKey: "user_id", referenceTable: "users" }]);
  });

  it("throws on a FOREIGN KEY constraint with REFERENCES present but no table name after it", () => {
    const text = "FOREIGN KEY (user_id) REFERENCES";
    const table = emptyTable();
    expect(() => processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text))).toThrow(
      StateMachineError
    );
  });

  it("throws on a FOREIGN KEY constraint missing REFERENCES", () => {
    const text = "FOREIGN KEY (user_id)";
    const table = emptyTable();
    expect(() => processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text))).toThrow(
      StateMachineError
    );
  });

  it("throws on a FOREIGN KEY constraint with an unclosed column list", () => {
    const text = "FOREIGN KEY (user_id REFERENCES users(id)";
    const table = emptyTable();
    expect(() => processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text))).toThrow(
      StateMachineError
    );
  });

  it("throws when a column definition has no type at all", () => {
    const table = emptyTable();
    expect(() => processDefinition(defTokens("id"), mysqlDialect, table, "id")).toThrow(StateMachineError);
  });

  it("throws when inline REFERENCES has no type before it", () => {
    const text = "user_id REFERENCES users(id)";
    const table = emptyTable();
    expect(() => processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text))).toThrow(
      StateMachineError
    );
  });

  it("throws when inline REFERENCES has no table name after it", () => {
    const text = "user_id INT REFERENCES";
    const table = emptyTable();
    expect(() => processDefinition(defTokens(text), mysqlDialect, table, sqlOf(text))).toThrow(
      StateMachineError
    );
  });

  it("throws when neither a column name nor a known constraint keyword starts the definition", () => {
    const table = emptyTable();
    expect(() => processDefinition(defTokens("123 INT"), mysqlDialect, table, "123 INT")).toThrow(
      StateMachineError
    );
  });
});

describe("runStateMachine — orchestration (Scanning + full flow)", () => {
  const run = (sql: string): Table[] => {
    const tokens = tokenize(sql, mysqlDialect.tokenizer);
    return runStateMachine(tokens, sql, mysqlDialect);
  };

  it("parses a single simple table", () => {
    const sql = "CREATE TABLE users (id INT, name VARCHAR(100));";
    const tables = run(sql);
    expect(tables).toEqual([
      { tableName: "users", column: [{ name: "id", type: "INT" }, { name: "name", type: "VARCHAR(100)" }], foreignKey: [] },
    ]);
  });

  it("parses multiple tables with a cross-referencing foreign key", () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY, name TEXT);
      CREATE TABLE orders (
        order_id INT PRIMARY KEY,
        user_id INT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `;
    const tables = run(sql);
    expect(tables.map((t) => t.tableName)).toEqual(["users", "orders"]);
    const orders = tables.find((t) => t.tableName === "orders")!;
    expect(orders.foreignKey).toEqual([{ foreignKey: "user_id", referenceTable: "users" }]);
  });

  it("ignores a bodyless CREATE TABLE ... LIKE ... clone without breaking surrounding tables", () => {
    const sql = `
      CREATE TABLE users (id INT, name TEXT);
      CREATE TABLE users_backup LIKE users;
      CREATE TABLE orders (id INT);
    `;
    const tables = run(sql);
    expect(tables.map((t) => t.tableName)).toEqual(["users", "orders"]);
  });

  describe("statements corretamente ignorados (out of CREATE TABLE scope)", () => {
    const casesAround = (statement: string) => `
      CREATE TABLE before_stmt (id INT);
      ${statement}
      CREATE TABLE after_stmt (id INT);
    `;

    it.each([
      ["CREATE INDEX", "CREATE INDEX idx_name ON before_stmt (id);"],
      ["CREATE SEQUENCE", "CREATE SEQUENCE orders_id_seq;"],
      ["CREATE VIEW", "CREATE VIEW v_users AS SELECT * FROM before_stmt;"],
      ["ALTER TABLE", "ALTER TABLE before_stmt OWNER TO admin;"],
      ["COMMENT ON", "COMMENT ON TABLE before_stmt IS 'a comment';"],
    ])("%s has zero effect on the resulting tables", (_label, statement) => {
      const tables = run(casesAround(statement));
      expect(tables.map((t) => t.tableName)).toEqual(["before_stmt", "after_stmt"]);
    });
  });

  it("filters out a CREATE TABLE whose body has zero actual columns", () => {
    const sql = `
      CREATE TABLE constraints_only (
        PRIMARY KEY (a, b)
      );
      CREATE TABLE real_table (id INT);
    `;
    const tables = run(sql);
    expect(tables.map((t) => t.tableName)).toEqual(["real_table"]);
  });

  it("handles comments and blank lines between statements", () => {
    const sql = `
      -- users table
      CREATE TABLE users (
        id INT, -- primary key
        name TEXT
      );

      /* orders table */
      CREATE TABLE orders (id INT);
    `;
    const tables = run(sql);
    expect(tables.map((t) => t.tableName)).toEqual(["users", "orders"]);
  });

  it("handles CREATE TABLE IF NOT EXISTS end to end", () => {
    const sql = "CREATE TABLE IF NOT EXISTS users (id INT);";
    const tables = run(sql);
    expect(tables.map((t) => t.tableName)).toEqual(["users"]);
  });

  it("ignores MySQL trailing table options after the closing paren", () => {
    const sql = `
      CREATE TABLE users (id INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      CREATE TABLE orders (id INT);
    `;
    const tables = run(sql);
    expect(tables.map((t) => t.tableName)).toEqual(["users", "orders"]);
  });

  it("propagates a StateMachineError for an unsupported CREATE TABLE modifier", () => {
    expect(() => run("CREATE TEMPORARY TABLE users (id INT);")).toThrow(StateMachineError);
  });

  it("propagates a StateMachineError for an unterminated table body", () => {
    expect(() => run("CREATE TABLE users (id INT, name TEXT")).toThrow(StateMachineError);
  });

  it("propagates a StateMachineError for a malformed FOREIGN KEY inside an otherwise valid table", () => {
    const sql = `
      CREATE TABLE orders (
        id INT,
        FOREIGN KEY (user_id)
      );
    `;
    expect(() => run(sql)).toThrow(StateMachineError);
  });

  it("returns an empty array for SQL with no CREATE TABLE statements at all", () => {
    const tables = run("CREATE INDEX idx ON foo (bar);");
    expect(tables).toEqual([]);
  });
});