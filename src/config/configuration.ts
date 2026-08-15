import * as vscode from 'vscode';


/**
 * Retrieves the current user configurations for SQL Visualizer from VS Code settings.
 *
 * @returns An object containing the typed configuration values.
 */
export function getConfiguration() {
    const config = vscode.workspace.getConfiguration("sqlVisualizer");

    return {
        inputPath: config.get<string>("inputPath"),
        sqlDialect: config.get< "mysql" | "postgres">("sqlDialect", "mysql"),
        outputName: config.get<string>("outputName", "diagram"),
        outputDir: config.get<string>("outputDir", "./"),
        autoGenerate: config.get<boolean>("autoGenerate", false),
    };
}