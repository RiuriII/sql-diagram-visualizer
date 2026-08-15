/// <reference types="jest" />

import { assignLevels, minimizeCrossings, estimateTextWidth, calculateTableWidth } from "../sugiyamaLayout";
import { Table } from "../interfaces";

const table = (name: string, fks: string[] = [], columnCount = 3): Table => ({
  tableName: name,
  column: Array.from({ length: columnCount }, (_, i) => ({ name: `col${i}`, type: "INT" })),
  foreignKey: fks.map(ref => ({ foreignKey: `${ref}_id`, referenceTable: ref })),
});

describe("assignLevels", () => {
  it("assigns level 0 to a table with no foreign keys", () => {
    const levels = assignLevels([table("users")]);
    expect(levels.get("users")).toBe(0);
  });

  it("assigns level 1 to a table referencing a level-0 table", () => {
    const tables = [table("users"), table("orders", ["users"])];
    const levels = assignLevels(tables);
    expect(levels.get("users")).toBe(0);
    expect(levels.get("orders")).toBe(1);
  });

  it("assigns the level as max(referenced levels) + 1 across multiple FKs", () => {
    const tables = [
      table("users"),
      table("products"),
      table("categories", ["products"]),
      table("orders", ["users", "categories"]),
    ];
    const levels = assignLevels(tables);
    expect(levels.get("categories")).toBe(1);
    expect(levels.get("orders")).toBe(2); // max(users=0, categories=1) + 1
  });

  it("ignores a self-referencing foreign key when computing level", () => {
    const tables = [table("employees", ["employees"])];
    const levels = assignLevels(tables);
    expect(levels.get("employees")).toBe(0);
  });

  it("ignores a foreign key pointing at a table that isn't in the model", () => {
    const tables = [table("orders", ["nonexistent_table"])];
    const levels = assignLevels(tables);
    expect(levels.get("orders")).toBe(0);
  });

  it("breaks a two-table cycle without infinite recursion", () => {
    const tables = [table("a", ["b"]), table("b", ["a"])];
    expect(() => assignLevels(tables)).not.toThrow();
    const levels = assignLevels(tables);
    expect(levels.get("a")).toBeGreaterThanOrEqual(0);
    expect(levels.get("b")).toBeGreaterThanOrEqual(0);
  });

  it("assigns a level entry for every table in the input", () => {
    const tables = [table("a"), table("b", ["a"]), table("c", ["b"])];
    const levels = assignLevels(tables);
    expect(levels.size).toBe(3);
  });
});

describe("minimizeCrossings", () => {
  it("returns alphabetical order when there is only one level", () => {
    const tables = [table("zebra"), table("apple"), table("mango")];
    const levels = assignLevels(tables);
    const order = minimizeCrossings(tables, levels);
    expect(order.get("apple")).toBe(0);
    expect(order.get("mango")).toBe(1);
    expect(order.get("zebra")).toBe(2);
  });

  it("assigns an order entry for every table across multiple levels", () => {
    const tables = [table("users"), table("orders", ["users"]), table("items", ["orders"])];
    const levels = assignLevels(tables);
    const order = minimizeCrossings(tables, levels);
    expect(order.size).toBe(3);
  });

  it("produces a deterministic result across repeated runs on the same input", () => {
    const tables = [
      table("users"), table("products"),
      table("orders", ["users"]), table("order_items", ["orders", "products"]),
    ];
    const levels = assignLevels(tables);
    const order1 = minimizeCrossings(tables, levels);
    const order2 = minimizeCrossings(tables, levels);
    expect(Object.fromEntries(order1)).toEqual(Object.fromEntries(order2));
  });

  it("does not crash on a table with no relevant same-adjacent-level neighbors", () => {
    // A table 2+ levels away from everything it references (level-skipping
    // edge) has zero adjacent-level neighbors for the barycenter pass —
    // must not throw, and must still receive a valid order position.
    const tables = [
      table("a"),
      table("b", ["a"]),
      table("c", ["b"]),
      table("d", ["a"]), // references 'a' directly, skipping level 1
    ];
    const levels = assignLevels(tables);
    expect(() => minimizeCrossings(tables, levels)).not.toThrow();
    const order = minimizeCrossings(tables, levels);
    expect(order.has("d")).toBe(true);
  });

  it("keeps a stable alphabetical tie-break when barycenter scores are equal", () => {
    // Two level-0 tables with no incoming references at all (isolated
    // roots) — barycenter has nothing to differentiate them, so they must
    // fall back to alphabetical order rather than an arbitrary one.
    const tables = [table("zzz_isolated"), table("aaa_isolated"), table("mid", ["aaa_isolated"])];
    const levels = assignLevels(tables);
    const order = minimizeCrossings(tables, levels);
    expect(order.get("aaa_isolated")).toBeLessThan(order.get("zzz_isolated")!);
  });
});

describe("estimateTextWidth", () => {
  it("scales roughly linearly with text length", () => {
    expect(estimateTextWidth("aaaa", 16)).toBeCloseTo(estimateTextWidth("aa", 16) * 2, 5);
  });

  it("returns 0 for empty text", () => {
    expect(estimateTextWidth("", 16)).toBe(0);
  });
});

describe("calculateTableWidth", () => {
  it("never returns less than the minimum width for a table with short columns", () => {
    const width = calculateTableWidth([{ name: "id", type: "INT" }], 16);
    expect(width).toBeGreaterThanOrEqual(240);
  });

  it("grows to accommodate a long column name/type", () => {
    const short = calculateTableWidth([{ name: "id", type: "INT" }], 16);
    const long = calculateTableWidth(
      [{ name: "a_very_long_descriptive_column_name", type: "VARCHAR(255) NOT NULL DEFAULT ''" }],
      16
    );
    expect(long).toBeGreaterThan(short);
  });
});