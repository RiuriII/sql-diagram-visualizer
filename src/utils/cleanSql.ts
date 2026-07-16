/**
 * Lógica de limpeza compartilhada entre os dois dialetos (MySQL e PostgreSQL):
 * remove comentários de bloco, comentários de linha (inclusive inline no
 * final da linha), linhas vazias, "CREATE DATABASE ..." e clones de tabela
 * no estilo "CREATE TABLE novo LIKE antigo;".
 *
 * IMPORTANTE: esta é uma limpeza orientada a linha (não um tokenizer SQL
 * completo), então assume que marcadores de comentário não aparecem dentro
 * de literais de string. Isso segue a mesma premissa já usada pelo restante
 * do parser (uma definição por linha) e é uma limitação conhecida.
 *
 * @param sqlContent - O conteúdo SQL bruto
 * @param wholeLineCommentPattern - regex que identifica uma linha que é
 *   INTEIRAMENTE um comentário, específico de cada dialeto (ver cleanMysql
 *   e cleanPostgresql)
 * @returns Array de linhas já limpas
 */
const cleanCommon = (
  sqlContent: string,
  wholeLineCommentPattern: RegExp
): string[] => {
  const withoutBlockComments = sqlContent.replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  ); // remove comentários de bloco

  return withoutBlockComments
    .split(/\r?\n/) // Suporte a Windows/Linux
    .map((line) => line.trim()) // Remove espaços extras
    .map((line) =>
      // Remove comentários inline no final da linha (ex: "id INT, -- chave"),
      // preservando o conteúdo antes do marcador. Só considera comentário
      // quando o marcador vem precedido de espaço, para reduzir falsos
      // positivos (ex: "DEFAULT -100").
      line.replace(/\s+(--|#).*$/, "").trim()
    )
    .filter(
      (line) =>
        line.length > 0 &&
        !wholeLineCommentPattern.test(line) && // Remove comentários que ocupam a linha inteira
        !/^CREATE\s+DATABASE/i.test(line) && // Remove 'CREATE DATABASE ...'
        // Remove clones de tabela no estilo MySQL: CREATE TABLE novo LIKE antigo;
        // Os identificadores são restritos (sem parênteses) e a linha inteira
        // é ancorada com $ de propósito: isso evita casar com a sintaxe do
        // PostgreSQL "CREATE TABLE novo (LIKE antigo INCLUDING ALL);", que é
        // uma definição de tabela legítima (não um clone) e precisa
        // continuar sendo processada normalmente pelo parser.
        !/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?[\w.]+["'`]?\s+LIKE\s+["'`]?[\w.]+["'`]?\s*;?\s*$/i.test(line)
    );
};

/**
 * Limpeza específica para dumps MySQL.
 *
 * Diferenças em relação ao PostgreSQL:
 * - Comentários de linha inteira aceitam tanto "--" quanto "#" (o "#" é
 *   exclusivo do MySQL; em Postgres ele pode ser conteúdo legítimo).
 * - Remove comandos "USE database;", que não existem em PostgreSQL.
 *
 * @param sqlContent - O conteúdo SQL bruto de um dump MySQL
 * @returns Array de linhas já limpas
 */
export const cleanMysql = (sqlContent: string): string[] => {
  const lines = cleanCommon(sqlContent, /^(\-\-|#)/);
  return lines.filter((line) => !/^USE\s/i.test(line)); // Remove 'USE ...'
};

/**
 * Limpeza específica para dumps PostgreSQL.
 *
 * Diferenças em relação ao MySQL:
 * - Apenas "--" é tratado como comentário de linha inteira ("#" não é
 *   comentário em Postgres e pode ser conteúdo legítimo de uma linha).
 * - Não filtra "USE database;", pois esse comando não existe em Postgres
 *   (o equivalente seria SET search_path / \connect, que também não fazem
 *   sentido dentro de um dump de schema).
 *
 * Observação: ruído típico de pg_dump entre tabelas (ALTER TABLE ... OWNER TO,
 * COMMENT ON ..., CREATE SEQUENCE ..., SET ...) não precisa ser filtrado
 * aqui. Com a correção da fronteira de bloco em groupIntoBlocks (parsePostgresql.ts),
 * essas linhas simplesmente não pertencem a nenhum bloco de CREATE TABLE e
 * são descartadas naturalmente pelo parser, sem risco de virarem colunas
 * fantasmas.
 *
 * @param sqlContent - O conteúdo SQL bruto de um dump PostgreSQL
 * @returns Array de linhas já limpas
 */
export const cleanPostgresql = (sqlContent: string): string[] => {
  return cleanCommon(sqlContent, /^\-\-/);
};
