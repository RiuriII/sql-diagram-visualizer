const vscode = {
    window: {
        showInformationMessage: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn(),
    },
    extensions: {
        getExtension: jest.fn().mockReturnValue({
            activate: jest.fn(),
            isActive: true,
        }),
    },
    workspace: {
        getConfiguration: jest.fn(() => ({
            update: jest.fn(),
            get: jest.fn(() => 'newValue'),
        })),
    },
};
export = vscode;
