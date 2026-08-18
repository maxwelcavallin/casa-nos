import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O GTAG É CHAMADO DE UM LUGAR SÓ.
 *
 * POR QUE ISTO É CATRACA E NÃO CONVENÇÃO: o mascaramento da URL mora dentro de
 * `lib/analytics.ts`. Um `gtag('event', ...)` escrito direto numa tela não
 * passa por ele — e como o vazamento é um campo AUSENTE, não um campo errado,
 * ele não aparece em revisão nenhuma. A tela funciona, o evento chega ao
 * relatório, e o nome do casal vai junto porque o gtag leu a URL do navegador
 * sozinho.
 *
 * Foi assim que o vazamento nasceu da primeira vez: um `gtag('config')` escrito
 * como string dentro de um `<Script>`, fora do alcance do `tsc` e do lint.
 *
 * A regra por si não segura nada. Esta varredura, sim.
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const PASTAS = ["app", "components", "lib"];

/** O único arquivo autorizado a falar com o gtag, e o que mascara a URL. */
const FALA_COM_O_GTAG = "lib/analytics.ts";

/**
 * O único autorizado a BAIXAR o gtag.js. É outro arquivo de propósito: carregar
 * o script e comandar o script são coisas diferentes, e a segunda é a que
 * carrega dado.
 */
const CARREGA_O_SCRIPT = "components/analytics/GoogleAnalytics.tsx";

/**
 * A MENÇÃO, e não a chamada.
 *
 * A primeira versão procurava `gtag(` e foi burlada em um caractere por
 * `window.gtag?.('event', ...)` — encadeamento opcional, que passou batido e
 * teria mandado a URL crua com o CI em verde. Um mutante escrito à mão pegou
 * isso; a regra escrita não teria. Por isso a varredura é pela PALAVRA: dentro
 * de `app/`, `components/` e `lib/`, quem escreve `gtag` ou `dataLayer` fora do
 * arquivo autorizado está errado, seja qual for a sintaxe da chamada.
 */
const CHAMADAS = /\bgtag\b|\bdataLayer\b/;
const CARGA = /googletagmanager/;

/** O endereço do script — a única menção legítima a "gtag" fora do módulo. */
const URL_DO_LOADER = /googletagmanager\.com\/gtag\/js/g;

/**
 * Campos de página escritos à mão em qualquer outro lugar: quem os escreve
 * decide o que vai neles, e o valor cru é o que vazava.
 */
const CAMPOS_DE_PAGINA = /\bpage_location\b|\bpage_title\b|\bpage_referrer\b/;

function fontes(dir: string, acc: string[] = []): string[] {
  const completo = path.join(RAIZ, dir);
  if (!fs.existsSync(completo)) return acc;
  for (const entrada of fs.readdirSync(completo, { withFileTypes: true })) {
    const relativo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) fontes(relativo, acc);
    else if (/\.(ts|tsx)$/.test(entrada.name)) acc.push(relativo.split(path.sep).join("/"));
  }
  return acc;
}

const arquivos = PASTAS.flatMap(p => fontes(p)).map(relativo => ({
  relativo,
  fonte: fs.readFileSync(path.join(RAIZ, relativo), "utf8"),
}));

/**
 * Comentário não é código. Este arquivo e os vizinhos explicam o bug em prosa,
 * e a prosa cita os nomes — reprovar por causa dela mandaria a próxima pessoa
 * a apagar justamente a explicação de por que a regra existe.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Código, sem comentário e sem o endereço do script do Google. */
function codigo(fonte: string): string {
  return semComentarios(fonte).replace(URL_DO_LOADER, "");
}

describe("uma porta só para o GA4", () => {
  it("o varredor achou os arquivos — se não, o teste é verde sem verificar nada", () => {
    expect(arquivos.length).toBeGreaterThan(10);
    expect(arquivos.map(a => a.relativo)).toContain(FALA_COM_O_GTAG);
    expect(arquivos.map(a => a.relativo)).toContain(CARREGA_O_SCRIPT);
  });

  it("o gtag.js é baixado de um lugar só", () => {
    const fora = arquivos
      .filter(a => a.relativo !== CARREGA_O_SCRIPT)
      .filter(a => CARGA.test(semComentarios(a.fonte)))
      .map(a => a.relativo);

    expect(
      fora,
      "Estes arquivos carregam o gtag.js por conta própria:\n" +
        fora.map(f => `  - ${f}`).join("\n") +
        `\n\nA carga mora em ${CARREGA_O_SCRIPT}, com referrerPolicy="no-referrer" — ` +
        "sem ele o navegador anuncia a URL real do casamento no cabeçalho Referer."
    ).toEqual([]);
  });

  it("a carga do gtag.js não manda a URL do casamento no cabeçalho", () => {
    const fonte = arquivos.find(a => a.relativo === CARREGA_O_SCRIPT)!.fonte;
    expect(
      semComentarios(fonte),
      "Sumiu o referrerPolicy do <Script> do GA4. Sem ele o navegador envia " +
        "`Referer: https://<dominio-do-casal>/e/ana-e-max` ao buscar o script — " +
        "mascarar o page_location e deixar o cabeçalho troca o vazamento de " +
        "lugar em vez de fechar."
    ).toContain('referrerPolicy="no-referrer"');
  });

  it("ninguém chama o gtag fora de lib/analytics.ts", () => {
    const fora = arquivos
      .filter(a => a.relativo !== FALA_COM_O_GTAG)
      .filter(a => CHAMADAS.test(codigo(a.fonte)))
      .map(a => a.relativo);

    expect(
      fora,
      "Estes arquivos falam com o gtag direto, sem passar pelo mascaramento:\n" +
        fora.map(f => `  - ${f}`).join("\n") +
        "\n\nUse enviarEvento() ou configurarAnalytics() de lib/analytics.ts. " +
        "Chamada direta manda a URL real do casamento — com o nome do casal — " +
        "para o Google, e o campo que vaza é o que você NÃO escreveu."
    ).toEqual([]);
  });

  it("ninguém escreve page_location, page_title ou page_referrer fora de lá", () => {
    const fora = arquivos
      .filter(a => a.relativo !== FALA_COM_O_GTAG)
      .filter(a => CAMPOS_DE_PAGINA.test(codigo(a.fonte)))
      .map(a => a.relativo);

    expect(
      fora,
      "Campo de página escrito fora de lib/analytics.ts:\n" +
        fora.map(f => `  - ${f}`).join("\n") +
        "\n\nOs três saem de camposDePagina(), sempre mascarados e sempre os três."
    ).toEqual([]);
  });

  it("lib/analytics.ts continua mascarando — os três campos, no mesmo lugar", () => {
    const fonte = arquivos.find(a => a.relativo === FALA_COM_O_GTAG)!.fonte;
    const corpo = semComentarios(fonte);

    for (const campo of ["page_location", "page_title", "page_referrer"]) {
      expect(
        corpo,
        `${campo} sumiu de ${FALA_COM_O_GTAG}. Campo ausente não é campo neutro: ` +
          "o gtag volta a ler o valor real do navegador."
      ).toContain(campo);
    }

    expect(
      corpo,
      "O consentimento padrão saiu de lib/analytics.ts. Sem ele o padrão do gtag " +
        "é `granted`, e ninguém terá decidido de propósito."
    ).toContain("analytics_storage");
  });
});
