/// <reference types="jest" />

import { parseSql } from '../parseSql';

/**
 * Covers multi-line ENUM support in extractColumnDefinition.
 *
 * Deliberately does NOT mock '../utils/cleanSql': these tests exercise the
 * real parseSql -> cleanMysql -> groupIntoBlocks -> processBlock pipeline,
 * per the new testing standard (no more mocking cleanSql).
 */
describe('parseSql - multi-line ENUM support', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('parses an ENUM column split across multiple lines', () => {
    const sql = `
      CREATE TABLE orders (
        id INT PRIMARY KEY,
        status ENUM(
          'active',
          'inactive',
          'pending'
        ),
        total DECIMAL(10,2)
      );
    `;

    const result = parseSql(sql);

    expect(result).toHaveLength(1);
    const statusColumn = result[0].column.find(c => c.name === 'status');

    expect(statusColumn).toBeDefined();
    expect(statusColumn!.type).toContain('ENUM');
    expect(statusColumn!.type).toContain("'active'");
    expect(statusColumn!.type).toContain("'inactive'");
    expect(statusColumn!.type).toContain("'pending'");

    // The other columns in the same table must still be parsed correctly,
    // proving the multi-line consumption didn't swallow neighboring lines.
    expect(result[0].column.map(c => c.name)).toEqual(['id', 'status', 'total']);
    expect(result[0].column.find(c => c.name === 'total')!.type).toBe('DECIMAL(10,2)');
  });

  it('parses a multi-line ENUM with NOT NULL and DEFAULT on the closing line', () => {
    const sql = `
      CREATE TABLE orders (
        id INT PRIMARY KEY,
        status ENUM(
          'active',
          'inactive',
          'pending'
        ) NOT NULL DEFAULT 'pending',
        total DECIMAL(10,2)
      );
    `;

    const result = parseSql(sql);
    const statusColumn = result[0].column.find(c => c.name === 'status');

    expect(statusColumn).toBeDefined();
    expect(statusColumn!.type).toContain("'active'");
    expect(statusColumn!.type).toContain("'inactive'");
    expect(statusColumn!.type).toContain("'pending'");
    expect(statusColumn!.type).toContain('NOT NULL');
    expect(statusColumn!.type).toContain("DEFAULT 'pending'");

    // Trailing comma from the closing line must still be stripped.
    expect(statusColumn!.type.endsWith(',')).toBe(false);

    expect(result[0].column.map(c => c.name)).toEqual(['id', 'status', 'total']);
  });

  it('still parses a single-line ENUM correctly (no regression)', () => {
    const sql = `
      CREATE TABLE orders (
        id INT PRIMARY KEY,
        status ENUM('active','inactive','pending') NOT NULL,
        total DECIMAL(10,2)
      );
    `;

    const result = parseSql(sql);
    const statusColumn = result[0].column.find(c => c.name === 'status');

    expect(statusColumn).toEqual({
      name: 'status',
      type: "ENUM('active','inactive','pending') NOT NULL",
      isPK: false,
      isFK: false,
      fkReference: undefined
    });

    expect(result[0].column.map(c => c.name)).toEqual(['id', 'status', 'total']);
  });
});