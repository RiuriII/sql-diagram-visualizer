import { svgGenerator } from '../svgGenerator';
import { Table, Column } from '../interfaces';

describe('svgGenerator', () => {
  describe('Input validation', () => {
    test('should throw error when tables array is empty', () => {
      expect(() => svgGenerator([])).toThrow('No tables found');
    });

    test('should accept array with one table', () => {
      const tables: Table[] = [{
        tableName: 'users',
        column: [{ name: 'id', type: 'INT' }],
        foreignKey: []
      }];

      expect(() => svgGenerator(tables)).not.toThrow();
    });
  });

  describe('Basic SVG generation', () => {
    test('should generate valid SVG with a simple table', () => {
      const tables: Table[] = [{
        tableName: 'users',
        column: [
          { name: 'id', type: 'INT' },
          { name: 'name', type: 'VARCHAR(100)' }
        ],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      // Verifica estrutura SVG básica
      expect(result).toContain('<svg');
      expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(result).toContain('viewBox="0 0 3000 1000"');
      expect(result).toContain('</svg>');
    });

    test('should include the table name in the SVG', () => {
      const tables: Table[] = [{
        tableName: 'products',
        column: [{ name: 'id', type: 'INT' }],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('products');
    });

    test('should include all columns in the SVG', () => {
      const tables: Table[] = [{
        tableName: 'users',
        column: [
          { name: 'id', type: 'INT' },
          { name: 'email', type: 'VARCHAR(255)' },
          { name: 'created_at', type: 'TIMESTAMP' }
        ],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('id');
      expect(result).toContain('INT');
      expect(result).toContain('email');
      expect(result).toContain('VARCHAR(255)');
      expect(result).toContain('created_at');
      expect(result).toContain('TIMESTAMP');
    });
  });

  describe('MMultiple tables', () => {
    test('should generate SVG with multiple tables', () => {
      const tables: Table[] = [
        {
          tableName: 'users',
          column: [{ name: 'id', type: 'INT' }],
          foreignKey: []
        },
        {
          tableName: 'orders',
          column: [{ name: 'order_id', type: 'INT' }],
          foreignKey: []
        },
        {
          tableName: 'products',
          column: [{ name: 'product_id', type: 'INT' }],
          foreignKey: []
        }
      ];

      const result = svgGenerator(tables);

      expect(result).toContain('users');
      expect(result).toContain('orders');
      expect(result).toContain('products');
    });

    test('should create separate SVG groups for each table', () => {
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

      // Verify that there are separate groups for each table
      expect(result).toContain('id="table-0"');
      expect(result).toContain('id="table-1"');
    });
  });

  describe('Foreign Keys and Connections', () => {
    test('should generate connection line for foreign key', () => {
      const tables: Table[] = [
        {
          tableName: 'users',
          column: [{ name: 'id', type: 'INT' }],
          foreignKey: []
        },
        {
          tableName: 'orders',
          column: [
            { name: 'order_id', type: 'INT' },
            { name: 'user_id', type: 'INT' }
          ],
          foreignKey: [
            { foreignKey: 'user_id', referenceTable: 'users' }
          ]
        }
      ];

      const result = svgGenerator(tables);

      // Verify that a line element is created for the foreign key connection
      expect(result).toContain('<line');
      expect(result).toContain('stroke=');
      expect(result).toContain('stroke-width="3"');
    });

    test('should generate multiple connections for multiple foreign keys', () => {
      const tables: Table[] = [
        {
          tableName: 'users',
          column: [{ name: 'id', type: 'INT' }],
          foreignKey: []
        },
        {
          tableName: 'products',
          column: [{ name: 'id', type: 'INT' }],
          foreignKey: []
        },
        {
          tableName: 'orders',
          column: [
            { name: 'id', type: 'INT' },
            { name: 'user_id', type: 'INT' },
            { name: 'product_id', type: 'INT' }
          ],
          foreignKey: [
            { foreignKey: 'user_id', referenceTable: 'users' },
            { foreignKey: 'product_id', referenceTable: 'products' }
          ]
        }
      ];

      const result = svgGenerator(tables);

      // Conta quantas linhas de conexão existem
      const lineCount = (result.match(/<line/g) || []).length;
      expect(lineCount).toBe(2);
    });

    test('shouldn\'t generate connection if referenced table does not exist', () => {
      const tables: Table[] = [
        {
          tableName: 'orders',
          column: [{ name: 'user_id', type: 'INT' }],
          foreignKey: [
            { foreignKey: 'user_id', referenceTable: 'nonexistent_table' }
          ]
        }
      ];

      const result = svgGenerator(tables);

      // Não deve haver linhas de conexão
      expect(result).not.toContain('<line');
    });
  });

  describe('Visual elements of the SVG', () => {
    test('should include background rectangle for each table', () => {
      const tables: Table[] = [{
        tableName: 'users',
        column: [{ name: 'id', type: 'INT' }],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('<rect');
      expect(result).toContain('fill="#FFFFFF"');
      expect(result).toContain('stroke="black"');
    });

    test('should include purple header for each table', () => {
      const tables: Table[] = [{
        tableName: 'users',
        column: [{ name: 'id', type: 'INT' }],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('fill="#8B29A6"');
    });

    test('should include shadow filter', () => {
      const tables: Table[] = [{
        tableName: 'users',
        column: [{ name: 'id', type: 'INT' }],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('<filter id="shadow"');
      expect(result).toContain('feDropShadow');
    });

    test('should use Arial font for text', () => {
      const tables: Table[] = [{
        tableName: 'users',
        column: [{ name: 'id', type: 'INT' }],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('font-family="Arial, sans-serif"');
    });
  });

  describe('Positioning of tables', () => {
    test('should position first table at initial position (100, 100)', () => {
      const tables: Table[] = [{
        tableName: 'users',
        column: [{ name: 'id', type: 'INT' }],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('transform="translate(100, 100)"');
    });

    test('should position tables sequentially', () => {
      const tables: Table[] = [
        {
          tableName: 'table1',
          column: [{ name: 'id', type: 'INT' }],
          foreignKey: []
        },
        {
          tableName: 'table2',
          column: [{ name: 'id', type: 'INT' }],
          foreignKey: []
        }
      ];

      const result = svgGenerator(tables);

      // Verifica que há transformações translate diferentes
      expect(result).toContain('translate(100, 100)');
      expect(result).toMatch(/translate\(\d+, 100\)/); // Segunda tabela na mesma linha ou próxima
    });
  });

  describe('Types of special columns', () => {
    test('should handle DECIMAL(10,2)', () => {
      const tables: Table[] = [{
        tableName: 'products',
        column: [
          { name: 'price', type: 'DECIMAL(10,2)' }
        ],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('price');
      expect(result).toContain('DECIMAL(10,2)');
    });

    test('should handle ENUM', () => {
      const tables: Table[] = [{
        tableName: 'users',
        column: [
          { name: 'status', type: "ENUM('active', 'inactive')" }
        ],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('status')
      expect(result).toContain("ENUM(&#x27;active&#x27;, &#x27;inactive&#x27;)");
    });

    test('should handle long types', () => {
      const tables: Table[] = [{
        tableName: 'logs',
        column: [
          { name: 'message', type: 'TEXT' },
          { name: 'data', type: 'LONGTEXT' },
          { name: 'metadata', type: 'JSON' }
        ],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('TEXT');
      expect(result).toContain('LONGTEXT');
      expect(result).toContain('JSON');
    });
  });

  describe('Colors of connections', () => {
    test('should use palette colors for connections', () => {
      const tables: Table[] = [
        {
          tableName: 'users',
          column: [{ name: 'id', type: 'INT' }],
          foreignKey: []
        },
        {
          tableName: 'orders',
          column: [{ name: 'user_id', type: 'INT' }],
          foreignKey: [{ foreignKey: 'user_id', referenceTable: 'users' }]
        }
      ];

      const result = svgGenerator(tables);

      // Verify that one of the palette colors is used
      const paletteColors = ['#8B29A6', '#0D0C0C', '#444DF2', '#BA1511', '#0692E1', '#F58804'];
      const hasColor = paletteColors.some(color => result.includes(`stroke="${color}"`));
      
      expect(hasColor).toBe(true);
    });
  });

  describe('Real case: Complete schema', () => {
    test('should generate complete SVG for e-commerce schema', () => {
      const tables: Table[] = [
        {
          tableName: 'customers',
          column: [
            { name: 'customer_id', type: 'INT PRIMARY KEY' },
            { name: 'email', type: 'VARCHAR(255)' },
            { name: 'name', type: 'VARCHAR(100)' }
          ],
          foreignKey: []
        },
        {
          tableName: 'products',
          column: [
            { name: 'product_id', type: 'INT PRIMARY KEY' },
            { name: 'name', type: 'VARCHAR(200)' },
            { name: 'price', type: 'DECIMAL(10,2)' }
          ],
          foreignKey: []
        },
        {
          tableName: 'orders',
          column: [
            { name: 'order_id', type: 'INT PRIMARY KEY' },
            { name: 'customer_id', type: 'INT' },
            { name: 'total', type: 'DECIMAL(10,2)' }
          ],
          foreignKey: [
            { foreignKey: 'customer_id', referenceTable: 'customers' }
          ]
        },
        {
          tableName: 'order_items',
          column: [
            { name: 'item_id', type: 'INT PRIMARY KEY' },
            { name: 'order_id', type: 'INT' },
            { name: 'product_id', type: 'INT' },
            { name: 'quantity', type: 'INT' }
          ],
          foreignKey: [
            { foreignKey: 'order_id', referenceTable: 'orders' },
            { foreignKey: 'product_id', referenceTable: 'products' }
          ]
        }
      ];

      const result = svgGenerator(tables);

      // Verifica estrutura básica
      expect(result).toContain('<svg');
      expect(result).toContain('</svg>');

      // Verifica todas as tabelas
      expect(result).toContain('customers');
      expect(result).toContain('products');
      expect(result).toContain('orders');
      expect(result).toContain('order_items');

      // Verifica conexões (3 foreign keys no total)
      const lineCount = (result.match(/<line/g) || []).length;
      expect(lineCount).toBe(3);

	  expect(result.trim().startsWith('<svg')).toBe(true);
	  expect(result.trim().endsWith('</svg>')).toBe(true);

    });
  });

  describe('Tables with many columns', () => {
    test('should generate SVG for table with 10+ columns', () => {
      const columns: Column[] = [];
      for (let i = 1; i <= 15; i++) {
        columns.push({ name: `column_${i}`, type: 'VARCHAR(100)' });
      }

      const tables: Table[] = [{
        tableName: 'large_table',
        column: columns,
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('large_table');
      expect(result).toContain('column_1');
      expect(result).toContain('column_15');
    });
  });

  describe('Special names', () => {
    test('should handle table names with schema prefix', () => {
      const tables: Table[] = [{
        tableName: 'mydb.users',
        column: [{ name: 'id', type: 'INT' }],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('mydb.users');
    });

    test('should handle underscores in names', () => {
      const tables: Table[] = [{
        tableName: 'user_profiles',
        column: [
          { name: 'user_id', type: 'INT' },
          { name: 'first_name', type: 'VARCHAR(50)' },
          { name: 'last_name', type: 'VARCHAR(50)' }
        ],
        foreignKey: []
      }];

      const result = svgGenerator(tables);

      expect(result).toContain('user_profiles');
      expect(result).toContain('user_id');
      expect(result).toContain('first_name');
      expect(result).toContain('last_name');
    });
  });
});