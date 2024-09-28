import * as Handlebars from "handlebars";
import { Column, Connection, SvgTable, Table } from "./interfaces";

// SVG template  
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

// Table template
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
Handlebars.registerHelper('centerX', function (tableWidth: any) {
    return tableWidth.data.root.tableWidth / 2;
});

// Helper to reduce the line width
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

// Estimates that each character occupies about 0.6 * fontSize pixels in width
const estimateTextWidth = (text: string, fontSize: number) => text.length * fontSize * 0.6;

// Calculates the width of the table based on the column names and types
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

// Generates connections between tables based on foreign keys
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

// Calculates the positions of tables based on padding and window width
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
