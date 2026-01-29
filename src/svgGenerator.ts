import * as Handlebars from "handlebars";
import { Column, Connection, SvgTable, Table } from "./interfaces";

/**
 * Main SVG template that contains the overall diagram structure.
 * Uses Handlebars for dynamic rendering of tables and connections.
 * 
 * - viewBox: Defines the visible area of the SVG (3000x1000)
 * - preserveAspectRatio: Maintains aspect ratio when resizing
 * - connections: Lines that represent foreign keys between tables
 * - tables: SVG groups with visual representations of tables
 **/
const svgTemplate = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 1000" preserveAspectRatio="xMinYMin meet">
{{#each connections}}
      <line x1="{{sourcePosX}}" y1="{{sourcePosY}}" x2="{{targetPosX}}" y2="{{targetPosY}}" stroke="{{color}}" stroke-width="3" stroke-linecap="round" marker-end="url(#arrowhead)"/>
  {{/each}}
  {{#each tables}}
  <g id="table-{{@index}}" transform="translate({{posX}}, {{posY}})">
  {{{tableMarkup}}}
  </g>
  {{/each}}
</svg>
`;

/**
 * Template for individual rendering of each database table.
 *
 * Visual structure:
 * - White outer rectangle with black border and shadow
 * - Purple header (#8B29A6) with table name in white
 * - Alternating lines (zebra striping) for better readability
 * - Each column shows: name (bold) and type (normal)
 */
const tableTemplate = `
    <rect x="0" y="0" width="{{tableWidth}}" height="{{tableHeight}}" fill="#FFFFFF" stroke="black" filter="url(#shadow)"/>
    <rect x="0" y="0" width="{{tableWidth}}" height="50" fill="#8B29A6" />
    <text x="{{centerX}}" y="30" font-family="Arial, sans-serif" font-size="20" font-variant="small-caps" text-anchor="middle" font-weight="bold" fill="#ffffff">{{tableName}}</text>
    {{#each column}}
      <rect x="0" fill="{{#if (isOdd @index)}}#f5f5f5{{else}}#ffffff{{/if}}" y="{{calculateY @index}}" width="{{reduceLine ../tableWidth}}" height="40" />
      <text x="20" y="{{calculateY @index}}" dy="25" font-family="Arial, sans-serif" font-size="16" fill="black" font-weight="bold">{{name}}     <tspan dx="30" font-weight="normal">{{type}}</tspan></text>
    {{/each}}
    <defs>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
    <feDropShadow dx="3" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.2" />
  </filter>
</defs>
`;

// Helper to calculate the center of the table
// Used to position the table name in the header
Handlebars.registerHelper('centerX', function (tableWidth: any) {
    return tableWidth.data.root.tableWidth / 2;
});

// Helper to reduce the line width
// Used to draw the background rectangles for each column
Handlebars.registerHelper('reduceLine', function (tableWidth: number) {
    return tableWidth - 1;
});

// Helper to calculate the Y position of each column
Handlebars.registerHelper('calculateY', function (index: number) {
    return 50 + index * 40; // Ajuste o espaçamento conforme necessário
});

// Helper to check if the index is odd
Handlebars.registerHelper('isOdd', function (index: number) {
    return index % 2 === 1;
});

/**
 * Estimates the width in pixels that a text will occupy when rendered.
 * Uses a heuristic of 0.6 * fontSize pixels per character.
 *
 * @param text - Text to be measured
 * @param fontSize - Font size in pixels
 * @returns Estimated width of the text in pixels
 *
 * @example
 * estimateTextWidth("user_id", 16)     // ~57.6 pixels
 * estimateTextWidth("VARCHAR(255)", 16) // ~105.6 pixels
 */
const estimateTextWidth = (text: string, fontSize: number) => text.length * fontSize * 0.6;

/**
 * Calculates the width of the table based on the column names and types.
 * @param columns - Array of column objects
 * @param fontSize - Font size in pixels
 * @returns Estimated width of the table in pixels
 *
 * @example
 * const columns = [
 *   { name: "id", type: "INT" },
 *   { name: "email", type: "VARCHAR(255)" }
 * ];
 * calculateTableWidth(columns, 16); // ~145 pixels
 */
const calculateTableWidth = (columns: Column[], fontSize: number) => {
    let maxWidth = 0;
    const paddingWidth = 40;
    columns.forEach(column => {
        const columnText = `${column.name}: ${column.type}`;
        const width = estimateTextWidth(columnText, fontSize);
        if (width > maxWidth) {
            maxWidth = width;
        }
    });
    return Math.ceil(maxWidth + paddingWidth); // Add padding to the width
};

/**
 * Generates visual connections (lines) between tables based on foreign keys.
 * Each line connects the table that has the foreign key to the referenced table.
 *
 * @param data - Array of database tables (with foreign keys)
 * @param tables - Array of SVG tables (with calculated positions)
 * @returns Array of connections with coordinates and colors
 *
 * @example
 * // If 'orders' has a FK to 'users':
 * // Creates a line from the right edge of 'orders' to the left edge of 'users'
 * const connections = connectionsGenerator(dbTables, svgTables);
 * // [{ sourcePosX: 500, sourcePosY: 200, targetPosX: 100, targetPosY: 150, color: '#8B29A6' }]
 */
const connectionsGenerator = (data: Table[], tables: SvgTable[]): Connection[] => {
    const connections: Connection[] = [];

    // Factor to adjust the Y position of connections
    const heightAdjustmentFactor = 1.5;

    data.forEach((table, index: number) => {
        table.foreignKey.forEach((fk) => {
            const sourceTable = tables[index];   // Table with the foreign key
            const targetTable = tables.find(t => t.tableName === fk.referenceTable); // Table referenced by the foreign key
            if (targetTable) {

                // Origin point in the foreign key table (right side of the table)
                const sourcePosX = sourceTable.posX + sourceTable.tableWidth;
                const sourcePosY = sourceTable.posY + sourceTable.tableHeight;

                // Destination point in the referenced table (left side of the table)
                const targetPosX = targetTable.posX + targetTable.tableHeight / heightAdjustmentFactor;
                const targetPosY = targetTable.posY + targetTable.tableHeight / heightAdjustmentFactor;

                const palette = ['#8B29A6', '#0D0C0C', '#444DF2', '#BA1511', '#0692E1', '#F58804'];

                const color = palette[index % palette.length];  // Choose color from palette based on index

                // Add the connection between the tables
                connections.push({ sourcePosX, sourcePosY, targetPosX, targetPosY, color });
            }
        });
    });

    return connections;
};


/**
 * Calculates the positions of tables based on padding and window width.
 *
 * @param {Object} padding - The padding between tables
 * @param {number} tableWidth - The width of the current table
 * @param {number} tableHeight - The height of the current table
 * @param {number} previousTableWidth - The width of the previous table
 * @param {number} windowWidth - The total width of the SVG window
 * @param {Object} currentPosition - The current position of the table
 * @returns {Object} - The updated position of the table
 */
const calculateTablePositions = (padding: {x: number, y: number}, tableWidth: number, tableHeight: number, previousTableWidth: number, windowWidth: number, currentPosition: { x: number, y: number }) => {

    // If `currentPosition` exceeds the allowed total width, move to the next "row" (Y axis)
    if (currentPosition.x + tableWidth + padding.x > windowWidth) {
        currentPosition.x = 100; // Reset X position
        currentPosition.y += tableHeight + padding.y; // Move Y position to next row
    } else {
        currentPosition.x += previousTableWidth + padding.x; // Continue on the same row
    }

    return currentPosition;
};

/**
 * Generates SVG representations of all database tables.
 * Calculates dimensions, positions and renders each table using Handlebars.
 * 
 * @param tables - Array of database tables
 * @returns Array of SvgTable objects with rendered markup and position metadata
 * 
 * @example
 * const dbTables = [
 *   { tableName: "users", column: [...], foreignKey: [...] },
 *   { tableName: "orders", column: [...], foreignKey: [...] }
 * ];
 * const svgTables = tablesGenerator(dbTables);
 * // Returns array with tableMarkup, posX, posY, etc. for each table
 */
const tablesGenerator = (tables: Table[]) => {
    const windowWidth = 2500; // Total width of the SVG
    const tableTemplateCompiled = Handlebars.compile(tableTemplate);
    let currentPosition = { x: 100, y: 100 };
    const padding = { x: 100, y: 100 }; // Space between tables

    return tables.map((table, index) => {
        const fontSize = 16; // Font size of the column names
        const rowHeight = 35;
        const tableHeight = padding.y + table.column.length * rowHeight; // Calculate the height of the table
        const tableWidth = calculateTableWidth(table.column, fontSize); // Calculate the width of the table

        if (index > 0) {
            const previousTableWidth = calculateTableWidth(tables[index - 1].column, fontSize);

            currentPosition = calculateTablePositions(padding, tableWidth, tableHeight, previousTableWidth, windowWidth, currentPosition);

        }

        const posX = currentPosition.x;
        const posY = currentPosition.y;

        return {
            tableName: table.tableName,
            tableMarkup: tableTemplateCompiled({ ...table, tableHeight, tableWidth }),
            posX,
            posY,
            tableWidth,
            tableHeight,
            columns: table.column,
            foreignKey: table.foreignKey
        };
    });
};

/**
 * Main function that generates the complete SVG diagram of the database.
 * Orchestrates the creation of tables, position calculation and connection generation.
 * 
 * @param databaseTables - Array of tables extracted from SQL
 * @returns String containing the complete ER diagram SVG
 * @throws {Error} If no tables are provided
 * 
 * @example
 * const tables = parseSql(sqlContent);
 * const svgDiagram = svgGenerator(tables);
 * await writeSvgFile('database-diagram.svg', svgDiagram);
 * 
 * // The generated SVG can be viewed in browsers or SVG editors
 * // Shows all tables with their columns and lines connecting foreign keys
 */
export const svgGenerator = (databaseTables: Table[]) => {

    if (databaseTables.length === 0) {
        throw new Error('No tables found');
    }

    const svgTemplateCompiled = Handlebars.compile(svgTemplate);

    const tables: SvgTable[] = tablesGenerator(databaseTables);

    const connections: Connection[] = connectionsGenerator(databaseTables, tables);

    const svgContent: string = svgTemplateCompiled({ tables, connections });

    return svgContent;
};
