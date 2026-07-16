import * as Handlebars from "handlebars";
import { Column, Connection, ForeignKey, SvgTable, Table } from "./interfaces";

/* =============================================================================
 * DESIGN CONSTANTS
 * ========================================================================== */

const PALETTE = ['#8B29A6', '#0D0C0C', '#232dfa', '#BA1511', '#0692E1', '#F58804', '#1A9A5B', '#E0B800', '#a10000', '#3f1054', '#4419d2', '#2b8334'];

const LAYOUT = {
    padding: { x: 140, y: 90 },
    origin: { x: 120, y: 180 },   // leaves room for the header
    headerHeight: 140,
    footerHeight: 100,
    legendHeight: 175,
    rowHeight: 40,
    headerRowHeight: 50,
    fontSize: 16,
    gridSize: 25,
};



/* =============================================================================
 * TEMPLATES (Handlebars, standard double-brace syntax)
 * ========================================================================== */

/**
 * Full SVG document template.
 * Includes: gradients, filters, grid, header, tables, connections, legend, footer.
 */
const svgTemplate = `
<svg xmlns=\"http://www.w3.org/2000/svg\"
     viewBox=\"0 0 {{svgWidth}} {{svgHeight}}\"
     width=\"{{svgWidth}}\" height=\"{{svgHeight}}\"
     preserveAspectRatio=\"xMinYMin meet\"
     font-family=\"Segoe UI, Arial, sans-serif\">

  <defs>
    <!-- soft drop shadow for tables -->
    <filter id=\"shadow\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\">
      <feDropShadow dx=\"3\" dy=\"4\" stdDeviation=\"4\" flood-color=\"#000\" flood-opacity=\"0.18\"/>
    </filter>

    <!-- header gradient -->
    <linearGradient id=\"headerGradient\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">
      <stop offset=\"0%\"  stop-color=\"#4A148C\"/>
      <stop offset=\"100%\" stop-color=\"#8B29A6\"/>
    </linearGradient>

    <!-- table header gradient -->
    <linearGradient id=\"tableHeaderGradient\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">
      <stop offset=\"0%\"  stop-color=\"#A335BF\"/>
      <stop offset=\"100%\" stop-color=\"#8B29A6\"/>
    </linearGradient>

    <!-- footer gradient -->
    <linearGradient id=\"footerGradient\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">
      <stop offset=\"0%\"  stop-color=\"#1a1a1a\"/>
      <stop offset=\"100%\" stop-color=\"#333333\"/>
    </linearGradient>

    <!-- background grid pattern -->
    <pattern id=\"grid\" width=\"{{gridSize}}\" height=\"{{gridSize}}\" patternUnits=\"userSpaceOnUse\">
      <path d=\"M {{gridSize}} 0 L 0 0 0 {{gridSize}}\" fill=\"none\" stroke=\"#e5e5e5\" stroke-width=\"0.5\"/>
    </pattern>
    <pattern id=\"gridMajor\" width=\"{{gridSizeMajor}}\" height=\"{{gridSizeMajor}}\" patternUnits=\"userSpaceOnUse\">
      <rect width=\"{{gridSizeMajor}}\" height=\"{{gridSizeMajor}}\" fill=\"url(#grid)\"/>
      <path d=\"M {{gridSizeMajor}} 0 L 0 0 0 {{gridSizeMajor}}\" fill=\"none\" stroke=\"#d0d0d0\" stroke-width=\"1\"/>
    </pattern>

    <!-- arrowhead markers (one per palette color) -->
    {{#each arrowMarkers}}
    <marker id=\"arrow-{{index}}\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\"
            markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\">
      <path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"{{color}}\"/>
    </marker>
    {{/each}}
  </defs>

  <!-- background -->
  <rect width=\"100%\" height=\"100%\" fill=\"#fafafa\"/>
  <rect x=\"0\" y=\"{{headerHeight}}\" width=\"100%\"
        height=\"{{gridAreaHeight}}\" fill=\"url(#gridMajor)\"/>

  <!-- ============================ HEADER ============================ -->
  <g id=\"diagram-header\">
    <rect x=\"0\" y=\"0\" width=\"{{svgWidth}}\" height=\"{{headerHeight}}\" fill=\"url(#headerGradient)\"/>
    <text x=\"40\" y=\"55\" font-size=\"30\" font-weight=\"700\" fill=\"#ffffff\">
      Database ER Diagram
    </text>
    <text x=\"40\" y=\"90\" font-size=\"15\" fill=\"#e0d0f0\">
      SQLVisualizer - Automatically generated from SQL schema
    </text>
  </g>

  <!-- ============================ CONNECTIONS ============================ -->
  <g id=\"connections\">
    {{#each connections}}
      <g class=\"connection\">
        <path d=\"{{pathData}}\"
              fill=\"none\"
              stroke=\"{{color}}\"
              stroke-width=\"2\"
              stroke-linecap=\"round\"
              stroke-linejoin=\"round\"
              marker-end=\"url(#arrow-{{colorIndex}})\"/>
        <!-- label pill -->
        <g transform=\"translate({{labelX}}, {{labelY}})\">
          <rect x=\"{{labelBoxX}}\" y=\"-11\" width=\"{{labelWidth}}\" height=\"22\" rx=\"11\"
                fill=\"#ffffff\" stroke=\"{{color}}\" stroke-width=\"1.5\" filter=\"url(#shadow)\"/>
          <text x=\"0\" y=\"4\" font-size=\"11\" font-weight=\"600\" fill=\"{{color}}\" text-anchor=\"middle\">
            {{label}}
          </text>
        </g>
      </g>
    {{/each}}
  </g>

  <!-- ============================ TABLES ============================ -->
  <g id=\"tables\">
    {{#each tables}}
      <g id=\"table-{{tableName}}\" transform=\"translate({{posX}}, {{posY}})\">
        {{{tableMarkup}}}
      </g>
    {{/each}}
  </g>

  <!-- ============================ LEGEND ============================ -->
  <g id=\"legend\" transform=\"translate(40, {{legendY}})\">
    <rect x=\"0\" y=\"0\" width=\"{{legendWidth}}\" height=\"{{legendHeight}}\"
          rx=\"10\" fill=\"#ffffff\" stroke=\"#e0e0e0\" filter=\"url(#shadow)\"/>
    <text x=\"20\" y=\"28\" font-size=\"16\" font-weight=\"700\" fill=\"#333333\">Legend</text>

    <!-- PK indicator -->
    <g transform=\"translate(20, 50)\">
      <circle cx=\"10\" cy=\"10\" r=\"9\" fill=\"#F58804\"/>
      <text x=\"10\" y=\"14\" font-size=\"10\" font-weight=\"700\" fill=\"#ffffff\" text-anchor=\"middle\">PK</text>
      <text x=\"30\" y=\"14\" font-size=\"13\" fill=\"#333333\">Primary Key</text>
    </g>

    <!-- FK indicator -->
    <g transform=\"translate(20, 80)\">
      <circle cx=\"10\" cy=\"10\" r=\"9\" fill=\"#444DF2\"/>
      <text x=\"10\" y=\"14\" font-size=\"10\" font-weight=\"700\" fill=\"#ffffff\" text-anchor=\"middle\">FK</text>
      <text x=\"30\" y=\"14\" font-size=\"13\" fill=\"#333333\">Foreign Key</text>
    </g>

    <!-- Regular column -->
    <g transform=\"translate(20, 110)\">
      <circle cx=\"10\" cy=\"10\" r=\"9\" fill=\"#cccccc\"/>
      <text x=\"30\" y=\"14\" font-size=\"13\" fill=\"#333333\">Regular column</text>
    </g>

    <!-- Relationship colors -->
    <text x=\"200\" y=\"45\" font-size=\"14\" font-weight=\"700\" fill=\"#333333\">Relationships</text>
    {{#each legendRelationships}}
      <g transform=\"translate(200, {{yPos}})\">
        <line x1=\"0\" y1=\"10\" x2=\"30\" y2=\"10\" stroke=\"{{color}}\" stroke-width=\"2.5\" stroke-linecap=\"round\"/>
        <circle cx=\"30\" cy=\"10\" r=\"3\" fill=\"{{color}}\"/>
        <text x=\"42\" y=\"14\" font-size=\"12\" fill=\"#333333\">{{label}}</text>
      </g>
    {{/each}}
  </g>

  <!-- ============================ FOOTER ============================ -->
  <g id=\"diagram-footer\" transform=\"translate(0, {{footerY}})\">
    <rect x=\"0\" y=\"0\" width=\"{{svgWidth}}\" height=\"{{footerHeight}}\" fill=\"url(#footerGradient)\"/>
    <text x=\"40\" y=\"35\" font-size=\"14\" font-weight=\"700\" fill=\"#ffffff\">SCHEMA STATISTICS</text>

    <g font-size=\"12\" fill=\"#e0e0e0\">
      <text x=\"40\"  y=\"60\">Total tables: <tspan font-weight=\"700\" fill=\"#ffffff\">{{stats.tables}}</tspan></text>
      <text x=\"200\" y=\"60\">Total columns: <tspan font-weight=\"700\" fill=\"#ffffff\">{{stats.columns}}</tspan></text>
      <text x=\"380\" y=\"60\">Primary keys: <tspan font-weight=\"700\" fill=\"#ffffff\">{{stats.primaryKeys}}</tspan></text>
      <text x=\"540\" y=\"60\">Foreign keys: <tspan font-weight=\"700\" fill=\"#ffffff\">{{stats.foreignKeys}}</tspan></text>
      <text x=\"700\" y=\"60\">Avg columns/table: <tspan font-weight=\"700\" fill=\"#ffffff\">{{stats.avgColumns}}</tspan></text>

      <text x=\"40\"  y=\"82\">Root tables: <tspan font-weight=\"700\" fill=\"#ffffff\">{{stats.rootTables}}</tspan></text>
      <text x=\"200\" y=\"82\">Leaf tables: <tspan font-weight=\"700\" fill=\"#ffffff\">{{stats.leafTables}}</tspan></text>
      <text x=\"380\" y=\"82\">Hierarchy depth: <tspan font-weight=\"700\" fill=\"#ffffff\">{{stats.levels}}</tspan></text>
    </g>
  </g>
</svg>
`;

