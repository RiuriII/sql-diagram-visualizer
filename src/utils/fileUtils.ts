import { readFileSync, writeFile, access, constants } from 'fs';
import { resolve } from 'path';
import path from "path";

/** 
 * Reads an SQL file from the given path and returns its content as a string. 
 * 
 * @param {string} sqlPath - The path to the SQL file
 * @returns {string} - The content of the SQL file
 * @throws Will throw an error if the file cannot be found or read
 **/
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


/**
 * Verifies if a file exists at the given path.
 * 
 * @param {string} filePath - The path to the file
 * @returns {Promise<boolean>} - Promise that resolves to true if the file exists, false otherwise
 **/
const fileExists = (filePath: string): Promise<boolean> => {
    return new Promise(resolve => {
        access(filePath, constants.F_OK, err => {
            resolve(!err);
        });
    });
};

/**
 * Generates a unique file name by appending a counter if the file already exists.
 * 
 * @param {string} fileName - The desired file name
 * @returns {Promise<string>} - Promise that resolves to a unique file name
 * @example
 * ```typescript
 * // If 'diagram.svg' doesn't exist:
 * await getAvailableFileName('diagram.svg'); // Returns: 'diagram.svg'
 * 
 * // If 'diagram.svg' exists:
 * await getAvailableFileName('diagram.svg'); // Returns: 'diagram_(1).svg'
 * 
 * // If 'diagram.svg' and 'diagram_(1).svg' exist:
 * await getAvailableFileName('diagram.svg'); // Returns: 'diagram_(2).svg'
 * ```
 **/
const getAvailableFileName = async (fileName: string): Promise<string> => {
    const dir = path.dirname(fileName);
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);

    let counter = 1;
    let finalName = fileName;

    while (await fileExists(finalName)) {
        finalName = path.join(dir, `${base}_(${counter})${ext}`);
        counter++;
    }

    return finalName;
};


/**
 * Writes SVG content to a file, ensuring the file name is unique.
 * 
 * @param {string} fileName - The desired file name for the SVG
 * @param {string} svgContent - The SVG content to write to the file
 * @returns {Promise<void>} - Promise that resolves when the file is written
 * @throws Will throw an error if the file cannot be written
 **/
export const writeSvgFile = async (
    fileName: string,
    svgContent: string
): Promise<void> => {
    const safeFileName = await getAvailableFileName(fileName);

    return new Promise((resolve, reject) => {
        writeFile(safeFileName, svgContent, err => {
            if (err) {
                console.error("Error writing file:", err);
                reject(new Error("Error writing file"));
            } else {
                resolve();
            }
        });
    });
};
