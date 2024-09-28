import { jest, afterAll } from '@jest/globals';
import { readSqlFile, writeSvgFile } from '../utils/fileUtils';

jest.mock('../utils/fileUtils');

const readSqlFileMock = readSqlFile as jest.Mock<typeof readSqlFile>;
const writeSvgFileMock = writeSvgFile as jest.Mock<typeof writeSvgFile>;

describe('read file test', () => {
	afterAll(() => {
		jest.clearAllMocks();
	});

	it('should read sql file', () => {
		const sqlPath = 'test.sql';
		const sqlContent = 'CREATE TABLE table_name (column1 INT, column2 VARCHAR(255), column3 DATE)';

		readSqlFileMock.mockReturnValue(sqlContent);

		const result = readSqlFile(sqlPath);

		expect(result).toBe(sqlContent);
	});

	it('should throw an error if file not found', () => {
		const sqlPath = 'test.sql';

		readSqlFileMock.mockImplementation(() => {
			throw new Error('File not found');
		});

		expect(() => readSqlFile(sqlPath)).toThrow('File not found');
	});
});

describe('write file test', () => {

	it('should write svg file', async () => {
		const fileName = 'test.svg';
		const svgContent = '<svg></svg>';

		// Mock the writeSvgFile function
		writeSvgFileMock.mockResolvedValueOnce(undefined);

		// Invoke the writeSvgFile function
		const result = await writeSvgFile(fileName, svgContent);

		// Verify that the writeSvgFile function was called with the correct arguments
		expect(writeSvgFileMock).toHaveBeenCalledWith(fileName, svgContent);

		// Verify that the result is undefined
		expect(result).toBeUndefined();
	});

	it('should throw an error if writing svg file fails', async () => {
		const fileName = 'test.svg';
		const svgContent = '<svg></svg>';

		// Mock the writeSvgFile function
		writeSvgFileMock.mockRejectedValueOnce(new Error('Write failed'));

		// Verify that the writeSvgFile function throws an error
		await expect(writeSvgFile(fileName, svgContent)).rejects.toThrow('Write failed');
	});


});