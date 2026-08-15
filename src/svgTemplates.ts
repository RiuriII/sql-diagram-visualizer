import * as Handlebars from "handlebars";

/**
 * Handlebars templates and shared layout constants for the ER diagram
 * SVG. svgGenerator.ts computes every position/size and passes the
 * results in here for interpolation — this file has no layout logic of
 * its own.
 *
 * Two templates, compiled separately:
 *   - `svgTemplate`: the full document (defs, header, connections layer,
 *     tables layer, legend, footer).
 *   - `tableTemplate`: a single table's markup, pre-compiled per table by
 *     svgGenerator.ts and spliced into `svgTemplate` via `{{{tableMarkup}}}`.
 *
 * Escaping: every user-controlled value (table/column names, types) is
 * interpolated with double braces (`{{value}}`), which Handlebars
 * HTML-escapes by default. `{{{tableMarkup}}}` is the one deliberate
 * triple-brace (unescaped) interpolation in this file — safe only because
 * its content is markup this file's own `tableTemplate` already produced
 * (and therefore already escaped whatever went into it), never raw user
 * input. Do not add another triple-brace interpolation for anything that
 * traces back to a table/column name or type without re-verifying this
 * reasoning still holds.
 */


/**
 * Pixel measurements shared by every layout/rendering function in this
 * module and in svgGenerator.ts, so table spacing, row height, etc. stay
 * consistent across the whole diagram without being repeated at each
 * call site.
 */
export const LAYOUT = {
    /** Horizontal/vertical gap between adjacent tables. */
    padding: { x: 140, y: 90 },
    /** Top-left corner where the first table is placed. */
    origin: { x: 120, y: 180 },
    headerHeight: 140,
    footerHeight: 100,
    legendHeight: 175,
    /** Height of a single column row inside a table. */
    rowHeight: 40,
    /** Height of a table's own header band (name + column count). */
    headerRowHeight: 50,
    fontSize: 16,
    /** Spacing of the faint background grid, in px. */
    gridSize: 25,
};



// Registered globally (once, at module load) rather than computed inline
// in svgGenerator.ts, since they're purely a function of the table
// context Handlebars is already iterating over (`this` inside
// `tableTemplate`'s `{{#each}}` blocks) — no data needs to travel through
// svgGenerator.ts just to compute a table's own horizontal center.

/** Horizontal center of the table currently being rendered. */
Handlebars.registerHelper("centerX", function (this: any) {
    return this.tableWidth / 2;
});

/** Right edge of the table's rounded header band (inset for the corner radius). */
Handlebars.registerHelper("headerRightX", function (this: any) {
    return this.tableWidth - 8;
});


// See this module's top-level docs for the escaping convention used
// throughout (double-brace everywhere except the one deliberate
// `{{{tableMarkup}}}` below).