/**
 * Table body template.
 * - Rounded rectangle with drop-shadow
 * - Gradient header with table name + column counter
 * - Per-column row with PK/FK indicators
 * - Table footer with column stats
 */
const tableTemplate = `
  <!-- table body -->
  <rect x=\"0\" y=\"0\" width=\"{{tableWidth}}\" height=\"{{tableHeight}}\"
        rx=\"8\" fill=\"#ffffff\" stroke=\"#333333\" stroke-width=\"1.2\" filter=\"url(#shadow)\"/>

  <!-- header -->
  <path d=\"M 0 8 Q 0 0 8 0 L {{headerRightX}} 0 Q {{tableWidth}} 0 {{tableWidth}} 8 L {{tableWidth}} 50 L 0 50 Z\"
        fill=\"url(#tableHeaderGradient)\"/>
  <text x=\"{{centerX}}\" y=\"24\" font-size=\"18\" font-weight=\"700\" fill=\"#ffffff\" text-anchor=\"middle\">
    {{tableName}}
  </text>
  <text x=\"{{centerX}}\" y=\"42\" font-size=\"11\" fill=\"#e0d0f0\" text-anchor=\"middle\" font-style=\"italic\">
    {{columnCount}} columns · level {{level}}
  </text>

  <!-- columns -->
  {{#each enrichedColumns}}
    <g transform=\"translate(0, {{rowY}})\">
      <rect x=\"1\" y=\"0\" width=\"{{rowWidth}}\" height=\"{{rowH}}\"
            fill=\"{{rowFill}}\"/>

      {{#if isPK}}
        <circle cx=\"20\" cy=\"20\" r=\"10\" fill=\"#F58804\"/>
        <text x=\"20\" y=\"24\" font-size=\"10\" font-weight=\"700\" fill=\"#ffffff\" text-anchor=\"middle\">PK</text>
      {{else}}{{#if isFK}}
        <circle cx=\"20\" cy=\"20\" r=\"10\" fill=\"#444DF2\"/>
        <text x=\"20\" y=\"24\" font-size=\"10\" font-weight=\"700\" fill=\"#ffffff\" text-anchor=\"middle\">FK</text>
      {{else}}
        <circle cx=\"20\" cy=\"20\" r=\"4\" fill=\"#cccccc\"/>
      {{/if}}{{/if}}

      <text x=\"40\" y=\"24\" font-size=\"14\" font-weight=\"{{nameWeight}}\" fill=\"#1a1a1a\">{{name}}</text>
      <text x=\"{{typeX}}\" y=\"24\" font-size=\"12\" fill=\"#666666\" text-anchor=\"end\" font-style=\"italic\">{{type}}</text>
    </g>
  {{/each}}

  <!-- table footer -->
  <rect x=\"1\" y=\"{{tableFooterY}}\" width=\"{{rowWidth}}\" height=\"26\"
        fill=\"#f7f7fa\"/>
  <text x=\"12\" y=\"{{tableFooterTextY}}\" font-size=\"10\" fill=\"#666666\">
    <tspan font-weight=\"700\" fill=\"#F58804\">{{pkCount}} PK</tspan>
    <tspan dx=\"8\" font-weight=\"700\" fill=\"#444DF2\">{{fkCount}} FK</tspan>
    <tspan dx=\"8\" fill=\"#666666\">{{plainCount}} cols</tspan>
  </text>
`;

