/// <reference types="jest" />

import { readFileSync } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { readSqlFile, writeSvgFile } from "../utils/fileUtils";

describe("fileUtils", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "sql-visualizer-file-utils-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("readSqlFile", () => {
		it("reads an existing SQL file and returns its contents", async () => {
			const sqlPath = join(tempDir, "schema.sql");
			const sqlContent = "CREATE TABLE users (id INT PRIMARY KEY);";

			await writeFile(sqlPath, sqlContent, "utf8");

			expect(readSqlFile(sqlPath)).toBe(sqlContent);
		});

		it("throws a normalized error when the file does not exist", () => {
			const missingPath = join(tempDir, "missing.sql");

			expect(() => readSqlFile(missingPath)).toThrow(
				"File not found or could not be read"
			);
		});
	});

	describe("writeSvgFile", () => {
		beforeEach(() => {
			jest.spyOn(console, "log").mockImplementation(() => undefined);
			jest.spyOn(console, "error").mockImplementation(() => undefined);
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		it("writes SVG content to the requested file", async () => {
			const outputPath = join(tempDir, "diagram.svg");
			const svgContent = "<svg><text>Users</text></svg>";

			const writtenPath = await writeSvgFile(outputPath, svgContent);

			expect(writtenPath).toBe(outputPath);
			expect(readFileSync(outputPath, "utf8")).toBe(svgContent);
		});

		it("creates a missing output directory recursively", async () => {
			const outputDir = join(tempDir, "diagrams", "nested");
			const outputPath = join(outputDir, "diagram.svg");

			const writtenPath = await writeSvgFile(
				"diagram.svg",
				"<svg />",
				outputDir
			);

			expect(writtenPath).toBe(outputPath);
			expect(readFileSync(outputPath, "utf8")).toBe("<svg />");
		});

		it("uses the output directory when one is provided", async () => {
			const outputDir = join(tempDir, "output");

			const writtenPath = await writeSvgFile(
				"database.svg",
				"<svg>database</svg>",
				outputDir
			);

			expect(writtenPath).toBe(join(outputDir, "database.svg"));
			expect(readFileSync(writtenPath, "utf8")).toBe("<svg>database</svg>");
		});

		it("does not overwrite an existing file and generates the next available name", async () => {
			const outputPath = join(tempDir, "diagram.svg");

			await writeFile(outputPath, "original", "utf8");

			const writtenPath = await writeSvgFile(
				"diagram.svg",
				"replacement",
				tempDir
			);

			expect(writtenPath).toBe(join(tempDir, "diagram_(1).svg"));
			expect(readFileSync(outputPath, "utf8")).toBe("original");
			expect(readFileSync(writtenPath, "utf8")).toBe("replacement");
		});

		it("continues incrementing until an available name is found", async () => {
			await writeFile(join(tempDir, "diagram.svg"), "original", "utf8");
			await writeFile(
				join(tempDir, "diagram_(1).svg"),
				"original 1",
				"utf8"
			);
			await writeFile(
				join(tempDir, "diagram_(2).svg"),
				"original 2",
				"utf8"
			);

			const writtenPath = await writeSvgFile(
				"diagram.svg",
				"new content",
				tempDir
			);

			expect(writtenPath).toBe(join(tempDir, "diagram_(3).svg"));
			expect(readFileSync(writtenPath, "utf8")).toBe("new content");
		});

		it("preserves the file extension when generating a unique name", async () => {
			const outputPath = join(tempDir, "schema.diagram.svg");

			await writeFile(outputPath, "original", "utf8");

			const writtenPath = await writeSvgFile(
				"schema.diagram.svg",
				"<svg />",
				tempDir
			);

			expect(writtenPath).toBe(
				join(tempDir, "schema.diagram_(1).svg")
			);
		});

		it("propagates an error when the output directory cannot be created", async () => {
			const outputPath = join(tempDir, "not-a-directory");

			await writeFile(outputPath, "I am a file", "utf8");

			await expect(
				writeSvgFile("diagram.svg", "<svg />", outputPath)
			).rejects.toThrow(/EEXIST|file already exists/i);
		});
	});
});