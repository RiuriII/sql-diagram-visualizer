import { readFileSync, writeFile, access, constants } from 'fs';
import { mkdir } from 'fs/promises';
import { resolve, dirname, extname, basename, join } from 'path';


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
 * ```
 **/
const getAvailableFileName = async (fileName: string): Promise<string> => {
    const dir = dirname(fileName);
    const ext = extname(fileName);
    const base = basename(fileName, ext);
 
    let counter = 1;
    let finalName = fileName;
 
    while (await fileExists(finalName)) {
        finalName = join(dir, `${base}_(${counter})${ext}`);
        counter++;
    }
 
    return finalName;
};




/**
 * Writes SVG content to a file, ensuring the file name is unique and that
 * the destination directory exists.
 *
 * @param {string} fileName - The desired file name for the SVG. May be a
 *        bare name (e.g. "diagram.svg") or already include a path — when
 *        `outputDir` is also given, the two are joined together.
 * @param {string} svgContent - The SVG content to write to the file
 * @param {string} [outputDir] - Optional destination folder. Created
 *        (recursively) if it doesn't already exist yet, so callers can
 *        point at a subfolder — e.g. a user-configured output directory —
 *        without having to create it themselves first.
 * @returns {Promise<string>} - The actual path the file was written to.
 *          This can differ from the requested `fileName`/`outputDir`
 *          combination when a name collision caused `_(1)`, `_(2)`, etc.
 *          to be appended — callers that report the result to the user
 *          (e.g. a "file saved" message) should use this return value,
 *          not the originally requested name.
 * @throws Will throw an error if the file cannot be written
 **/
export const writeSvgFile = async (
    fileName: string,
    svgContent: string,
    outputDir?: string,
): Promise<string> => {
    const targetPath = outputDir ? join(outputDir, fileName) : fileName;
 
    await mkdir(dirname(targetPath), { recursive: true });
    const safeFileName = await getAvailableFileName(targetPath);
 
    return new Promise((resolveWrite, reject) => {
        writeFile(safeFileName, svgContent, err => {
            if (err) {
                console.error("Error writing file:", err);
                reject(new Error("Error writing file"));
            } else {
                resolveWrite(safeFileName);
            }
        });
    });
};
 
