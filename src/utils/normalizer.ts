
/**
 * Normalizes raw SQL text before tokenization.
 *
 * This function performs only text-safe transformations and intentionally
 * avoids any SQL-specific parsing or semantic decisions. Its purpose is to
 * provide a consistent input for the tokenizer while preserving the original
 * meaning of the SQL script.
 *
 * Current normalizations:
 * - Removes the UTF-8 Byte Order Mark (BOM).
 * - Normalizes all line endings to LF (`\n`).
 * - Removes ASCII control characters while preserving tabs and line breaks.
 *
 * @param sqlContent - The raw SQL script.
 * @returns The normalized SQL string.
 */
export const normalize = (sqlContent: string): string => { 
	return sqlContent
	.replace(/^\uFEFF/, '')
	.replace(/\r\n|\r/g, '\n')
	.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); 
}