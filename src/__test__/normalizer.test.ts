/// <reference types="jest" />

import { normalize } from '../utils/normalizer';

describe('normalize suite tests', () => {

	it('removes BOM', () => {
		expect(normalize('\uFEFFSELECT 1')).toBe('SELECT 1');
	});

	it('normalizes line endings to LF', () => {
		expect(normalize('a\r\nb\rc\n')).toBe('a\nb\nc\n');
	});

	it('removes control characters while preserving tabs and line breaks', () => {
		expect(normalize('SELECT\x00 1\t+\x01 2\n')).toBe('SELECT 1\t+ 2\n');
	});

	it('is idempotent', () => {
		const input = 'SELECT 1';
		expect(normalize(normalize(input))).toBe(normalize(input));
	});

	it('preserves non-ASCII characters', () => {
		expect(normalize('CREATE TABLE "Usuários"')).toBe('CREATE TABLE "Usuários"');
		expect(normalize("COMMENT '😀'")).toBe("COMMENT '😀'");
	});

	it('handles empty strings and BOM-only strings', () => {
		expect(normalize('')).toBe('');
		expect(normalize('\uFEFF')).toBe('');
	});

	it('normalizes single carriage return to LF', () => {
		expect(normalize('\r')).toBe('\n');
	});

});