export const svgTemplate = `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 {{svgWidth}} {{svgHeight}}"
     width="{{svgWidth}}" height="{{svgHeight}}"
     preserveAspectRatio="xMinYMin meet"
     font-family="Segoe UI, Arial, sans-serif">

  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="3" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.18"/>
    </filter>

    <linearGradient id="headerGradient" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"  stop-color="#4A148C"/>
      <stop offset="100%" stop-color="#8B29A6"/>
    </linearGradient>

    <linearGradient id="tableHeaderGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#A335BF"/>
      <stop offset="100%" stop-color="#8B29A6"/>
    </linearGradient>

    <linearGradient id="footerGradient" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"  stop-color="#1a1a1a"/>
      <stop offset="100%" stop-color="#333333"/>
    </linearGradient>

    <pattern id="grid" width="{{gridSize}}" height="{{gridSize}}" patternUnits="userSpaceOnUse">
      <path d="M {{gridSize}} 0 L 0 0 0 {{gridSize}}" fill="none" stroke="#e5e5e5" stroke-width="0.5"/>
    </pattern>
    <pattern id="gridMajor" width="{{gridSizeMajor}}" height="{{gridSizeMajor}}" patternUnits="userSpaceOnUse">
      <rect width="{{gridSizeMajor}}" height="{{gridSizeMajor}}" fill="url(#grid)"/>
      <path d="M {{gridSizeMajor}} 0 L 0 0 0 {{gridSizeMajor}}" fill="none" stroke="#d0d0d0" stroke-width="1"/>
    </pattern>

    {{#each arrowMarkers}}
    <marker id="arrow-{{index}}" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="{{color}}"/>
    </marker>
    {{/each}}
  </defs>

  <!-- background -->
  <rect width="100%" height="100%" fill="#fafafa"/>
  <rect x="0" y="{{headerHeight}}" width="100%"
        height="{{gridAreaHeight}}" fill="url(#gridMajor)"/>

  <!-- ============================ HEADER ============================ -->
  <g id="diagram-header">
    <rect x="0" y="0" width="{{svgWidth}}" height="{{headerHeight}}" fill="url(#headerGradient)"/>
    <text x="40" y="55" font-size="30" font-weight="700" fill="#ffffff">
      Database Schema Visualization
    </text>
    <text x="40" y="90" font-size="15" fill="#e0d0f0">
      Automatically generated by SQL Visualizer
    </text>
  </g>

  <!-- ============================ CONNECTIONS ============================ -->
  <g id="connections">
    {{#each connections}}
      <path d="{{pathData}}"
            fill="none"
            stroke="{{color}}"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            marker-end="url(#arrow-{{colorIndex}})"/>
    {{/each}}
  </g>

  <!-- ============================ TABLES ============================ -->
  <g id="tables">
    {{#each tables}}
      <g id="table-{{tableName}}" transform="translate({{posX}}, {{posY}})">
        {{{tableMarkup}}}
      </g>
    {{/each}}
  </g>

  <!-- ============================ LEGEND ============================ -->
  <g id="legend" transform="translate(40, {{legendY}})">
    <rect x="0" y="0" width="{{legendWidth}}" height="{{legendHeight}}"
          rx="10" fill="#ffffff" stroke="#e0e0e0" filter="url(#shadow)"/>
    <text x="20" y="28" font-size="16" font-weight="700" fill="#333333">Legend</text>

    <g transform="translate(20, 50)">
      <circle cx="10" cy="10" r="9" fill="#F58804"/>
      <text x="10" y="14" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">PK</text>
      <text x="30" y="14" font-size="13" fill="#333333">Primary Key</text>
    </g>

    <g transform="translate(20, 80)">
      <circle cx="10" cy="10" r="9" fill="#444DF2"/>
      <text x="10" y="14" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">FK</text>
      <text x="30" y="14" font-size="13" fill="#333333">Foreign Key</text>
    </g>

    <g transform="translate(20, 110)">
      <circle cx="10" cy="10" r="9" fill="#cccccc"/>
      <text x="30" y="14" font-size="13" fill="#333333">Regular column</text>
    </g>

    <text x="200" y="45" font-size="14" font-weight="700" fill="#333333">Relationships</text>
    {{#each legendRelationships}}
      <g transform="translate(200, {{yPos}})">
        <line x1="0" y1="10" x2="30" y2="10" stroke="{{color}}" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="30" cy="10" r="3" fill="{{color}}"/>
        <text x="42" y="14" font-size="12" fill="#333333">{{label}}</text>
      </g>
    {{/each}}
  </g>

  <!-- ============================ FOOTER ============================ -->
  <g id="diagram-footer" transform="translate(0, {{footerY}})">
    <rect x="0" y="0" width="{{svgWidth}}" height="{{footerHeight}}" fill="url(#footerGradient)"/>
    <text x="40" y="35" font-size="14" font-weight="700" fill="#ffffff">SCHEMA STATISTICS</text>

    <g font-size="12" fill="#e0e0e0">
      <text x="40"  y="60">Total tables: <tspan font-weight="700" fill="#ffffff">{{stats.tables}}</tspan></text>
      <text x="200" y="60">Total columns: <tspan font-weight="700" fill="#ffffff">{{stats.columns}}</tspan></text>
      <text x="380" y="60">Primary keys: <tspan font-weight="700" fill="#ffffff">{{stats.primaryKeys}}</tspan></text>
      <text x="540" y="60">Foreign keys: <tspan font-weight="700" fill="#ffffff">{{stats.foreignKeys}}</tspan></text>
      <text x="700" y="60">Avg columns/table: <tspan font-weight="700" fill="#ffffff">{{stats.avgColumns}}</tspan></text>

      <text x="40"  y="82">Root tables: <tspan font-weight="700" fill="#ffffff">{{stats.rootTables}}</tspan></text>
      <text x="200" y="82">Leaf tables: <tspan font-weight="700" fill="#ffffff">{{stats.leafTables}}</tspan></text>
      <text x="380" y="82">Hierarchy depth: <tspan font-weight="700" fill="#ffffff">{{stats.levels}}</tspan></text>
    </g>
  </g>
</svg>
`;


export const tableTemplate = `
  <!-- table body -->
  <rect x="0" y="0" width="{{tableWidth}}" height="{{tableHeight}}"
        rx="8" fill="#ffffff" stroke="#333333" stroke-width="1.2" filter="url(#shadow)"/>

  <!-- header -->
  <path d="M 0 8 Q 0 0 8 0 L {{headerRightX}} 0 Q {{tableWidth}} 0 {{tableWidth}} 8 L {{tableWidth}} 50 L 0 50 Z"
        fill="url(#tableHeaderGradient)"/>
  <text x="{{centerX}}" y="24" font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle">
    {{tableName}}
  </text>
  <text x="{{centerX}}" y="42" font-size="11" fill="#e0d0f0" text-anchor="middle" font-style="italic">
    {{columnCount}} columns · level {{level}}
  </text>

  <!-- columns -->
  {{#each enrichedColumns}}
    <g transform="translate(0, {{rowY}})">
      <rect x="1" y="0" width="{{rowWidth}}" height="{{rowH}}"
            fill="{{rowFill}}"/>

      {{#if isPK}}
        <circle cx="20" cy="20" r="10" fill="#F58804"/>
        <text x="20" y="24" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">PK</text>
      {{else}}{{#if isFK}}
        <circle cx="20" cy="20" r="10" fill="#444DF2"/>
        <text x="20" y="24" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">FK</text>
      {{else}}
        <circle cx="20" cy="20" r="4" fill="#cccccc"/>
      {{/if}}{{/if}}

      <text x="40" y="24" font-size="14" font-weight="{{nameWeight}}" fill="#1a1a1a">{{name}}</text>
      <text x="{{typeX}}" y="24" font-size="12" fill="#666666" text-anchor="end" font-style="italic">{{type}}</text>
    </g>
  {{/each}}

  <!-- table footer -->
  <rect x="1" y="{{tableFooterY}}" width="{{rowWidth}}" height="26"
        fill="#f7f7fa"/>
  <text x="12" y="{{tableFooterTextY}}" font-size="10" fill="#666666">
    <tspan font-weight="700" fill="#F58804">{{pkCount}} PK</tspan>
    <tspan dx="8" font-weight="700" fill="#444DF2">{{fkCount}} FK</tspan>
    <tspan dx="8" fill="#666666">{{plainCount}} cols</tspan>
  </text>
`;