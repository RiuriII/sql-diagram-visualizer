/// <reference types="jest" />

import { parseSql } from '../parseSql';
import { parsePostgresql } from '../parsePostgresql';

/**
 * Covers extractTableName support for quoted identifiers containing spaces.
 * Deliberately does NOT mock cleanSql - exercises the real pipeline.
 */
describe('extractTableName - quoted identifiers with spaces', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('MySQL (parseSql)', () => {
    it('parses a backtick-quoted table name containing spaces', () => {
      const sql = `
        CREATE TABLE \`Order Items\` (
          id INT PRIMARY KEY,
          quantity INT
        );
      `;

      const result = parseSql(sql);

      expect(result).toHaveLength(1);
      expect(result[0].tableName).toBe('Order Items');
    });

    it('parses a double-quoted table name containing spaces (ANSI_QUOTES style)', () => {
      const sql = `
        CREATE TABLE "Order Items" (
          id INT PRIMARY KEY,
          quantity INT
        );
      `;

      const result = parseSql(sql);

      expect(result).toHaveLength(1);
      expect(result[0].tableName).toBe('Order Items');
    });

    it('still parses a plain unquoted table name (no regression)', () => {
      const sql = `
        CREATE TABLE users (
          id INT PRIMARY KEY,
          name VARCHAR(100)
        );
      `;

      const result = parseSql(sql);

      expect(result[0].tableName).toBe('users');
    });

    it('still parses a backtick-quoted table name without spaces (no regression)', () => {
      const sql = `
        CREATE TABLE \`users\` (
          id INT PRIMARY KEY,
          name VARCHAR(100)
        );
      `;

      const result = parseSql(sql);

      expect(result[0].tableName).toBe('users');
    });

    it('still parses IF NOT EXISTS combined with a quoted name containing spaces', () => {
      const sql = `
        CREATE TABLE IF NOT EXISTS \`Customer Addresses\` (
          id INT PRIMARY KEY,
          street VARCHAR(255)
        );
      `;

      const result = parseSql(sql);

      expect(result[0].tableName).toBe('Customer Addresses');
    });

    it('still parses IF NOT EXISTS combined with a quoted name without spaces (no regression)', () => {
      const sql = `
        CREATE TABLE IF NOT EXISTS \`customers\` (
          id INT PRIMARY KEY,
          email VARCHAR(255) NOT NULL
        );
      `;

      const result = parseSql(sql);

      expect(result[0].tableName).toBe('customers');
    });

    it('still parses table with dot notation and quoted table name with spaces', () => {
      const sql = `
        CREATE TABLE ble.\`Order.Items ble\` (
          id INT PRIMARY KEY,
          quantity INT
        );
      `;

      const result = parseSql(sql);

      expect(result[0].tableName).toBe('Order.Items ble');
    });
  });

  describe('PostgreSQL (parsePostgresql)', () => {
    it('parses a double-quoted table name containing spaces', () => {
      const sql = `
        CREATE TABLE "Order Items" (
          id integer NOT NULL,
          quantity integer
        );
      `;

      const result = parsePostgresql(sql);

      expect(result).toHaveLength(1);
      expect(result[0].tableName).toBe('Order Items');
    });

    it('parses a double-quoted table name with spaces under the public schema', () => {
      const sql = `
        CREATE TABLE public."Order Items" (
          id integer NOT NULL,
          quantity integer
        );
      `;

      const result = parsePostgresql(sql);

      expect(result[0].tableName).toBe('Order Items');
    });

    it('still parses an unquoted table name under the public schema (no regression)', () => {
      const sql = `
        CREATE TABLE public.users (
          id integer NOT NULL,
          name character varying(100)
        );
      `;

      const result = parsePostgresql(sql);

      expect(result[0].tableName).toBe('users');
    });

    it('still parses a plain double-quoted table name without spaces (no regression)', () => {
      const sql = `
        CREATE TABLE "customers" (
          id integer NOT NULL,
          email character varying(255)
        );
      `;

      const result = parsePostgresql(sql);

      expect(result[0].tableName).toBe('customers');
    });

    it('still parses IF NOT EXISTS combined with public schema (no regression)', () => {
      const sql = `
        CREATE TABLE IF NOT EXISTS public.users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) NOT NULL
        );
      `;

      const result = parsePostgresql(sql);

      expect(result[0].tableName).toBe('users');
    });
  });
});