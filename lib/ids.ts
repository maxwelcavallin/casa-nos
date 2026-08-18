/**
 * Verificadores de id que vêm da URL.
 *
 * POR QUE: id malformado que chega ao Postgres não vira 404, vira **500**. Uuid
 * inválido estoura `22P02`; `NaN` numa coluna `integer` estoura tipo. Nos dois
 * casos o visitante recebe uma tela de erro do servidor onde deveria receber
 * "não encontrado".
 *
 * A regra por si não segura nada — num produto real ela já existia e mesmo
 * assim 36 rotas nasceram sem ela. O que segura é `test/rotas-id-validado.test.ts`,
 * que varre toda rota com `[param]` e quebra o CI. Se você criar uma rota nova
 * com parâmetro, ela precisa chamar um destes.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ehUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

export function ehIdNumerico(valor: unknown): valor is string {
  if (typeof valor !== "string" || valor.trim() === "") return false;
  return /^\d+$/.test(valor) && Number.isSafeInteger(Number(valor));
}

/**
 * Slug de evento: minúsculas, números e hífen, 2 a 60 caracteres, sem hífen nas
 * pontas nem hífen duplo.
 *
 * O slug é chave de inquilino e entra numa consulta. Sem este filtro, qualquer
 * texto da URL viraria parâmetro de consulta — funciona (a consulta é
 * parametrizada), mas devolve 404 por caminho caro, com ida ao banco, e abre a
 * porta para varredura barata do endpoint.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function ehSlug(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    valor.length >= 2 &&
    valor.length <= 60 &&
    SLUG.test(valor)
  );
}

/**
 * Host da requisição → domínio comparável com `evento_dominios.dominio`.
 *
 * Tira a porta (`localhost:3000`), o `www.` e a caixa. `www.anaemax.com.br` e
 * `AnaEMax.com.br` são o mesmo casamento; sem esta normalização o convidado que
 * digita o `www` recebe 404.
 */
export function normalizarDominio(host: string | null | undefined): string | null {
  if (!host) return null;
  const bruto = host.trim().toLowerCase();

  /**
   * A primeira versão cortava no primeiro `:` (`split(":")[0]`) para tirar a
   * porta — e `http://anaemax.com.br` virava o domínio **`http`**, que não
   * existe no cadastro e responderia 404 no site do casal. Um cabeçalho `Host`
   * legítimo nunca traz esquema, mas um proxy mal configurado traz, e o
   * sintoma seria "o site sumiu" sem nada no log.
   *
   * Agora: o que tem `/` ou `@` não é host e é recusado inteiro; só um `:porta`
   * no FIM é removido.
   */
  if (bruto.includes("/") || bruto.includes("@")) return null;

  const limpo = bruto.replace(/:\d+$/, "").replace(/^www\./, "");
  if (limpo === "" || limpo.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(limpo)) return null;
  return limpo;
}
