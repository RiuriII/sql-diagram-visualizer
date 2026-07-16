/// <reference types="jest" />

import { parseSql } from '../parseSql';
import {cleanMysql} from '../utils/cleanSql';


describe('parseSql', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
          { name: 'id', type: 'INT', isPK: true, isFK: false, fkReference: undefined },
          { name: 'name', type: 'VARCHAR(100)', isPK: false, isFK: false, fkReference: undefined }
        ],
        foreignKey: [],
        primaryKeyName: 'id'
      });
    });

    test('Should parse multiple tables', () => {
      const sql = `
        CREATE TABLE users (
        id INT
        )
        CREATE TABLE orders (
        id INT
        )
      `;

      const result = parseSql(sql);

      expect(result).toHaveLength(2);
      expect(result[0].tableName).toBe('users');
      expect(result[1].tableName).toBe('orders');
      expect(result[0].primaryKeyName).toBe('id');
      expect(result[1].primaryKeyName).toBe('id');
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
      expect(result[0].primaryKeyName).toBe('id');
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
      expect(result[0].tableName).toBe('users');
    });

    test('should parse table name with square brackets (SQL Server style)', () => {
      const sql = `
        CREATE TABLE [users] (
        id INT
        )
      `;
      const result = parseSql(sql);
      expect(result[0].tableName).toBe('users');
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
        { name: 'id', type: 'INT PRIMARY KEY', isPK: true, isFK: false, fkReference: undefined },
        { name: 'email', type: 'VARCHAR(255) NOT NULL', isPK: false, isFK: false, fkReference: undefined }
      ]);
      expect(result[0].primaryKeyName).toBe('id');
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
        type: 'INT AUTO_INCREMENT PRIMARY KEY',
        isPK: true,
        isFK: false,
        fkReference: undefined
      });
      expect(result[0].primaryKeyName).toBe('id');
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

    test('should preserve internal comma in numeric precision types (DECIMAL/NUMERIC)', () => {
      const sql = `
        CREATE TABLE payments (
        amount DECIMAL(10,2) NOT NULL,
        rate NUMERIC(5,4),
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column).toEqual([
        { name: 'amount', type: 'DECIMAL(10,2) NOT NULL', isPK: false, isFK: false, fkReference: undefined },
        { name: 'rate', type: 'NUMERIC(5,4)', isPK: false, isFK: false, fkReference: undefined }
      ]);
    });

    test('should parse ENUM column type containing commas', () => {
      const sql = `
        CREATE TABLE orders (
        status ENUM('pending','paid','shipped')
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column[0]).toEqual({
        name: 'status',
        type: "ENUM('pending','paid','shipped')",
        isPK: false,
        isFK: false,
        fkReference: undefined
      });
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

    test('should ignore standalone KEY constraint', () => {
      const sql = `
        CREATE TABLE users (
        id INT
        name VARCHAR(100)
        KEY idx_name (name)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column).toHaveLength(2);
    });

    test('should ignore CONSTRAINT ... CHECK combined', () => {
      const sql = `
        CREATE TABLE products (
        id INT
        price DECIMAL(10,2)
        CONSTRAINT chk_price CHECK (price > 0)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column).toHaveLength(2);
    });
  });

  describe('Regressão: nomes de coluna que começam com palavras-chave de constraint', () => {
    // Estes nomes de coluna são legítimos e NÃO devem ser confundidos com as
    // constraints CHECK / KEY / INDEX / UNIQUE / CONSTRAINT, mesmo começando
    // com essas palavras. O filtro precisa respeitar limite de palavra (\b).
    test('should keep a column named "checked_at" (starts with CHECK)', () => {
      const sql = `
        CREATE TABLE products (
        id INT
        checked_at TIMESTAMP
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.map(c => c.name)).toEqual(['id', 'checked_at']);
    });

    test('should keep a column named "keywords" (starts with KEY)', () => {
      const sql = `
        CREATE TABLE articles (
        id INT
        keywords VARCHAR(255)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.map(c => c.name)).toEqual(['id', 'keywords']);
    });

    test('should keep a column named "indexed_flag" (starts with INDEX)', () => {
      const sql = `
        CREATE TABLE files (
        id INT
        indexed_flag BOOLEAN
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.map(c => c.name)).toEqual(['id', 'indexed_flag']);
    });

    test('should keep a column named "unique_code" (starts with UNIQUE)', () => {
      const sql = `
        CREATE TABLE coupons (
        id INT
        unique_code VARCHAR(20)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.map(c => c.name)).toEqual(['id', 'unique_code']);
    });

    test('should keep a column named "constraint_type" (starts with CONSTRAINT)', () => {
      const sql = `
        CREATE TABLE rules (
        id INT
        constraint_type VARCHAR(30)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.map(c => c.name)).toEqual(['id', 'constraint_type']);
    });

    test('should keep every "false-friend" column while still ignoring the real constraints in the same table', () => {
      const sql = `
        CREATE TABLE mixed (
        id INT
        checked_at TIMESTAMP
        keywords VARCHAR(255)
        indexed_flag BOOLEAN
        unique_code VARCHAR(20)
        constraint_type VARCHAR(30)
        CHECK (id > 0)
        KEY idx_x (id)
        UNIQUE (unique_code)
        INDEX idx_y (keywords)
        CONSTRAINT ck_1 CHECK (id > 0)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.map(c => c.name)).toEqual([
        'id',
        'checked_at',
        'keywords',
        'indexed_flag',
        'unique_code',
        'constraint_type'
      ]);
    });
  });

  describe('Enriched properties (isPK, isFK, fkReference, primaryKeyName)', () => {
    test('should mark column as PK when type includes PRIMARY KEY', () => {
      const sql = `
        CREATE TABLE users (
        id INT PRIMARY KEY
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column[0].isPK).toBe(true);
      expect(result[0].primaryKeyName).toBe('id');
    });

    test('should auto-detect PK by column name "id"', () => {
      const sql = `
        CREATE TABLE products (
        id INT
        name VARCHAR(100)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.find(c => c.name === 'id')?.isPK).toBe(true);
      expect(result[0].primaryKeyName).toBe('id');
    });

    test('should auto-detect PK by convention "tableName_id"', () => {
      const sql = `
        CREATE TABLE books (
        books_id INT
        title VARCHAR(200)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.find(c => c.name === 'books_id')?.isPK).toBe(true);
      expect(result[0].primaryKeyName).toBe('books_id');
    });

    test('should mark column as FK and populate fkReference', () => {
      const sql = `
        CREATE TABLE users (
        user_id INT PRIMARY KEY
        )
        
        CREATE TABLE orders (
        order_id INT
        user_id INT
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
      `;
      const result = parseSql(sql);
      const fkCol = result[1].column.find(c => c.name === 'user_id' && c.isFK);
      expect(fkCol?.isFK).toBe(true);
      expect(fkCol?.fkReference).toBe('users.user_id');
    });

    test('should use default "id" when referenced table has no explicit PK', () => {
      const sql = `
        CREATE TABLE users (
        username VARCHAR(50)
        )
        
        CREATE TABLE posts (
        post_id INT
        user_ref INT
        FOREIGN KEY (user_ref) REFERENCES users(id)
        )
      `;
      const result = parseSql(sql);
      const fkCol = result[1].column.find(c => c.name === 'user_ref');
      expect(fkCol?.fkReference).toBe('users.id');
    });

    test('should distinguish regular columns from PK and FK', () => {
      const sql = `
        CREATE TABLE orders (
        order_id INT PRIMARY KEY
        user_id INT
        total DECIMAL(10,2)
        FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.find(c => c.name === 'order_id')?.isPK).toBe(true);
      expect(result[0].column.find(c => c.name === 'user_id')?.isFK).toBe(true);
      expect(result[0].column.find(c => c.name === 'total')?.isPK).toBe(false);
      expect(result[0].column.find(c => c.name === 'total')?.isFK).toBe(false);
    });

    test('should handle multiple FKs with correct fkReferences', () => {
      const sql = `
        CREATE TABLE users (
        user_id INT PRIMARY KEY
        )
        
        CREATE TABLE books (
        book_id INT PRIMARY KEY
        )
        
        CREATE TABLE loans (
        loan_id INT PRIMARY KEY
        user_id INT
        book_id INT
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        FOREIGN KEY (book_id) REFERENCES books(book_id)
        )
      `;
      const result = parseSql(sql);
      const userFk = result[2].column.find(c => c.name === 'user_id');
      const bookFk = result[2].column.find(c => c.name === 'book_id');
      expect(userFk?.fkReference).toBe('users.user_id');
      expect(bookFk?.fkReference).toBe('books.book_id');
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

    test('should parse FOREIGN KEY without a space before the parenthesis (FOREIGN KEY(col))', () => {
      // Formato real usado pelo usuário: sem espaço, sem CONSTRAINT nomeado,
      // múltiplas FKs seguidas na mesma tabela.
      const sql = `CREATE TABLE fines (
          fine_id INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
          amount DECIMAL(5,2) NOT NULL,
          paid BOOLEAN NOT NULL,
          due_date DATETIME NOT NULL,
          payment_date DATETIME,
          fk_user_id INT NOT NULL,
          fk_book_id INT NOT NULL,
          fk_loan_id INT NOT NULL,
          FOREIGN KEY(fk_user_id) REFERENCES users(user_id),
          FOREIGN KEY(fk_loan_id) REFERENCES loans(loan_id),
          FOREIGN KEY(fk_book_id) REFERENCES books(book_id)
      );`;

      const result = parseSql(sql);

      expect(result[0].tableName).toBe('fines');
      expect(result[0].column.map(c => c.name)).toEqual([
        'fine_id',
        'amount',
        'paid',
        'due_date',
        'payment_date',
        'fk_user_id',
        'fk_book_id',
        'fk_loan_id'
      ]);
      expect(result[0].foreignKey).toEqual([
        { foreignKey: 'fk_user_id', referenceTable: 'users' },
        { foreignKey: 'fk_loan_id', referenceTable: 'loans' },
        { foreignKey: 'fk_book_id', referenceTable: 'books' }
      ]);
    });

    test('should parse FOREIGN KEY with backtick-quoted identifiers (typical mysqldump output)', () => {
      const sql = `
        CREATE TABLE orders (
        id INT
        user_id INT
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].foreignKey).toHaveLength(1);
      expect(result[0].foreignKey[0]).toEqual({
        foreignKey: 'user_id',
        referenceTable: 'users'
      });
    });

    test('BUG CONHECIDO: quando a busca da FK estoura a janela de segurança, a linha REFERENCES solta vira uma coluna fantasma', () => {
      // Este teste documenta um comportamento pré-existente e ainda não corrigido
      // (fora do escopo dos bugs já resolvidos nesta rodada). Quando extractForeignKey
      // desiste após 10 linhas, a linha "REFERENCES users(id)" nunca é consumida como
      // parte da FK e acaba caindo em extractColumnDefinition, virando uma coluna
      // chamada "REFERENCES". Ver observação registrada anteriormente na revisão.
      const noise = Array.from({ length: 12 }, (_, i) => `-- noise line ${i}`).join('\n');
      const sql = `
        CREATE TABLE orders (
        id INT
        user_id INT
        FOREIGN KEY (user_id)
        ${noise}
        REFERENCES users(id)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.map(c => c.name)).toEqual(['id', 'user_id']);
    });
  });

  describe('Fronteira de bloco: ruído entre CREATE TABLE não deve virar coluna', () => {
    // O agrupamento de blocos fecha o bloco pelo balanceamento de parênteses
    // do próprio CREATE TABLE, não simplesmente "até o próximo CREATE TABLE".
    // Isso evita que comandos comuns em dumps reais (LOCK TABLES, SET, etc.)
    // vazem para dentro da tabela anterior como colunas fantasmas.
    test('should ignore LOCK TABLES / UNLOCK TABLES / SET between two CREATE TABLE statements', () => {
      const sql = `
LOCK TABLES \`users\` WRITE;
CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(100)
);
UNLOCK TABLES;
SET foreign_key_checks = 0;
CREATE TABLE orders (
  id INT PRIMARY KEY,
  user_id INT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;
      const result = parseSql(sql);
      expect(result).toHaveLength(2);
      expect(result[0].tableName).toBe('users');
      expect(result[1].tableName).toBe('orders');
      expect(result[0].primaryKeyName).toBe('id');
      expect(result[1].primaryKeyName).toBe('id');
      expect(result[0].column).toHaveLength(2);
      expect(result[1].foreignKey).toEqual([
        { foreignKey: 'user_id', referenceTable: 'users' }
      ]);
      expect(result[1].column.find(c => c.name === 'user_id')?.isFK).toBe(true);
      expect(result[1].column.find(c => c.name === 'user_id')?.fkReference).toBe('users.id');
    });
  });

  describe('Complex cases and edge cases', () => {
    test('should parse table with all elements', () => {
      const sql = `
        CREATE TABLE IF NOT EXISTS orders (
        order_id INT AUTO_INCREMENT PRIMARY KEY
        user_id INT NOT NULL
        total DECIMAL(10,2)
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        INDEX idx_user (user_id)
        CONSTRAINT fk_user_order
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        )
      `;

      const result = parseSql(sql);

      expect(result[0]).toMatchObject({
        tableName: 'orders',
        primaryKeyName: 'order_id'
      });
      expect(result[0].column).toHaveLength(4);
      expect(result[0].column.find(c => c.name === 'order_id')?.isPK).toBe(true);
      expect(result[0].column.find(c => c.name === 'user_id')?.isFK).toBe(true);
      expect(result[0].column.find(c => c.name === 'user_id')?.fkReference).toBe('users.id');
      expect(result[0].foreignKey).toHaveLength(1);
    });

    test('should parse columns with underscores in name', () => {
      const sql = `
        CREATE TABLE users (
        id INT
        first_name VARCHAR(50)
        last_name VARCHAR(50)
        )
      `;

      const result = parseSql(sql);

      expect(result[0].column.map(c => c.name)).toEqual([
        'id',
        'first_name',
        'last_name'
      ]);
      expect(result[0].primaryKeyName).toBe('id');
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
      expect(result[0].primaryKeyName).toBe('id');
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
      
      expect(() => parseSql('invalid sql')).toThrow('Failed to convert file: No table found in SQL or empty table definitions');
    });
  });

  describe('Integração com cleanMysql real (sem mock)', () => {

    test('deve ignorar comentários de linha (--, #) e USE antes da tabela', () => {
      const sql = `
        # dump gerado automaticamente
        -- outro comentário
        USE biblioteca;
        CREATE TABLE users (
        id INT
        name VARCHAR(100)
        )
      `;
      const result = parseSql(sql);
      expect(result).toHaveLength(1);
      expect(result[0].tableName).toBe('users');
      expect(result[0].column).toHaveLength(2);
    });

    test('deve remover comentário inline no final da linha sem afetar o tipo da coluna', () => {
      const sql = `
        CREATE TABLE users (
        id INT, -- chave primária
        name VARCHAR(100) -- nome completo
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.map(c => ({ name: c.name, type: c.type }))).toEqual([
        { name: 'id', type: 'INT' },
        { name: 'name', type: 'VARCHAR(100)' }
      ]);
    });

    test('deve ignorar comentários de bloco (/* */) no meio da definição', () => {
      const sql = `
        CREATE TABLE users (
        id INT /* chave primária */
        name VARCHAR(100)
        )
      `;
      const result = parseSql(sql);
      expect(result[0].column.map(c => c.name)).toEqual(['id', 'name']);
    });

    test('deve ignorar CREATE DATABASE e clone de tabela via LIKE', () => {
      const sql = `
        CREATE DATABASE biblioteca;
        CREATE TABLE users (
        id INT
        )
        CREATE TABLE users_backup LIKE users;
      `;
      const result = parseSql(sql);
      expect(result).toHaveLength(1);
      expect(result[0].tableName).toBe('users');
    });

    test('deve lançar erro se, após limpeza real, sobrar apenas comentários', () => {
      const sql = `
        # comentário estilo MySQL
        -- outro comentário
      `;
      expect(() => parseSql(sql)).toThrow('No table found in SQL or empty table definitions');
    });

    test('deve processar dump completo com ruído típico de mysqldump, tipos numéricos e FK sem espaço', () => {
      const sql = `
        -- MySQL dump 10.13
        USE biblioteca;

        CREATE TABLE users (
          user_id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) NOT NULL, -- nome de usuário
          keywords VARCHAR(255)
        );

        CREATE TABLE fines (
          fine_id INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
          amount DECIMAL(5,2) NOT NULL,
          fk_user_id INT NOT NULL,
          FOREIGN KEY(fk_user_id) REFERENCES users(user_id)
        );

        CREATE TABLE users_backup LIKE users;
      `;
      const result = parseSql(sql);

      expect(result).toHaveLength(2);
      expect(result.map(t => t.tableName)).toEqual(['users', 'fines']);
      expect(result[0].column.map(c => c.name)).toEqual(['user_id', 'username', 'keywords']);
      expect(result[1].column.find(c => c.name === 'amount')?.type).toBe('DECIMAL(5,2) NOT NULL');
      expect(result[1].foreignKey).toEqual([
        { foreignKey: 'fk_user_id', referenceTable: 'users' }
      ]);
      expect(result[0].primaryKeyName).toBe('user_id');
      expect(result[1].primaryKeyName).toBe('fine_id');
      expect(result[1].column.find(c => c.name === 'fk_user_id')?.isFK).toBe(true);
      expect(result[1].column.find(c => c.name === 'fk_user_id')?.fkReference).toBe('users.user_id');
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
      expect(result[0].primaryKeyName).toBe('customer_id');
      expect(result[1].primaryKeyName).toBe('product_id');
      expect(result[2].primaryKeyName).toBe('order_id');
      expect(result[2].column.find(c => c.name === 'customer_id' && c.isFK)).toBeDefined();
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
      expect(result[2].column.filter(c => c.isFK)).toHaveLength(2);
    });
  });

  describe('Limitação conhecida: uma definição por linha', () => {
    test('DOCUMENTADO: múltiplas colunas na mesma linha (separadas por vírgula) não são separadas corretamente', () => {
      const sql = `
        CREATE TABLE users (
        id INT, name VARCHAR(100), email VARCHAR(255)
        )
      `;
      const result = parseSql(sql);
      // O parser assume 1 definição por linha; aqui as 3 colunas caem em uma
      // única entrada. Se dumps "compactados" em uma linha só forem um caso
      // real de uso, vale revisitar essa limitação depois.
      expect(result[0].column).toHaveLength(1);
      expect(result[0].column[0].name).toBe('id');
    });
  });

  describe('Dirty/Real-world SQL dumps', () => {
    test('should handle mysqldump with comments, locks and complex types', () => {
      const sql = `
        -- MySQL dump
        USE biblioteca;
        
        CREATE TABLE users (
          user_id int AUTO_INCREMENT PRIMARY KEY,
          username varchar(50)
        );
        
        CREATE TABLE books (
          book_id int AUTO_INCREMENT PRIMARY KEY,
          title varchar(255)
        );
        
        CREATE TABLE loans (
          loan_id int AUTO_INCREMENT PRIMARY KEY,
          user_id int,
          book_id int,
          FOREIGN KEY (user_id) REFERENCES users(user_id),
          FOREIGN KEY (book_id) REFERENCES books(book_id)
        );
      `;

      const result = parseSql(sql);

      expect(result).toHaveLength(3);
      expect(result.map(t => t.tableName)).toEqual(['users', 'books', 'loans']);
      expect(result[0].primaryKeyName).toBe('user_id');
      expect(result[1].primaryKeyName).toBe('book_id');
      expect(result[2].foreignKey).toHaveLength(2);
    });

    test('should handle PostgreSQL style dump', () => {
      const sql = `
        CREATE TABLE public.users (
            id integer NOT NULL,
            username character varying(50) NOT NULL,
            email character varying(100) NOT NULL,
            created_at timestamp without time zone DEFAULT now()
        );
        
        ALTER TABLE ONLY public.users
            ADD CONSTRAINT users_pkey PRIMARY KEY (id);
        
        CREATE TABLE public.posts (
            id integer NOT NULL,
            user_id integer NOT NULL,
            title character varying(255),
            content text,
            created_at timestamp without time zone DEFAULT now()
        );
        
        ALTER TABLE ONLY public.posts
            ADD CONSTRAINT posts_pkey PRIMARY KEY (id);
        ALTER TABLE ONLY public.posts
            ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
      `;

      const result = parseSql(sql);
      expect(result).toHaveLength(2);
      expect(result[0].tableName).toBe('users');
      expect(result[1].tableName).toBe('posts');
    });

    test('should parse table with many FK columns and different types', () => {
      const sql = `
        CREATE TABLE orders (
          order_id BIGINT PRIMARY KEY AUTO_INCREMENT
        )
        
        CREATE TABLE products (
          product_id BIGINT PRIMARY KEY AUTO_INCREMENT
        )
        
        CREATE TABLE order_items (
          item_id BIGINT PRIMARY KEY AUTO_INCREMENT,
          order_id BIGINT NOT NULL,
          product_id BIGINT NOT NULL,
          quantity INT UNSIGNED NOT NULL,
          unit_price DECIMAL(12,2) NOT NULL,
          discount DECIMAL(5,2) DEFAULT 0.00,
          tax_rate DECIMAL(3,2),
          subtotal DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
          notes LONGTEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(order_id),
          FOREIGN KEY (product_id) REFERENCES products(product_id)
        )
      `;

      const result = parseSql(sql);
      expect(result).toHaveLength(3);
      expect(result[2].column).toHaveLength(11);
      expect(result[2].foreignKey).toHaveLength(2);
      expect(result[2].column.filter(c => c.isFK)).toHaveLength(2);
      expect(result[2].column.find(c => c.name === 'order_id')?.fkReference).toBe('orders.order_id');
      expect(result[2].column.find(c => c.name === 'product_id')?.fkReference).toBe('products.product_id');
      expect(result[2].primaryKeyName).toBe('item_id');
    });

    test('should handle table with no columns (should throw)', () => {
      const sql = `
        CREATE TABLE empty_table (
          UNIQUE (id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `;
      expect(() => parseSql(sql)).toThrow('No table found in SQL or empty table definitions');
    });

    test('should parse mixed schema with various column attributes', () => {
      const sql = `
        CREATE TABLE categories (
          cat_id INT PRIMARY KEY AUTO_INCREMENT,
          cat_name VARCHAR(100) NOT NULL,
          description TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_by INT,
          FOREIGN KEY (created_by) REFERENCES users(user_id)
        )
        
        CREATE TABLE products (
          prod_id INT PRIMARY KEY AUTO_INCREMENT,
          prod_code CHAR(10) UNIQUE NOT NULL,
          prod_name VARCHAR(200) NOT NULL,
          category_id INT NOT NULL,
          price DECIMAL(10,2) NOT NULL CHECK (price > 0),
          stock INT DEFAULT 0 CHECK (stock >= 0),
          sku VARCHAR(50),
          is_featured BOOLEAN DEFAULT FALSE,
          rating DECIMAL(3,2),
          FOREIGN KEY (category_id) REFERENCES categories(cat_id)
        )
      `;

      const result = parseSql(sql);
      expect(result).toHaveLength(2);
      expect(result[0].column).toHaveLength(5);
      expect(result[1].column).toHaveLength(9);
      expect(result[1].column.find(c => c.name === 'category_id')?.isFK).toBe(true);
      expect(result[1].column.find(c => c.name === 'category_id')?.fkReference).toBe('categories.cat_id');
    });

    test('should handle timestamps with various formats', () => {
      const sql = `
        CREATE TABLE audit_log (
          log_id INT PRIMARY KEY,
          action VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          checked_at DATETIME,
          started_on DATE,
          scheduled_time TIME(6)
        )
      `;

      const result = parseSql(sql);
      const colNames = result[0].column.map(c => c.name);
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');
      expect(colNames).toContain('checked_at');
      expect(colNames).toContain('started_on');
      expect(colNames).toContain('scheduled_time');
    });

    test('should parse table with JSON and specialized types', () => {
      const sql = `
        CREATE TABLE documents (
          doc_id INT PRIMARY KEY AUTO_INCREMENT,
          title VARCHAR(255),
          content JSON,
          metadata JSON NOT NULL,
          blob_data LONGBLOB,
          binary_content BINARY(100),
          uuid CHAR(36) UNIQUE
        )
      `;

      const result = parseSql(sql);
      expect(result[0].column.map(c => c.name)).toEqual([
        'doc_id', 'title', 'content', 'metadata', 'blob_data', 'binary_content', 'uuid'
      ]);
    });
  });
});