import { svgGenerator } from '../svgGenerator';
import { Table } from '../interfaces';

describe('svgGenerator', () => {
  test('throws an error when the tables array is empty', () => {
    expect(() => svgGenerator([])).toThrow('No tables found');
  });

  test('generates a valid SVG document for a single table', () => {
    const tables: Table[] = [{
      tableName: 'users',
      column: [
        { name: 'id', type: 'INT' },
        { name: 'name', type: 'VARCHAR(100)' }
      ],
      foreignKey: []
    }];

    const result = svgGenerator(tables);

    expect(result).toContain('<svg');
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result).toContain('Database ER Diagram');
    expect(result).toContain('id="table-users"');
    expect(result).toContain('users');
    expect(result).toContain('id');
    expect(result).toContain('INT');
    expect(result).toContain('width="240"');
  });

  test('renders multiple tables with distinct groups and positions', () => {
    const tables: Table[] = [
      {
        tableName: 'users',
        column: [{ name: 'id', type: 'INT' }],
        foreignKey: []
      },
      {
        tableName: 'orders',
        column: [{ name: 'id', type: 'INT' }],
        foreignKey: []
      }
    ];

    const result = svgGenerator(tables);

    expect(result).toContain('id="table-users"');
    expect(result).toContain('id="table-orders"');
    expect(result).toContain('transform="translate(120, 180)"');
    expect(result).toContain('transform="translate(120, 386)"');
  });

  test('creates connection markup for existing foreign keys', () => {
    const tables: Table[] = [
      {
        tableName: 'users',
        column: [{ name: 'id', type: 'INT' }],
        foreignKey: []
      },
      {
        tableName: 'orders',
        column: [
          { name: 'id', type: 'INT' },
          { name: 'user_id', type: 'INT' }
        ],
        foreignKey: [{ foreignKey: 'user_id', referenceTable: 'users' }]
      }
    ];

    const result = svgGenerator(tables);

    expect(result).toContain('class="connection"');
    expect(result).toContain('marker-end="url(#arrow-');
    expect(result).toContain('user_id');
  });

  test('does not create connection markup when the referenced table is missing', () => {
    const tables: Table[] = [{
      tableName: 'orders',
      column: [{ name: 'user_id', type: 'INT' }],
      foreignKey: [{ foreignKey: 'user_id', referenceTable: 'nonexistent_table' }]
    }];

    const result = svgGenerator(tables);

    expect(result).not.toContain('class="connection"');
  });

  test('renders special column types and escapes them for SVG output', () => {
    const tables: Table[] = [{
      tableName: 'users',
      column: [{ name: 'status', type: "ENUM('active', 'inactive')" }],
      foreignKey: []
    }];

    const result = svgGenerator(tables);

    expect(result).toContain('status');
    expect(result).toContain("ENUM(&#x27;active&#x27;, &#x27;inactive&#x27;)");
  });

  test('includes the legend and schema statistics sections', () => {
    const tables: Table[] = [{
      tableName: 'users',
      column: [{ name: 'id', type: 'INT' }],
      foreignKey: []
    }];

    const result = svgGenerator(tables);

    expect(result).toContain('Legend');
    expect(result).toContain('SCHEMA STATISTICS');
    expect(result).toContain('Total tables:');
    expect(result).toContain('Primary keys:');
  });
});
