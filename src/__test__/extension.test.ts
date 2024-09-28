import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Command Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('should execute the command registered in the extension', () => {
        const commandId = 'editor.action.convertToDiagram';
        
        const activeEditor = vscode.window.activeTextEditor;

        if (!activeEditor) {
            return;
        }

        const result = vscode.commands.executeCommand<vscode.Location[]>(
            commandId, 
            activeEditor.document.uri,
            activeEditor.selection.active
        );

        assert.ok(result);
    });
});

describe('Extension Activation Test Suite', () => {
    test('should activate the extension', async () => {
        const extension = vscode.extensions.getExtension('sql-visualizer.convertToDiagram');
        await extension?.activate();

        assert.ok(extension?.isActive, 'A extensão deve ser ativada');
    });
});