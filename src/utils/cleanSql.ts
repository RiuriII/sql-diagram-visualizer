
/**
 * Cleans SQL content by removing block comments, line comments, USE statements, CREATE DATABASE statements, and CREATE TABLE LIKE statements.
 * 
 * @param {string} sqlContent  The raw SQL content to clean
 * @returns {string[]}  An array of cleaned SQL lines
 **/
export const cleanSql = (sqlContent: string): string[] => {
  const withoutBlockComments = sqlContent.replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  ); // remove block comments 

  return withoutBlockComments
    .split(/\r?\n/) // Suporte a Windows/Linux
    .map((line) => line.trim()) // Remove espaços extras
    .filter(
      (line) =>
        line.length > 0 &&
        !/^(\-\-|#)/.test(line) && // Remove comentários
        !/^USE\s/i.test(line) && // Remove 'USE ...'
        !/^CREATE\s+DATABASE/i.test(line) && // Remove 'CREATE DATABASE ...'
        !/^CREATE\s+TABLE\s+.+\s+LIKE\s+.+;?$/i.test(line) // remove tabelas clone 

    );
};
