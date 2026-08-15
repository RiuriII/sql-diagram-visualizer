# SQL Visualizer

A Visual Studio Code extension that converts SQL schema files into rich SVG diagrams, making it easy to visualize database structures, table relationships and foreign key hierarchies directly in the editor.

## Features

- **Multi-dialect support** — Parses both **MySQL** and **PostgreSQL** `CREATE TABLE` statements, including dialect-specific syntax (`TEMP`, `TEMPORARY`, `UNLOGGED` modifiers for PostgreSQL, `#` line comments for MySQL).
- **Intelligent layout** — Tables are positioned automatically using a **Sugiyama-style layered graph layout**: referenced (root) tables appear on the left, dependent tables are placed to the right, and vertical ordering within each level minimizes relationship-line crossings via a barycenter heuristic.
- **Relationship routing with arc jumps** — Foreign key connections are drawn as orthogonal (H→V→H) paths with rounded corners. When two lines cross, a small semicircular "hop" is rendered at the intersection point so every relationship remains visually traceable.
- **Schema statistics** — The generated SVG includes a footer panel with aggregate metrics: total tables, total columns, primary keys, foreign keys, average columns per table, root tables, leaf tables and hierarchy depth.
- **Color-coded legend** — Each relationship line receives a unique color from a 12-color palette. A built-in legend maps colors to `sourceTable.sourceColumn → targetTable.targetColumn`.
- **Three ways to generate** — Interactive command, right-click context menu, or fully automatic on-save via JSON settings.
- **PK / FK badges** — Columns are visually tagged with colored badges (orange for PK, blue for FK) inside each table card.
- **File size guard** — Input files larger than 5 MB are rejected before parsing, preventing the extension host from locking up on data dumps.

## How to Use

### Option 1 — Right-click (Context Menu)

1. Open a `.sql` file in Visual Studio Code.
2. Right-click the file in the Explorer sidebar.
3. Select **Convert SQL to Diagram**.
4. Enter a name for the output file (or leave blank for the default `diagram.svg`).
5. Select the SQL dialect (**MySQL** or **PostgreSQL**).
6. The SVG file is saved in the workspace root.

### Option 2 — Command Palette

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Search for **Convert SQL to Diagram**.
3. If no file is selected, a file picker dialog will open.
4. Follow the same name and dialect prompts as above.

### Option 3 — Automatic Generation (JSON Settings)

Add the following configuration to your VS Code `settings.json`:

```jsonc
{
  "sqlVisualizer.autoGenerate": true,
  "sqlVisualizer.inputPath": "./database/schema.sql",
  "sqlVisualizer.outputName": "schema-diagram",
  "sqlVisualizer.outputDir": "./docs",
  "sqlVisualizer.sqlDialect": "mysql"   // "mysql" or "postgres"
}
```

With `autoGenerate` enabled, the extension watches the configured `inputPath` file. Every time you save it, the diagram is regenerated automatically — no manual command needed.

| Setting | Type | Default | Description |
|---|---|---|---|
| `sqlVisualizer.inputPath` | `string` | `""` | Path to the SQL file used to generate the diagram. |
| `sqlVisualizer.sqlDialect` | `"mysql"` \| `"postgres"` | `"mysql"` | SQL dialect used to parse the input file. |
| `sqlVisualizer.outputName` | `string` | `"diagram"` | Name of the generated SVG file. |
| `sqlVisualizer.outputDir` | `string` | `"./"` | Directory relative to the workspace where the SVG file will be generated. |
| `sqlVisualizer.autoGenerate` | `boolean` | `false` | Automatically regenerate the SVG when the configured SQL file is saved. |

## Demo

