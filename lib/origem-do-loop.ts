"use client";

/**
 * `referring_wedding_id` — a **segunda** ponta do loop (H-16, `metricas.md`
 * §13.7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SÃO DUAS PONTAS, E A PRIMEIRA É A QUE VALE:
 *
 *   servidor → `leads.evento_id_origem`, `not null`, gravado no toque
 *   aparelho → esta marca no `localStorage`, lida no cadastro da Fatia 2
 *
 * A primeira é a que sustenta o número. A segunda existe para o caso em que a
 * pessoa **não deixou contato na festa** e volta meses depois pelo próprio pé:
 * aí não há lead para casar, e o `localStorage` é a única coisa que ainda liga o
 * cadastro ao casamento onde ela viu o produto.
 *
 * **`localStorage` E NÃO COOKIE**, e a diferença importa aqui: este produto roda
 * com `analytics_storage: denied` e sem banner. Um cookie de atribuição seria
 * exatamente o que a decisão de consentimento recusou; `localStorage` é chave de
 * produto no aparelho da pessoa, é apagável por ela, e não viaja em requisição
 * nenhuma.
 *
 * **O QUE ELA NÃO É:** rastreamento entre sites. A chave é lida por uma única
 * origem, guarda um uuid de evento — dado de inquilino, não de pessoa — e nunca
 * é enviada ao GA4.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **A OUTRA METADE DO CRITÉRIO NÃO EXISTE NESTA FATIA, e a ausência é
 * declarada:** *"o link do CTA carrega `?de=<wedding_id>`"* pressupõe um destino
 * — a página de cadastro do casal —, e ela é da Fatia 2 (V8, e não há aquisição
 * pública na Fatia 1). O CTA aqui não navega: ele abre uma folha. `enderecoComOrigem`
 * já existe, tem teste, e passa a ser usada no dia em que o destino existir.
 */

const CHAVE = "casa-nos:referring_wedding_id";

/** Grava a origem no toque do CTA. Silenciosa quando não há `localStorage`. */
export function marcarOrigemDoLoop(weddingId: string): void {
  try {
    window.localStorage.setItem(CHAVE, weddingId);
  } catch {
    /**
     * Modo privado do Safari, cota cheia, armazenamento bloqueado por política.
     * **Nada quebra:** a ponta que sustenta o número é a do servidor, e esta é a
     * redundância. Um `throw` aqui derrubaria a folha do CTA por causa de um
     * dado que é auxiliar.
     */
  }
}

export function origemDoLoopGuardada(): string | null {
  try {
    return window.localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

/**
 * `https://casa-nos.app/cadastro` + `?de=<wedding_id>`.
 *
 * Sem consumidor na Fatia 1 (ver o cabeçalho). Está escrita e testada para que a
 * Fatia 2 não tenha que redescobrir o nome do parâmetro — `de`, e não `ref`, nem
 * `origem`, nem `utm_source`: os três primeiros seriam mais um nome para a mesma
 * coisa, e `utm_source` é do GA4, que não é quem lê isto.
 */
export function enderecoComOrigem(destino: string, weddingId: string): string {
  const separador = destino.includes("?") ? "&" : "?";
  return `${destino}${separador}de=${encodeURIComponent(weddingId)}`;
}
