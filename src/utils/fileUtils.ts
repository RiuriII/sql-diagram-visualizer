import { readFileSync, writeFile } from 'fs';
import { resolve } from 'path';

export const readSqlFile = (sqlPath: string): string => {
    try {
        const path = resolve(sqlPath);
        const data = readFileSync(path, 'utf8');

        return data;
    } catch (err: unknown) {
        console.error("File not found or could not be read", err);
        throw new Error("File not found or could not be read");
    }
};

export const writeSvgFile = (fileName: string, svgContent: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        writeFile(fileName, svgContent, (err: unknown) => {
            if (err) {
                console.error('Error writing file:', err);
                reject(new Error("Error writing file"));
            } else {
                resolve();
            }
        });
    });
};