[![How to use SQL Visualizer](https://img.youtube.com/vi/Oxhouf8-8lI/0.jpg)](https://youtu.be/Oxhouf8-8lI)

## Architecture (v2.0)

The extension follows a clean, layered pipeline where each stage is independently testable:

```
SQL file
  │
  ▼
Normalize  ─────────────  Whitespace/encoding cleanup
  │
  ▼
Tokenize   ─────────────  Dialect-agnostic lexer → Token[]
  │
  ▼
State Machine  ──────────  Dialect-aware parser → Table[]
  │                        (uses SqlDialect for keywords,
  │                         modifiers and header validation)
  ▼
Enrich Tables  ──────────  Marks PK/FK flags on columns
  │
  ▼
Sugiyama Layout  ────────  assignLevels → minimizeCrossings
  │
  ▼
SVG Generator  ──────────  Position tables, route connections,
  │                        spread overlapping segments,
  │                        detect crossings → arc-jump hops
  ▼
Handlebars Templates  ───  Compile final SVG document
  │
  ▼
Output .svg file
```

### Key modules

| Module | Responsibility |
|---|---|
| `normalizer.ts` | Strips BOM, normalizes line endings and collapses redundant whitespace. |
| `tokenize.ts` | Generic SQL lexer. Produces `Token[]` with position data. Dialect-agnostic. |
| `dialect.ts` | Defines `SqlDialect` interface and ships `mysqlDialect` / `postgresDialect`. |
| `stateMachine.ts` | Consumes tokens, walks through states (`Scanning → Header → Body → emit`), produces `Table[]`. |
| `enrichTable.ts` | Annotates columns with `isPK` / `isFK` flags and resolves `primaryKeyName`. |
| `sugiyamaLayout.ts` | Layer assignment + barycenter crossing minimization. |
| `pathCrossings.ts` | Geometric intersection detection and arc-jump rendering for H-V-H elbows. |
| `svgGenerator.ts` | Orchestrator: positions tables, routes connections, spreads vertical segments, builds SVG paths. |
| `svgTemplates.ts` | Handlebars template strings and shared `LAYOUT` constants. |
| `configuration.ts` | Reads `sqlVisualizer.*` settings from VS Code. |
| `conversionSvg.ts` | Glue service: runs the full pipeline end-to-end (VS Code–agnostic). |
| `extension.ts` | VS Code activation: registers commands and the on-save listener. |
| `fileUtils.ts` | File-system I/O: reads SQL files, creates output directories, resolves available file names and writes SVG files. |

## What Changed in 2.0

This is a ground-up rewrite of the parsing and rendering engine. The highlights:

- **Tokenizer + State Machine replaces line-by-line parsing** — The old inline parser read the SQL file line by line with regex. The new architecture splits the work into a proper lexer (`tokenize.ts`) and a finite state machine (`stateMachine.ts`), making the parser more robust, testable and extensible.
- **Dialect system** — MySQL and PostgreSQL are now first-class citizens via the `SqlDialect` interface. Adding a new dialect means implementing a single object — no changes to the tokenizer or state machine.
- **Sugiyama layered layout** — Tables are no longer positioned with a flat grid. `assignLevels` builds a dependency-aware hierarchy, and `minimizeCrossings` runs a multi-pass barycenter heuristic to reduce visual noise.
- **Arc-jump hop rendering** — When two relationship lines cross, a small semicircular arc is drawn so the diagram remains readable even with complex schemas.
- **Vertical segment spreading** — Overlapping connection segments are detected and fanned out so parallel lines run side by side instead of on top of each other.
- **Schema statistics footer** — The SVG now includes aggregate data about the schema (tables, columns, keys, hierarchy depth).
- **Auto-generate on save** — A new JSON-configurable mode watches the input file and regenerates the diagram automatically.
- **225 tests, 98.88% statements, 90.35% branches, 100% functions, 99.43% lines** — Comprehensive test suites cover the tokenizer, state machine (unit, integration, stability × dialect), layout engine, path crossings and SVG generator.

## Test Coverage

All 225 tests pass. Core engine coverage:

| Module            | Statements |   Branches | Functions |      Lines |
| ----------------- | ---------: | ---------: | --------: | ---------: |
| **All files**     | **98.88%** | **90.35%** |  **100%** | **99.43%** |
| **src**           | **99.03%** | **91.49%** |  **100%** | **99.68%** |
| `dialect.ts  `      |       100% |       100% |      100% |       100% |
| `pathCrossings.ts`  |     98.80% |     93.33% |      100% |       100% |
| `stateMachine.ts `  |       100% |     96.87% |      100% |       100% |
| `sugiyamaLayout.ts` |     99.07% |     88.63% |      100% |       100% |
| `svgGenerator.ts`   |     98.06% |     86.90% |      100% |     98.89% |
| `svgTemplates.ts `  |       100% |       100% |      100% |       100% |
| `tokenize.ts `      |     99.18% |        95% |      100% |       100% |
| **src/services**  |   **100%** |   **100%** |  **100%** |   **100%** |
| `conversionSvg.ts ` |       100% |       100% |      100% |       100% |
| **src/utils**     | **97.01%** | **79.31%** |  **100%** | **96.61%** |
| `enrichTable.ts`    |       100% |        80% |      100% |       100% |
| `fileUtils.ts`      |     94.73% |        75% |      100% |     94.28% |
| `normalizer.ts  `   |       100% |       100% |      100% |       100% |


```bash
npm test              # run all tests
```

## Known Issues

No known issues at this time. If you encounter any problems, feel free to report them by [opening an issue](https://github.com/RiuriII/sql-diagram-visualizer/issues) in the GitHub repository.

## License

[Apache License 2.0](LICENSE)
