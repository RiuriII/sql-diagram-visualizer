/// <reference types="jest" />

import { parsePostgresql } from '../parsePostgresql';

describe('parsePostgresql', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('parses a standard PostgreSQL SQL file with schema prefix and inline foreign keys', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS public.users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE public.orders (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES public.users(id),
        total NUMERIC(10,2) NOT NULL
      );
    `;

    const result = parsePostgresql(sql);

    expect(result).toHaveLength(2);
    expect(result[0].tableName).toBe('users');
    expect(result[0].primaryKeyName).toBe('id');
    expect(result[0].column.map(c => ({ name: c.name, type: c.type }))).toEqual([
      { name: 'id', type: 'SERIAL PRIMARY KEY' },
      { name: 'email', type: 'VARCHAR(255) NOT NULL UNIQUE' },
      { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
    ]);
    expect(result[0].foreignKey).toHaveLength(0);
    
    expect(result[1].tableName).toBe('orders');
    expect(result[1].primaryKeyName).toBe('id');
    expect(result[1].column.map(c => ({ name: c.name, type: c.type }))).toEqual([
      { name: 'id', type: 'BIGSERIAL PRIMARY KEY' },
      { name: 'user_id', type: 'INTEGER NOT NULL REFERENCES public.users(id)' },
      { name: 'total', type: 'NUMERIC(10,2) NOT NULL' }
    ]);
    expect(result[1].foreignKey).toHaveLength(0);
  });

  it('parses a pg_dump-style file and ignores noise between CREATE TABLE blocks', () => {
    const sql = `
      CREATE TABLE public.users (
        id integer NOT NULL,
        name character varying(100)
      );

      ALTER TABLE public.users OWNER TO postgres;
      COMMENT ON TABLE public.users IS 'Users';
      CREATE SEQUENCE public.users_id_seq;

      CREATE TABLE public.orders (
        id integer NOT NULL,
        user_id integer,
        CONSTRAINT fk_orders_user
          FOREIGN KEY (user_id)
          REFERENCES users(id)
      );
    `;

    const result = parsePostgresql(sql);

    expect(result).toHaveLength(2);
    expect(result[0].tableName).toBe('users');
    expect(result[1].tableName).toBe('orders');
    expect(result[1].foreignKey).toEqual([
      { foreignKey: 'user_id', referenceTable: 'users' }
    ]);
  });

  it('parses quoted identifiers and multi-line foreign keys in PostgreSQL SQL', () => {
    const sql = `
      CREATE TABLE "customers" (
        "id" integer NOT NULL,
        "email" character varying(255)
      );

      CREATE TABLE "orders" (
        "id" integer NOT NULL,
        "customer_id" integer,
        CONSTRAINT "fk_customer"
        FOREIGN KEY ("customer_id")
        REFERENCES "customers"("id")
      );
    `;

    const result = parsePostgresql(sql);

    expect(result).toHaveLength(2);
    expect(result[0].tableName).toBe('customers');
    expect(result[1].tableName).toBe('orders');
    expect(result[1].foreignKey).toEqual([
      { foreignKey: 'customer_id', referenceTable: 'customers' }
    ]);
  });

  it('throws a clear error when no valid PostgreSQL tables are found', () => {
    const sql = `
      -- only comments
      ALTER TABLE users OWNER TO postgres;
      SELECT * FROM users;
    `;

    expect(() => parsePostgresql(sql)).toThrow('Failed to parse PostgreSQL file: No valid PostgreSQL tables found in the SQL');
  });
});
