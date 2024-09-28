import { Table } from '../interfaces';
import { parseSql } from '../sqlParse';

describe('sql parse test', () => {

	it('should parse sql', () => {
		const sqlContent = `
			CREATE TABLE table_name (
			column1 INT, 
			column2 VARCHAR(255), 
			column3 DATE
			);
		`;
		const expected: Table[] = [
			{
				tableName: 'table_name',
				column: [
					{
						name: 'column1',
						type: 'INT'

					},
					{
						name: 'column2',
						type: 'VARCHAR(255)'

					},
					{
						name: 'column3',
						type: 'DATE'

					},
				],
				foreignKey: [],
			},
		];


		const result = parseSql(sqlContent);

		expect(result).toEqual(expected);
	});

	it('should throw an error if parsing sql fails', () => {
		const sqlContent = 'CREATE TABLE table_name (column1 INT, column2 VARCHAR(255), column3 DATE)';

		expect(() => parseSql(sqlContent)).toThrow('No table found in SQL');
	});
});