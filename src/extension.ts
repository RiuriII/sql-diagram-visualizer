import * as vscode from 'vscode';
import { readSqlFile, writeSvgFile } from './utils/fileUtils';
import { svgGenerator } from './svgGenerator';
import { parseSql } from './sqlParse';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('extension.convertToDiagram', async (uri: vscode.Uri) => {

    if (!uri) {
      const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        openLabel: 'Select SQL File',
        filters: {
          'SQL files': ['sql'],
          'All files': ['*']
        }
      };

      const fileUri = await vscode.window.showOpenDialog(options);
      if (fileUri && fileUri[0]) {
        uri = fileUri[0];
      } else {
        vscode.window.showErrorMessage('No file selected');
        return;
      }
    }
    
    
    const filePath: string = uri.fsPath;

    try {
      const inputOptions: vscode.InputBoxOptions = {
        placeHolder: 'Enter a name for the file (leave empty for default)'
      };
      const fileInputName = await vscode.window.showInputBox(inputOptions);
      const outputDirectory = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';

      // If the user doesn't enter anything, use a default name
      const fileName = fileInputName && fileInputName.trim() ? `${outputDirectory}/${fileInputName}.svg` : `${outputDirectory}/diagram.svg`;
      
      const sqlContent = readSqlFile(filePath);
      const databaseSchema = parseSql(sqlContent);

      const svg = svgGenerator(databaseSchema);
      await writeSvgFile(fileName, svg);
      
      vscode.window.showInformationMessage(`Diagram generated successfully! File saved: ${fileName}`);
    } catch (error: any) {
      console.error('Error during conversion:', error);
      vscode.window.showErrorMessage(`Failed to convert file: ${error.message || 'Unknown error'}`);
    }

  });

  context.subscriptions.push(disposable);
}

export function deactivate() { }