/* =============================================================================
 * HANDLEBARS HELPERS
 * ========================================================================== */

Handlebars.registerHelper('centerX', function (this: any) {
    return this.tableWidth / 2;
});

Handlebars.registerHelper('headerRightX', function (this: any) {
    return this.tableWidth - 8;
});

/* =============================================================================
 * HIERARCHICAL LAYOUT (simple topological levels)
 * ========================================================================== */

/**
 * Assigns a \"level\" to each table:
 *  - level 0 => root tables (no outgoing FK to another table)
 *  - level N => max(level of referenced tables) + 1
 * Cycles are broken by capping recursion depth.
 */
const assignLevels = (tables: Table[]): Map<string, number> => {
    const levels = new Map<string, number>();
    const byName = new Map(tables.map(t => [t.tableName, t]));

    const resolve = (name: string, stack: Set<string>): number => {
        if (levels.has(name)) return levels.get(name)!;
        if (stack.has(name)) return 0; // cycle guard
        stack.add(name);

        const t = byName.get(name);
        if (!t || t.foreignKey.length === 0) {
            levels.set(name, 0);
            stack.delete(name);
            return 0;
        }

        let maxRef = -1;
        for (const fk of t.foreignKey) {
            if (fk.referenceTable === name) continue; // self-reference
            if (!byName.has(fk.referenceTable)) continue;
            maxRef = Math.max(maxRef, resolve(fk.referenceTable, stack));
        }
        const lvl = maxRef + 1;
        levels.set(name, lvl);
        stack.delete(name);
        return lvl;
    };

    tables.forEach(t => resolve(t.tableName, new Set()));
    return levels;
};

