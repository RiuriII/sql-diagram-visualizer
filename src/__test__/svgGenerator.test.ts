import { Table } from '../interfaces';
import { svgGenerator } from '../svgGenerator';


describe('svgGenerator', () => {

	it('should generate svg', () => {
		const databaseTables: Table[] = [
			{
				tableName: 'table1',
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
					}
				],
				foreignKey: []
			}
		];

		const svg = svgGenerator(databaseTables);
		expect(svg).toMatchSnapshot();
	});

	it("Should throw an error if databaseTables is empty", () => {
		const databaseTables: Table[] = [];
		expect(() => svgGenerator(databaseTables)).toThrow('No tables found');
	})
});