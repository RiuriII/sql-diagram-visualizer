import { jest } from '@jest/globals';
import { readSqlFile, writeSvgFile } from '../utils/fileUtils';
import { parseSql } from '../sqlParse';
import { svgGenerator } from '../svgGenerator';
import { Table } from '../interfaces'; 

jest.mock('../utils/fileUtils');
jest.mock('../sqlParse');
jest.mock('../svgGenerator');

// Garantir que os mocks são tipados corretamente
const mockedReadSqlFile = readSqlFile as jest.Mock<typeof readSqlFile>;
const mockedWriteSvgFile = writeSvgFile as jest.Mock<typeof writeSvgFile>;
const mockedParseSql =  parseSql as jest.Mock<typeof parseSql>;
const mockedSvgGenerator = svgGenerator as jest.Mock<typeof svgGenerator>;

describe('Integration test: SQL to SVG', () => {

	it('should read SQL, parse it, generate SVG, and write it to a file', async () => {
		
		const sqlPath: string = 'test.sql';

		const sqlContent = `
			CREATE TABLE table_name (
				column1 INT, 
				column2 VARCHAR(255), 
				column3 DATE
			);
		`;

		const parsedTables: Table[] = [
			{
				tableName: 'table_name',
				column: [
					{ name: 'column1', type: 'INT' },
					{ name: 'column2', type: 'VARCHAR(255)' },
					{ name: 'column3', type: 'DATE' }
				],
				foreignKey: []
			}
		];

		const svgContent = `<svg><!-- SVG content here --></svg>`;

		mockedReadSqlFile.mockReturnValue(sqlContent);
		mockedParseSql.mockReturnValue(parsedTables);
		mockedSvgGenerator.mockReturnValue(svgContent);
		mockedWriteSvgFile.mockResolvedValue(undefined);

		// Complete flow execution
		const sqlData = readSqlFile(sqlPath); // Read SQL file
		const tables = parseSql(sqlData); // Parsing do SQL
		const svg = svgGenerator(tables); // Generation do SVG
		await writeSvgFile('output.svg', svg); // Write SVG to file

		
		expect(readSqlFile).toHaveBeenCalledWith(sqlPath);
		expect(parseSql).toHaveBeenCalledWith(sqlContent);
		expect(svgGenerator).toHaveBeenCalledWith(parsedTables);
		expect(writeSvgFile).toHaveBeenCalledWith('output.svg', svgContent);
	});

	it('should handle errors during the process', async () => {
		
		const sqlPath = 'test.sql';

		mockedReadSqlFile.mockImplementation(() => {
			throw new Error('File not found');
		});

		// Try to execute the flow with an invalid SQL file
		await expect(async () => {
			const sqlData = readSqlFile(sqlPath); // Read SQL file
			const tables = parseSql(sqlData); // Parsing do SQL
			const svg = svgGenerator(tables); // Generation do SVG
			await writeSvgFile('output.svg', svg); // Write SVG to file
		}).rejects.toThrow('File not found');
	});

});