/* =============================================================================
 * WIDTH / HEIGHT ESTIMATION
 * ========================================================================== */

const estimateTextWidth = (text: string, fontSize: number) => text.length * fontSize * 0.6;

const calculateTableWidth = (columns: Column[], fontSize: number): number => {
    const paddingWidth = 100; // room for PK/FK badge + type on the right
    const minWidth = 240;
    let maxWidth = 0;
    columns.forEach(col => {
        const width = estimateTextWidth(col.name, fontSize) + estimateTextWidth(col.type, fontSize - 2);
        if (width > maxWidth) maxWidth = width;
    });
    return Math.max(minWidth, Math.ceil(maxWidth + paddingWidth));
};

/* =============================================================================
 * CONNECTION ROUTING (orthogonal path with elbow)
 * ========================================================================== */

/**
 * Builds an orthogonal (elbow) SVG path between source and target points.
 * Uses a mid-X breakpoint so lines are always horizontal → vertical → horizontal.
 */
const buildOrthogonalPath = (
    sx: number, sy: number, tx: number, ty: number
): { d: string; midX: number; midY: number } => {
    const midX = (sx + tx) / 2;
    const d = `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`;
    const midY = (sy + ty) / 2;
    return { d, midX, midY };
};

/**
 * Y position (inside a table) of a given column row.
 * Uses the constants from LAYOUT.
 */
const columnRowCenterY = (columnIndex: number): number =>
    LAYOUT.headerRowHeight + columnIndex * LAYOUT.rowHeight + LAYOUT.rowHeight / 2;

/* =============================================================================
 * TABLE GENERATION
 * ========================================================================== */

