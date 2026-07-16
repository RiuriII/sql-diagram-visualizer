import * as vscode from 'vscode';
import { readSqlFile, writeSvgFile } from './utils/fileUtils';
import { svgGenerator } from './svgGenerator';
import { parseSql } from './parseSql';
import { parsePostgresql } from './parsePostgresql';

/**
 * VS Code extension activation function
 * Registers the 'extension.convertToDiagram' command that allows converting SQL files into SVG diagrams
 * The command can be triggered from the context menu or via the command palette
 * @param {vscode.ExtensionContext} context - Extension context provided by VS Code
 */
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('extension.convertToDiagram', async (uri: vscode.Uri) => {

    const MAX_SQL_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

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

    const { size } = await vscode.workspace.fs.stat(uri);
    
    const fileSizeMB = (size / 1024 / 1024).toFixed(1);
    const limitMB = (MAX_SQL_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0);

    if (size > MAX_SQL_FILE_SIZE_BYTES) {
      vscode.window.showErrorMessage(`File too large (${fileSizeMB}MB). The supported limit is ${limitMB}MB.`);
      return;
    }

    try {
      const inputOptions: vscode.InputBoxOptions = {
        placeHolder: 'Enter a name for the file (leave empty for default)'
      };
      const fileInputName = await vscode.window.showInputBox(inputOptions);
      const outputDirectory = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';

      // If the user doesn't enter anything, use a default name
      const fileName = fileInputName && fileInputName.trim() ? `${outputDirectory}/${fileInputName}.svg` : `${outputDirectory}/diagram.svg`;

      const inputTypeConversion: any = await vscode.window.showQuickPick(['PostgreSQL', 'MySQL'], {
        placeHolder: 'Select the type of SQL file you want to convert'
      });


      const sqlContent = readSqlFile(filePath);

      const databaseSchema = inputTypeConversion === 'PostgreSQL' ? parsePostgresql(sqlContent) : parseSql(sqlContent);
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

/**
 * VS Code extension deactivation function
 * Called when the extension is deactivated or uninstalled
 */
export function deactivate() { }
