import * as vscode from 'vscode';
import path from 'path';
import { convertSqlToSvg, DialectChoice } from './services/conversionSvg';
import { getConfiguration } from './config/configuration';


/**
 * Upper bound on input SQL file size, enforced before handing anything to
 * the conversion pipeline — the first line of defense against an
 * accidentally-huge file (e.g. a full data dump instead of a schema-only
 * export) locking up the extension host. Shared by both entry points
 * below (the interactive command and the on-save auto-generate listener).
 */
const MAX_SQL_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const formatSizeErrorMessage = (sizeBytes: number): string => {
  const fileSizeMB = (sizeBytes / 1024 / 1024).toFixed(1);
  const limitMB = (MAX_SQL_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0);
  return `File too large (${fileSizeMB}MB). The supported limit is ${limitMB}MB.`;
};

/**
 * VS Code extension activation function.
 *
 * Registers two methods to generate a diagram:
 *  - \`extension.convertToDiagram\`: an interactive command (context menu or command palette).
 *  - An on-save listener for automatic diagram generation when \`sqlVisualizer.autoGenerate\` is enabled.
 *
 * @param context - Extension context provided by VS Code
 */
export function activate(context: vscode.ExtensionContext) {

  const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
    const config = getConfiguration();

    if (!config.autoGenerate) {
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceFolder) {
      return;
    }

    const inputFile = path.join(workspaceFolder, config.inputPath || "");
    if (document.uri.fsPath !== inputFile) {
      return;
    }

    try {
      const { size } = await vscode.workspace.fs.stat(document.uri);
      if (size > MAX_SQL_FILE_SIZE_BYTES) {
        vscode.window.showErrorMessage(formatSizeErrorMessage(size));
        return;
      }

      const outputPath = await convertSqlToSvg({
        inputPath: inputFile,
        outputName: config.outputName || 'diagram',
        outputDir: path.join(workspaceFolder, config.outputDir),
        dialectChoice: config.sqlDialect,
      });

      vscode.window.showInformationMessage(`Diagram generated successfully! File saved: ${outputPath}`);
    } catch (error: any) {
      console.error('Error during automatic conversion:', error);
      vscode.window.showErrorMessage(`Failed to convert file: ${error.message || 'Unknown error'}`);
    }
  });

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

    const { size } = await vscode.workspace.fs.stat(uri);
    if (size > MAX_SQL_FILE_SIZE_BYTES) {
      vscode.window.showErrorMessage(formatSizeErrorMessage(size));
      return;
    }

    try {
      const inputOptions: vscode.InputBoxOptions = {
        placeHolder: 'Enter a name for the file (leave empty for default)'
      };
      const fileInputName = await vscode.window.showInputBox(inputOptions);
      const outputDirectory = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
      const outputName = fileInputName && fileInputName.trim() ? fileInputName.trim() : 'diagram';

      const dialectPick = await vscode.window.showQuickPick(['MySQL', 'PostgreSQL'], {
        placeHolder: 'Select the type of SQL file you want to convert'
      });
      const dialectChoice: DialectChoice = dialectPick === 'PostgreSQL' ? 'postgres' : 'mysql';

      const outputPath = await convertSqlToSvg({
        inputPath: filePath,
        outputName,
        outputDir: outputDirectory,
        dialectChoice,
      });

      vscode.window.showInformationMessage(`Diagram generated successfully! File saved: ${outputPath}`);

    } catch (error: any) {
      console.error('Error during conversion:', error);
      vscode.window.showErrorMessage(`Failed to convert file: ${error.message || 'Unknown error'}`);
    }

  });

  context.subscriptions.push(saveListener);
  context.subscriptions.push(disposable);
}

/**
 * VS Code extension deactivation function
 * Called when the extension is deactivated or uninstalled
 */
export function deactivate() { }