const tablesGenerator = (
    tables: Table[],
    levels: Map<string, number>
): (SvgTable & { level: number; columns: Column[] })[] => {

    const tableTemplateCompiled = Handlebars.compile(tableTemplate);

    // group by level
    const byLevel = new Map<number, Table[]>();
    tables.forEach(t => {
        const lvl = levels.get(t.tableName) ?? 0;
        if (!byLevel.has(lvl)) byLevel.set(lvl, []);
        byLevel.get(lvl)!.push(t);
    });

    // sort levels ascending; within each level, sort tables by name for stability
    const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);

    // Precompute widths per table
    const widths = new Map<string, number>();
    tables.forEach(t => widths.set(t.tableName, calculateTableWidth(t.column, LAYOUT.fontSize)));

    // Compute X of each level (cumulative column max width + padding)
    const levelX = new Map<number, number>();
    let cursorX = LAYOUT.origin.x;
    for (const lvl of sortedLevels) {
        levelX.set(lvl, cursorX);
        const colTables = byLevel.get(lvl)!;
        const maxW = Math.max(...colTables.map(t => widths.get(t.tableName)!));
        cursorX += maxW + LAYOUT.padding.x;
    }

    const result: (SvgTable & { level: number; columns: Column[] })[] = [];

    for (const lvl of sortedLevels) {
        const colTables = byLevel.get(lvl)!.sort((a, b) => a.tableName.localeCompare(b.tableName));
        let cursorY = LAYOUT.origin.y;

        colTables.forEach((table) => {
            const tableWidth = widths.get(table.tableName)!;
            const tableHeight =
                LAYOUT.headerRowHeight +           // header
                table.column.length * LAYOUT.rowHeight +
                26;                                // footer strip

            // For template convenience, precompute per-row Y and styling
            // Columns are already enriched by enrichTables() in parseSql
            const templateColumns = table.column.map((c, idx) => ({
                ...c,
                rowY: LAYOUT.headerRowHeight + idx * LAYOUT.rowHeight,
                rowH: LAYOUT.rowHeight,
                rowWidth: tableWidth - 2,
                rowFill: idx % 2 === 1 ? '#f7f5fa' : '#ffffff',
                typeX: tableWidth - 15,
                nameWeight: c.isPK || c.isFK ? '700' : '500',
            }));

            const pkCount = table.column.filter(c => c.isPK).length;
            const fkCount = table.column.filter(c => c.isFK).length;
            const plainCount = table.column.length - pkCount - fkCount;

            const tableMarkup = tableTemplateCompiled({
                tableName: table.tableName,
                tableWidth,
                tableHeight,
                level: lvl,
                columnCount: table.column.length,
                enrichedColumns: templateColumns,
                tableFooterY: LAYOUT.headerRowHeight + table.column.length * LAYOUT.rowHeight,
                tableFooterTextY: LAYOUT.headerRowHeight + table.column.length * LAYOUT.rowHeight + 17,
                pkCount, fkCount, plainCount,
            });

            result.push({
                tableName: table.tableName,
                tableMarkup,
                posX: levelX.get(lvl)!,
                posY: cursorY,
                tableWidth,
                tableHeight,
                columns: table.column,
                foreignKey: table.foreignKey,
                level: lvl,
            });

            cursorY += tableHeight + LAYOUT.padding.y;
        });
    }

    return result;
};

/* =============================================================================
 * CONNECTION GENERATION
 * ========================================================================== */

const connectionsGenerator = (
    data: Table[],
    svgTables: (SvgTable & { level: number })[]
): (Connection & { colorIndex: number; labelWidth: number; labelBoxX: number })[] => {

    const connections: (Connection & {
        colorIndex: number; labelWidth: number; labelBoxX: number
    })[] = [];

    const svgByName = new Map(svgTables.map(t => [t.tableName, t]));
    let fkCounter = 0;

    data.forEach((table) => {
        const source = svgByName.get(table.tableName);
        if (!source) return;

        table.foreignKey.forEach((fk: ForeignKey) => {
            const target = svgByName.get(fk.referenceTable);
            if (!target) return;

            // Column row Y (source FK column)
            const fkColIdx = source.columns.findIndex(c => c.name === fk.foreignKey);
            const sourceRowY = fkColIdx >= 0 ? columnRowCenterY(fkColIdx) : source.tableHeight / 2;

            // Column row Y (target PK column)
            const targetTable = data.find(t => t.tableName === fk.referenceTable) ?? table;
            const targetPKName = targetTable.primaryKeyName ?? 'id';
            const pkColIdx = target.columns.findIndex(c => c.name === targetPKName);
            const targetRowY = pkColIdx >= 0 ? columnRowCenterY(pkColIdx) : target.tableHeight / 2;

            // Decide source/target edge based on relative X position
            const sourceOnRight = source.posX < target.posX;
            const sx = source.posX + (sourceOnRight ? source.tableWidth : 0);
            const sy = source.posY + sourceRowY;
            const tx = target.posX + (sourceOnRight ? 0 : target.tableWidth);
            const ty = target.posY + targetRowY;

            const { d, midX, midY } = buildOrthogonalPath(sx, sy, tx, ty);

            const colorIndex = fkCounter % PALETTE.length;
            const color = PALETTE[colorIndex];
            const label = `${fk.foreignKey} → ${targetPKName}`;
            const labelWidth = Math.max(80, estimateTextWidth(label, 11) + 20);

            connections.push({
                sourcePosX: sx, sourcePosY: sy,
                targetPosX: tx, targetPosY: ty,
                color,
                colorIndex,
                label,
                sourceColumn: fk.foreignKey,
                targetColumn: targetPKName,
                sourceTable: table.tableName,
                targetTable: fk.referenceTable,
                pathData: d,
                labelX: midX,
                labelY: midY,
                labelWidth,
                labelBoxX: -labelWidth / 2,
            });

            fkCounter++;
        });
    });

    return connections;
};

