/// <reference types="jest" />
/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tokenize } from "../tokenize";
import { mysqlDialect } from "../dialect";
import { runStateMachine } from "../stateMachine";
import { svgGenerator } from "../svgGenerator";

const dumpSql = readFileSync(join(process.cwd(), "src", "__test__", "mediumDump.sql"), "utf8");

describe("stability — medium-sized synthetic dump (~40 tables)", () => {
  it("parses the entire dump without throwing", () => {
    const tokens = tokenize(dumpSql, mysqlDialect.tokenizer);
    expect(() => runStateMachine(tokens, dumpSql, mysqlDialect)).not.toThrow();
  });

  it("produces the expected table count, correctly excluding ignored statements", () => {
    const tokens = tokenize(dumpSql, mysqlDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, mysqlDialect);

    const expectedTables = [
      "regions", "countries", "states", "cities",
      "customers", "customer_addresses", "customer_phones", "payment_methods",
      "categories", "brands", "products", "product_variants", "product_images", "product_reviews",
      "warehouses", "inventory",
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

  it("does not model the bodyless LIKE-clone statement", () => {
    const tokens = tokenize(dumpSql, mysqlDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, mysqlDialect);
    expect(tables.find((t) => t.tableName === "settings_backup")).toBeUndefined();
  });

  it("resolves every foreign key to a table that actually exists in the model", () => {
    const tokens = tokenize(dumpSql, mysqlDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, mysqlDialect);
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
    const tokens = tokenize(dumpSql, mysqlDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, mysqlDialect);
    const employees = tables.find((t) => t.tableName === "employees")!;
    expect(employees.foreignKey).toContainEqual({ foreignKey: "manager_id", referenceTable: "employees" });
  });

  it("generates a well-formed SVG from the full dump without throwing", () => {
    const tokens = tokenize(dumpSql, mysqlDialect.tokenizer);
    const tables = runStateMachine(tokens, dumpSql, mysqlDialect);

    let svg = "";
    expect(() => {
      svg = svgGenerator(tables);
    }).not.toThrow();

    expect(svg.trim().startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    // One <g id="table-..."> group per modeled table.
    for (const table of tables) {
      expect(svg).toContain(`id="table-${table.tableName}"`);
    }
  });
});