import { readSqlFile, writeSvgFile } from '../utils/fileUtils';
import { normalize } from '../utils/normalizer';
import { enrichTables } from '../utils/enrichTable';
import { mysqlDialect, postgresDialect } from '../dialect';
import { tokenize } from '../tokenize';
import { runStateMachine } from '../stateMachine';
import { svgGenerator } from '../svgGenerator';

/**
 * Which SQL dialect to parse the input as. 
 * Both entry points into this service (the command
 * palette / context menu prompt, and the `sqlDialect` setting) must
 * resolve to one of these two before calling in.
 */
export type DialectChoice = "mysql" | "postgres";

export interface ConvertSqlToSvgOptions {
    /** Path to the source .sql file. */
    inputPath: string;
    /** Desired file name for the generated diagram, with or without the
     *  ".svg" extension — both are accepted. */
    outputName: string;
    /** Destination folder. Created automatically if it doesn't exist yet
     *  (see writeSvgFile). Omit to write next to wherever \`outputName\`
     *  itself resolves to. */
    outputDir?: string;
    dialectChoice: DialectChoice;
}

/**
 * Executes the full SQL to SVG conversion pipeline (read → normalize → tokenize → parse → enrich → render → write). 
 * Independent of VS Code APIs.
 *
 * @param options - Configuration options for the conversion process.
 * @returns The actual path the SVG was written to (see writeSvgFile).
 * @throws Propagates errors from the pipeline (missing file, parsing errors, or write failures).
 */
export async function convertSqlToSvg(options: ConvertSqlToSvgOptions): Promise<string> {
    const { inputPath, outputName, outputDir, dialectChoice } = options;

    const sqlContent = readSqlFile(inputPath);
    const normalizedSql = normalize(sqlContent);

    const dialect = dialectChoice === 'postgres' ? postgresDialect : mysqlDialect;

    const tokens = tokenize(normalizedSql, dialect.tokenizer);

    const databaseSchema = runStateMachine(tokens, normalizedSql, dialect);

    const enrichedTables = enrichTables(databaseSchema);
    const svg = svgGenerator(enrichedTables);

    const fileName = outputName.endsWith('.svg') ? outputName : `${outputName}.svg`;

    return writeSvgFile(fileName, svg, outputDir);
}