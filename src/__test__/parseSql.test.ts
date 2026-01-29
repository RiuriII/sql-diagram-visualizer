import { parseSql } from '../parseSql';
import * as cleanSqlModule from '../utils/cleanSql';

// Mock the cleanSql function to control its behavior in tests
jest.mock('../utils/cleanSql');

describe('parseSql', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // By default, cleanSql returns lines split by line break
    (cleanSqlModule.cleanSql as jest.Mock).mockImplementation((sql: string) => {
      return sql.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    });
  });

  describe('Basic table parsing', () => {
    test('should parse a simple table with basic columns', () => {
      const sql = `
        CREATE TABLE users (
        id INT
        name VARCHAR(100)
        )
      `;

      const result = parseSql(sql);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        tableName: 'users',
        column: [
          { name: 'id', type: 'INT' },
          { name: 'name', type: 'VARCHAR(100)' }
        ],
        foreignKey: []
      });
    });

    test('Should parse multiple tables', () => {
      const sql = `
        CREATE TABLE users (
        id INT
        )
        CREATE TABLE orders (
        order_id INT
        )
      `;

      const result = parseSql(sql);

      expect(result).toHaveLength(2);
      expect(result[0].tableName).toBe('users');
      expect(result[1].tableName).toBe('orders');
    });

    test('should parse table with IF NOT EXISTS', () => {
      const sql = `
        CREATE TABLE IF NOT EXISTS products (
        id INT
        name VARCHAR(50)
        )
      `;

      const result = parseSql(sql);

      expect(result).toHaveLength(1);
      expect(result[0].tableName).toBe('products');
    });
  });

  describe('Parsing table names with different styles', () => {
    test('should parse table name with backticks', () => {
      const sql = `
        CREATE TABLE \`users\` (
        id INT
        )
      `;

      const result = parseSql(sql);
      expect(result[0].tableName).toBe('users');
    });

    test('should parse table name with double quotes', () => {
      const sql = `
        CREATE TABLE "users" (
        id INT
        )
      `;

      const result = parseSql(sql);
      expect(result[0].tableName).toBe('users');
    });

    test('should parse table name with schema prefix', () => {
      const sql = `
        CREATE TABLE mydb.users (
        id INT
        )
      `;

      const result = parseSql(sql);
      expect(result[0].tableName).toBe('mydb.users');
    });
  });

  describe('Parsing columns with different types', () => {
    test('should parse columns with PRIMARY KEY inline', () => {
      const sql = `
        CREATE TABLE users (
        id INT PRIMARY KEY
        email VARCHAR(255) NOT NULL
        )
      `;

      const result = parseSql(sql);

      expect(result[0].column).toEqual([
        { name: 'id', type: 'INT PRIMARY KEY' },
        { name: 'email', type: 'VARCHAR(255) NOT NULL' }
      ]);
    });

    test('should parse columns with AUTO_INCREMENT', () => {
      const sql = `
        CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY
        )
      `;

      const result = parseSql(sql);

      expect(result[0].column[0]).toEqual({
        name: 'id',
        type: 'INT AUTO_INCREMENT PRIMARY KEY'
      });
    });

    test('should remove trailing commas from column definitions', () => {
      const sql = `
        CREATE TABLE users (
        id INT,
        name VARCHAR(100),
        )
      `;

      const result = parseSql(sql);

      expect(result[0].column).toHaveLength(2);
      expect(result[0].column[0].type).toBe('INT');
      expect(result[0].column[1].type).toBe('VARCHAR(100)');
    });
  });

  describe('Parsing of constraints that should be ignored', () => {
    test('should ignore PRIMARY KEY constraint separated', () => {
      const sql = `
        CREATE TABLE users (
        id INT
        name VARCHAR(100)
        PRIMARY KEY (id)
        )
      `;

      const result = parseSql(sql);

      expect(result[0].column).toHaveLength(2);
      expect(result[0].column).not.toContainEqual(
        expect.objectContaining({ name: 'PRIMARY' })
      );
    });

    test('should ignore UNIQUE constraint', () => {
      const sql = `
        CREATE TABLE users (
        id INT
        email VARCHAR(255)
        UNIQUE (email)
        )
      `;

      const result = parseSql(sql);

      expect(result[0].column).toHaveLength(2);
      expect(result[0].column.map(c => c.name)).not.toContain('UNIQUE');
    });

    test('should ignore INDEX', () => {
      const sql = `
        CREATE TABLE users (
        id INT
        name VARCHAR(100)
        INDEX idx_name (name)
        )
      `;

      const result = parseSql(sql);

      expect(result[0].column).toHaveLength(2);
    });

    test('should ignore CHECK constraint', () => {
      const sql = `
        CREATE TABLE products (
        id INT
        price DECIMAL(10,2)
        CHECK (price > 0)
        )
      `;

      const result = parseSql(sql);

      expect(result[0].column).toHaveLength(2);
    });
  });

  describe('Parsing of Foreign Keys', () => {
    test('should parse FOREIGN KEY simple in one line', () => {
      const sql = `
        CREATE TABLE orders (
        id INT
        user_id INT
        FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `;

      const result = parseSql(sql);

      expect(result[0].foreignKey).toHaveLength(1);
      expect(result[0].foreignKey[0]).toEqual({
        foreignKey: 'user_id',
        referenceTable: 'users'
      });
    });

    test('should parse FOREIGN KEY with CONSTRAINT in multiple lines', () => {
      const sql = `
        CREATE TABLE orders (
        id INT
        user_id INT
        CONSTRAINT fk_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        )
      `;

      const result = parseSql(sql);

      expect(result[0].foreignKey).toHaveLength(1);
      expect(result[0].foreignKey[0]).toEqual({
        foreignKey: 'user_id',
        referenceTable: 'users'
      });
    });

    test('should parse multiple FOREIGN KEYs', () => {
      const sql = `
        CREATE TABLE order_items (
        id INT
        order_id INT
        product_id INT
        FOREIGN KEY (order_id) REFERENCES orders(id)
        FOREIGN KEY (product_id) REFERENCES products(id)
        )
      `;

      const result = parseSql(sql);

      expect(result[0].foreignKey).toHaveLength(2);
      expect(result[0].foreignKey[0].foreignKey).toBe('order_id');
      expect(result[0].foreignKey[1].foreignKey).toBe('product_id');
    });
  });

  describe('Complex cases and edge cases', () => {
    test('should parse table with all elements', () => {
      const sql = `
        CREATE TABLE IF NOT EXISTS orders (
        order_id INT AUTO_INCREMENT
        user_id INT NOT NULL
        total DECIMAL(10,2)
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        PRIMARY KEY (order_id)
        INDEX idx_user (user_id)
        CONSTRAINT fk_user_order
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        )
      `;

      const result = parseSql(sql);

      expect(result[0]).toEqual({
        tableName: 'orders',
        column: [
          { name: 'order_id', type: 'INT AUTO_INCREMENT' },
          { name: 'user_id', type: 'INT NOT NULL' },
          { name: 'total', type: 'DECIMAL(10,2)' },
          { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
        ],
        foreignKey: [
          { foreignKey: 'user_id', referenceTable: 'users' }
        ]
      });
    });

    test('should parse columns with underscores in name', () => {
      const sql = `
        CREATE TABLE users (
        user_id INT
        first_name VARCHAR(50)
        last_name VARCHAR(50)
        )
      `;

      const result = parseSql(sql);

      expect(result[0].column.map(c => c.name)).toEqual([
        'user_id',
        'first_name',
        'last_name'
      ]);
    });

    test('should handle extra spaces and inconsistent formatting', () => {
      const sql = `
        CREATE   TABLE    users   (
           id    INT
              name     VARCHAR(100)
        )
      `;

      const result = parseSql(sql);

      expect(result[0].tableName).toBe('users');
      expect(result[0].column).toHaveLength(2);
    });
  });

  describe('Error handling', () => {
    test('should throw error when no table is found', () => {
      const sql = `
        -- apenas comentários
        SELECT * FROM users;
      `;

      expect(() => parseSql(sql)).toThrow('No table found in SQL or empty table definitions');
    });

    test('should throw error when table has no columns', () => {
      const sql = `
        CREATE TABLE users (
        PRIMARY KEY (id)
        )
      `;

      expect(() => parseSql(sql)).toThrow('No table found in SQL or empty table definitions');
    });

    test('should capture and rethrow errors from cleanSql', () => {
      (cleanSqlModule.cleanSql as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid SQL syntax');
      });

      expect(() => parseSql('invalid sql')).toThrow('Failed to convert file: Invalid SQL syntax');
    });
  });

  describe('Integration with cleanSql', () => {
    test('should call cleanSql with the provided SQL', () => {
      const sql = 'CREATE TABLE users (id INT)';
      
      (cleanSqlModule.cleanSql as jest.Mock).mockReturnValue([
        'CREATE TABLE users (',
        'id INT',
        ')'
      ]);

      parseSql(sql);

      expect(cleanSqlModule.cleanSql).toHaveBeenCalledWith(sql);
      expect(cleanSqlModule.cleanSql).toHaveBeenCalledTimes(1);
    });
  });

  describe('Real schema cases', () => {
    test('should parse basic e-commerce schema', () => {
      const sql = `
        CREATE TABLE customers (
        customer_id INT PRIMARY KEY
        email VARCHAR(255) UNIQUE
        created_at TIMESTAMP
        )
        
        CREATE TABLE products (
        product_id INT PRIMARY KEY
        name VARCHAR(200)
        price DECIMAL(10,2)
        )
        
        CREATE TABLE orders (
        order_id INT PRIMARY KEY
        customer_id INT
        order_date TIMESTAMP
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
        )
      `;

      const result = parseSql(sql);

      expect(result).toHaveLength(3);
      expect(result.map(t => t.tableName)).toEqual(['customers', 'products', 'orders']);
      expect(result[2].foreignKey).toHaveLength(1);
    });

    test('should parse schema with complex relationships', () => {
      const sql = `
        CREATE TABLE users (
        id INT PRIMARY KEY
        username VARCHAR(50)
        )
        
        CREATE TABLE posts (
        id INT PRIMARY KEY
        user_id INT
        title VARCHAR(200)
        FOREIGN KEY (user_id) REFERENCES users(id)
        )
        
        CREATE TABLE comments (
        id INT PRIMARY KEY
        post_id INT
        user_id INT
        content TEXT
        FOREIGN KEY (post_id) REFERENCES posts(id)
        FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `;
      const result = parseSql(sql);
      expect(result).toHaveLength(3);
      expect(result[2].foreignKey).toHaveLength(2);
      expect(result[2].foreignKey.map(fk => fk.referenceTable)).toEqual(['posts', 'users']);
    });
  });
});