# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),

## [2.0.0] - 2026-08-09

A ground-up rewrite of the parsing and rendering engine. See the
[README's Architecture section](README.md#architecture-v20) for the full
pipeline and module breakdown.

### Added

- **PostgreSQL dialect support**, alongside MySQL — `TEMP`/`TEMPORARY`/`UNLOGGED`
  table modifiers, `EXCLUDE` constraints, `LIKE ... INCLUDING ALL`,
  double-quoted identifiers, and multi-level schema-qualified names
  (`public.users`, `mydb.schema.table`) are all recognized.
- **Dialect abstraction (`SqlDialect`)** — keywords, modifiers, and
  constraint-vs-column disambiguation are all data supplied by a dialect
  object. Supporting a new SQL dialect no longer requires touching the
  tokenizer or the parser itself.
- **Tokenizer** (`tokenize.ts`) — converts raw SQL into a `Token[]` with
  line/column position tracking, replacing the previous line-by-line
  regex scanning.
- **State Machine parser** (`stateMachine.ts`) — a dialect-agnostic parser
  driven entirely by the `SqlDialect` it's given, built on top of the
  tokenizer's output.
- **Sugiyama-style layered layout** (`sugiyamaLayout.ts`) — tables are
  assigned a horizontal level based on their foreign-key dependency depth
  (`assignLevels`), and ordered within each level to reduce relationship-
  line crossings using a barycenter heuristic (`minimizeCrossings`).
- **Arc-jump crossing indicators** (`pathCrossings.ts`) — when two
  relationship lines visually cross, a small semicircular "hop" is
  rendered at the intersection point, the same convention used in
  electrical schematics, so crossing lines stay visually distinguishable.
- **Vertical segment spreading** — relationship lines that would
  otherwise overlap (e.g. multiple foreign keys from the same table
  pointing at the same referenced table) are automatically fanned out
  into parallel lanes instead of rendering on top of one another.
- **Schema statistics footer** in the generated SVG — total tables,
  columns, primary keys, foreign keys, average columns per table, root
  tables, leaf tables, and hierarchy depth.
- **Color-coded relationship legend** mapping each connection's color to
  `sourceTable.sourceColumn → targetTable.targetColumn`.
- **Auto-generate on save** — a new `sqlVisualizer.autoGenerate` setting
  watches a configured input file and regenerates the diagram on every
  save, no manual command needed.
- **`services/conversionSvg.ts`** — the full read → parse → render →
  write pipeline, extracted into a single VS Code–independent service
  shared by both the interactive command and the auto-generate listener
  (previously duplicated across both entry points).
- **File-size guard** (5 MB) applied consistently to both the interactive
  command and the auto-generate listener — previously only the
  interactive command enforced it.
- **225 automated tests** across the tokenizer, dialect definitions,
  state machine (unit, integration, and stability suites for both
  dialects), layout engine, crossing detection, SVG generation, and file
  I/O.

### Changed

- Table positioning switched from a flat grid to the dependency-aware
  layered layout described above.
- Relationship lines are now routed as orthogonal (H→V→H) paths with
  rounded corners, instead of straight or unrouted connectors.
- `extension.ts` is now a thin orchestrator: it gathers options from user
  prompts or `sqlVisualizer.*` settings and hands them to
  `conversionSvg.ts`, rather than assembling the parsing pipeline inline.
- SVG generation responsibilities are now split across `sugiyamaLayout.ts`
  (layout), `pathCrossings.ts` (crossing detection), and `svgTemplates.ts`
  (Handlebars templates), instead of living in one monolithic generator.

### Fixed

- Inline `REFERENCES` in a column definition (e.g.
  `user_id INT REFERENCES users(id)`) is now correctly modeled as a
  foreign key relationship for both dialects. Previously, MySQL parsing
  left the `REFERENCES` clause embedded in the column's raw type text
  entirely unparsed, and PostgreSQL parsing recognized and stripped the
  clause but never registered the resulting relationship, silently
  dropping it from the model.
- MySQL's `CREATE TABLE new LIKE old;` clone shorthand no longer risks
  being misread as part of the preceding table's column list.
- Comments inside a string literal (e.g. a `DEFAULT` value containing
  `--` or `/* */`) are no longer mistaken for real SQL comments. The
  previous regex-based line cleaner had no concept of string-literal
  boundaries; the tokenizer does.

### Removed

- The legacy line-by-line, regex-based SQL parser.
- Duplicated per-entry-point pipeline assembly in `extension.ts`
  (superseded by `services/conversionSvg.ts`).

