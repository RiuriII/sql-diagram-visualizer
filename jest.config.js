/** @type {import('jest').Config} */

module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	moduleFileExtensions: ['ts', 'js'],
	collectCoverage: true,
	collectCoverageFrom: [
		'./src/dialect.ts',
		'./src/stateMachine.ts',
		'./src/tokenize.ts',
		'./src/normalizer.ts',
		'./src/pathCrossings.ts',
		'./src/sugiyamaLayout.ts',
		'./src/svgGenerator.ts',
		'./src/svgTemplates.ts',
		'./src/services/conversionSvg.ts',
		'./src/utils/normalizer.ts',
		'./src/utils/enrichTable.ts',
		'./src/utils/fileUtils.ts',
	],
	coverageThreshold: {
		'global': {
			branches: 90,
			functions: 90,
			lines: 90,
			statements: 90,
		}
	},
	testPathIgnorePatterns: ['/node_modules/', '/dist/', '/out/'],
	moduleNameMapper: {
		'^vscode$': '<rootDir>/__mocks__/vscode.ts',
	},
	silent: true,
};
