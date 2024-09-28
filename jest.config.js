module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	moduleFileExtensions: ['ts', 'js'],
	transform: {
	  '^.+\\.ts?$': 'ts-jest',
	},
	testPathIgnorePatterns: ['/node_modules/', '/dist/', '/out/'],
	moduleNameMapper: {
		'^vscode$': '<rootDir>/__mocks__/vscode.ts',
	  },
  };
  