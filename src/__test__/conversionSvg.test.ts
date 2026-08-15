/// <reference types="jest" />

import { existsSync, readFileSync } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { convertSqlToSvg } from "../services/conversionSvg";

describe("convertSqlToSvg — integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sql-visualizer-conversion-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("runs the complete MySQL pipeline and writes the generated SVG", async () => {
    const inputPath = join(tempDir, "schema.sql");
    const outputDir = join(tempDir, "diagrams");
    const sql = `
      CREATE TABLE users (
        id INT PRIMARY KEY,
        name VARCHAR(100) NOT NULL
      );

      CREATE TABLE posts (
        id INT PRIMARY KEY,
        user_id INT,
        title VARCHAR(200),
        CONSTRAINT fk_posts_user
          FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `;

    await writeFile(inputPath, sql, "utf8");

    const outputPath = await convertSqlToSvg({
      inputPath,
      outputName: "database",
      outputDir,
      dialectChoice: "mysql",
    });

    expect(outputPath).toBe(join(outputDir, "database.svg"));
    expect(existsSync(outputPath)).toBe(true);

    const svg = readFileSync(outputPath, "utf8");

    expect(svg).toContain("<svg");
    expect(svg).toContain("users");
    expect(svg).toContain("posts");
    expect(svg.length).toBeGreaterThan(0);
  });

  it("accepts an output name that already includes the .svg extension", async () => {
    const inputPath = join(tempDir, "schema.sql");
    const sql = `
      CREATE TABLE users (
        id INT PRIMARY KEY
      );
    `;

    await writeFile(inputPath, sql, "utf8");

    const outputPath = await convertSqlToSvg({
      inputPath,
      outputName: "database.svg",
      outputDir: tempDir,
      dialectChoice: "mysql",
    });

    expect(outputPath).toBe(join(tempDir, "database.svg"));
    expect(existsSync(outputPath)).toBe(true);
  });

  it("runs the complete PostgreSQL pipeline", async () => {
    const inputPath = join(tempDir, "schema.sql");
    const outputDir = join(tempDir, "postgres-diagrams");
    const sql = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name VARCHAR(100) NOT NULL
      );

      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        title VARCHAR(200)
      );
    `;

    await writeFile(inputPath, sql, "utf8");

    const outputPath = await convertSqlToSvg({
      inputPath,
      outputName: "postgres-database",
      outputDir,
      dialectChoice: "postgres",
    });

    expect(outputPath).toBe(join(outputDir, "postgres-database.svg"));
    expect(existsSync(outputPath)).toBe(true);

    const svg = readFileSync(outputPath, "utf8");

    expect(svg).toContain("<svg");
    expect(svg).toContain("users");
    expect(svg).toContain("posts");
  });

  it("propagates an input-file error instead of silently generating output", async () => {
    const inputPath = join(tempDir, "missing.sql");

    await expect(
      convertSqlToSvg({
        inputPath,
        outputName: "database",
        outputDir: tempDir,
        dialectChoice: "mysql",
      })
    ).rejects.toThrow("File not found or could not be read");

    expect(existsSync(join(tempDir, "database.svg"))).toBe(false);
  });

  it("generates a unique output when the requested SVG already exists", async () => {
    const inputPath = join(tempDir, "schema.sql");
    const outputPath = join(tempDir, "database.svg");
    const sql = `
      CREATE TABLE users (
        id INT PRIMARY KEY
      );
    `;

    await writeFile(inputPath, sql, "utf8");
    await writeFile(outputPath, "existing SVG", "utf8");

    const generatedPath = await convertSqlToSvg({
      inputPath,
      outputName: "database",
      outputDir: tempDir,
      dialectChoice: "mysql",
    });

    expect(generatedPath).toBe(join(tempDir, "database_(1).svg"));
    expect(readFileSync(outputPath, "utf8")).toBe("existing SVG");
    expect(readFileSync(generatedPath, "utf8")).toContain("<svg");
  });
});