/* =============================================================================
 * MAIN ENTRY POINT
 * ========================================================================== */

export const svgGenerator = (databaseTables: Table[]): string => {
    if (databaseTables.length === 0) throw new Error('No tables found');

    const svgTemplateCompiled = Handlebars.compile(svgTemplate);

    // 1. hierarchical layout
    const levels = assignLevels(databaseTables);

    // 2. tables (with positions, markup, PK/FK enrichment)
    const svgTables = tablesGenerator(databaseTables, levels);

    // 3. connections between tables
    const connections = connectionsGenerator(databaseTables, svgTables);

    // 4. document-level dimensions
    const maxX = Math.max(...svgTables.map(t => t.posX + t.tableWidth));
    const maxY = Math.max(...svgTables.map(t => t.posY + t.tableHeight));

    const svgWidth  = Math.max(1200, maxX + LAYOUT.padding.x);
    const contentHeight = maxY + LAYOUT.padding.y;
    const legendY  = contentHeight;
    const legendWidth = Math.min(560, svgWidth - 80);
    const footerY  = legendY + LAYOUT.legendHeight + 40;
    const svgHeight = footerY + LAYOUT.footerHeight;

    // 5. stats
    let totalCols = 0, totalPK = 0, totalFK = 0;
    svgTables.forEach(t => {
        totalCols += t.columns.length;
        totalPK   += t.columns.filter(c => c.isPK).length;
        totalFK   += t.columns.filter(c => c.isFK).length;
    });

    const levelValues = Array.from(new Set(svgTables.map(t => t.level))).sort((a, b) => a - b);
    const rootTables = svgTables.filter(t => t.level === 0).length;
    const referencedNames = new Set<string>();
    databaseTables.forEach(t => t.foreignKey.forEach(fk => referencedNames.add(fk.referenceTable)));
    const leafTables = svgTables.filter(t => !referencedNames.has(t.tableName)).length;

    const stats = {
        tables: svgTables.length,
        columns: totalCols,
        primaryKeys: totalPK,
        foreignKeys: totalFK,
        relationships: connections.length,
        levels: levelValues.length,
        rootTables,
        leafTables,
        avgColumns: (totalCols / svgTables.length).toFixed(1),
    };

    // 6. legend – one entry per unique relationship (up to 8)
    const legendRelationships = connections.slice(0, 8).map((c, i) => ({
        color: c.color,
        label: `${c.sourceTable}.${c.sourceColumn} → ${c.targetTable}.${c.targetColumn}`,
        yPos: 60 + i * 12,
    }));

    // 7. arrow markers – one per palette color used
    const arrowMarkers = PALETTE.map((color, index) => ({ color, index }));

    const svgContent = svgTemplateCompiled({
        svgWidth,
        svgHeight,
        headerHeight: LAYOUT.headerHeight,
        footerHeight: LAYOUT.footerHeight,
        legendHeight: LAYOUT.legendHeight,
        legendWidth,
        gridAreaHeight: svgHeight - LAYOUT.headerHeight - LAYOUT.footerHeight,
        gridSize: LAYOUT.gridSize,
        gridSizeMajor: LAYOUT.gridSize * 4,
        counterX: svgWidth - 400,
        tables: svgTables,
        connections,
        legendY,
        footerY,
        stats,
        legendRelationships,
        arrowMarkers,
    });

    return svgContent;
};