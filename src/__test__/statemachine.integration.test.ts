/// <reference types="jest" />

/**
 * Integration tests covering malicious SQL identifiers.
 *
 * The State Machine intentionally preserves quoted identifiers exactly as
 * written. HTML/SVG escaping is performed later by svgGenerator through
 * Handlebars' default escaping, making the renderer—not the parser—the
 * output security boundary.
 *
 * These tests verify both responsibilities:
 * - the parser preserves identifier contents unchanged;
 * - the generated SVG safely escapes those values.
 */
import {normalize} from "../utils/normalizer";
import { tokenize } from "../tokenize";
import { mysqlDialect } from "../dialect";
import { runStateMachine } from "../stateMachine";
import { svgGenerator } from "../svgGenerator";

const parse = (sql: string) => {
  const sqlNormalized = normalize(sql)
  const tokens = tokenize(sqlNormalized, mysqlDialect.tokenizer);
  return runStateMachine(tokens, sqlNormalized, mysqlDialect);
};

describe("integration — malicious identifiers through the full pipeline", () => {
  it("preserves a <script> table name unaltered in the intermediate model", () => {
    const sql = "CREATE TABLE `<script>alert(1)</script>` (id INT);";
    const tables = parse(sql);
    expect(tables[0].tableName).toBe("<script>alert(1)</script>");
  });

  it("preserves a malicious column name unaltered in the intermediate model", () => {
    const sql = 'CREATE TABLE users (`"><img src=x onerror=alert(1)>` INT);';
    const tables = parse(sql);
    expect(tables[0].column[0].name).toBe('"><img src=x onerror=alert(1)>');
  });

  it("escapes a malicious table name when rendered into the final SVG", () => {
    const sql = "CREATE TABLE `<script>alert(1)</script>` (id INT);";
    const tables = parse(sql);
    const svg = svgGenerator(tables);

    expect(svg).not.toContain("<script>alert(1)</script>");
    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes a malicious column name and type when rendered into the final SVG", () => {
    const sql = 'CREATE TABLE users (`"><img src=x onerror=alert(1)>` INT);';
    const tables = parse(sql);
    const svg = svgGenerator(tables);

    expect(svg).not.toContain('"><img src=x onerror=alert(1)>');
    expect(svg).toContain("&quot;&gt;&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;");
  });

  it("escapes an ampersand and quotes in an identifier", () => {
    const sql = 'CREATE TABLE `Tom & Jerry"s Data` (id INT);';
    const tables = parse(sql);
    const svg = svgGenerator(tables);

    expect(svg).not.toContain('Tom & Jerry"s Data');
    expect(svg).toContain("Tom &amp; Jerry&quot;s Data");
  });

  it("produces a well-formed, parseable SVG document even with malicious identifiers present", () => {
    const sql = "CREATE TABLE `<b>bold</b>` (id INT, `<i>italic</i>` TEXT);";
    const tables = parse(sql);
    const svg = svgGenerator(tables);

    expect(svg.trim().startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    expect(svg).not.toMatch(/<b>bold<\/b>/);
    expect(svg).not.toMatch(/<i>italic<\/i>/);
  });
});