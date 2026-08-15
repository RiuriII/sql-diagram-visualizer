/// <reference types="jest" />
/// <reference types="node" />

import { readFileSync } from "fs";
import { join } from "path";
import { tokenize } from "../tokenize";
import { postgresDialect } from "../dialect";
import { runStateMachine } from "../stateMachine";
import { svgGenerator } from "../svgGenerator";

const dumpSql = readFileSync(join(__dirname, "mediumDumpPostgres.sql"), "utf8");

describe("stability — medium-sized synthetic PostgreSQL dump", () => {
  it("parses the entire dump without throwing", () => {
    const tokens = tokenize(dumpSql, postgresDialect.tokenizer);
    expect(() => runStateMachine(tokens, dumpSql, postgresDialect)).not.toThrow();
  });

  it("produces the expected table count, correctly excluding ignored statements and the LIKE-clause table", () => {
    const tokens = tokenize(dumpSql, postgresDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, postgresDialect);

    const expectedTables = [
      "regions", "countries", "states", "cities",
      "customers", "customer_addresses", "customer_phones", "payment_methods",
      "categories", "brands", "products", "product_variants", "product_images", "product_reviews",
      "warehouses", "inventory", "warehouse_reservations",
      "order_statuses", "orders", "order_items", "order_payments", "shipments",
      "order_status_history", "returns",
      "coupons", "order_coupons",
      "carts", "cart_items",
      "support_tickets", "support_messages",
      "suppliers", "product_suppliers", "purchase_orders", "purchase_order_items",
      "departments", "employees", "warehouse_staff",
      "audit_log", "settings", "tags", "product_tags",
      "wishlists", "wishlist_items", "newsletter_subscriptions",
    ];

    expect(tables.map((t) => t.tableName)).toEqual(expectedTables);
  });

  it("does not model the settings_backup LIKE-clause table", () => {
    const tokens = tokenize(dumpSql, postgresDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, postgresDialect);
    expect(tables.find((t) => t.tableName === "settings_backup")).toBeUndefined();
  });

  it("correctly parses the CREATE UNLOGGED TABLE carts statement", () => {
    const tokens = tokenize(dumpSql, postgresDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, postgresDialect);
    const carts = tables.find((t) => t.tableName === "carts")!;
    expect(carts).toBeDefined();
    expect(carts.column.map((c) => c.name)).toEqual(["id", "customer_id"]);
  });

  it("discards the EXCLUDE constraint in warehouse_reservations without modeling it as a column", () => {
    const tokens = tokenize(dumpSql, postgresDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, postgresDialect);
    const reservations = tables.find((t) => t.tableName === "warehouse_reservations")!;
    expect(reservations.column.map((c) => c.name)).toEqual(["id", "warehouse_id", "reserved_range"]);
  });

  it("resolves every foreign key to a table that actually exists in the model", () => {
    const tokens = tokenize(dumpSql, postgresDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, postgresDialect);
    const tableNames = new Set(tables.map((t) => t.tableName));

    const danglingReferences: string[] = [];
    for (const table of tables) {
      for (const fk of table.foreignKey) {
        if (!tableNames.has(fk.referenceTable)) {
          danglingReferences.push(`${table.tableName}.${fk.foreignKey} -> ${fk.referenceTable}`);
        }
      }
    }

    expect(danglingReferences).toEqual([]);
  });

  it("captures a self-referencing foreign key correctly (employees.manager_id -> employees)", () => {
    const tokens = tokenize(dumpSql, postgresDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, postgresDialect);
    const employees = tables.find((t) => t.tableName === "employees")!;
    expect(employees.foreignKey).toContainEqual({ foreignKey: "manager_id", referenceTable: "employees" });
  });

  it("generates a well-formed SVG from the full dump without throwing", () => {
    const tokens = tokenize(dumpSql, postgresDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, postgresDialect);

    let svg = "";
    expect(() => {
      svg = svgGenerator(tables);
    }).not.toThrow();

    expect(svg.trim().startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    for (const table of tables) {
      expect(svg).toContain(`id="table-${table.tableName}"`);
    }
  });
});