import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TODA ROTA COM PARÂMETRO NA URL VALIDA O FORMATO ANTES DE CONSULTAR.
 *
 * POR QUE ESTE TESTE EXISTE, e não só a regra escrita: num produto real desta
 * casa a regra JÁ ESTAVA escrita e mesmo assim 36 rotas nasceram sem ela. O que
 * segurou foi um teste que varre as rotas e quebra o CI.
 *
 * O QUE ACONTECE SEM A VALIDAÇÃO: o Postgres estoura em uuid malformado
 * (`22P02`) e em `NaN` numa coluna `integer`. Os dois viram **500 com corpo
 * vazio** onde a resposta certa é 404. O visitante recebe uma tela de erro do
 * servidor por ter digitado o link errado.
 *
 * Na Fatia 1 ele passou a cobrir oito rotas de API e três telas com parâmetro —
 * incluindo `[midiaId]`, que chega de um aparelho com rede ruim (ou seja: chega
 * truncado), e `[token]`, que chega de um link de e-mail (ou seja: chega
 * quebrado em duas linhas).
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const PASTAS = [path.join(RAIZ, "app")];

/**
 * Os verificadores de formato. `ehTokenDeAcesso` entrou na Fatia 1: o link do
 * casal, o do moderador e o do telão são tokens de 64 hexadecimais, e eles
 * chegam tortos com a mesma facilidade de um uuid — cliente de e-mail quebra URL
 * longa em duas linhas.
 */
const VERIFICADORES = /ehUuid|ehIdNumerico|ehSlug|ehTokenDeAcesso|ehChaveDeSecao/;

/**
 * O VERIFICADOR CERTO PARA CADA PARÂMETRO (v1.0, V-14).
 *
 * A varredura acima pergunta "esta rota valida alguma coisa?". Ela passa numa
 * rota com dois parâmetros que valida só o primeiro — e foi exatamente esse o
 * risco que a v1.0 criou: `/painel/[eventoId]/site/[secao]` tem um uuid e uma
 * palavra, o `ehUuid` do `[eventoId]` satisfaria a varredura sozinho, e o
 * `[secao]` iria ao catálogo sem passar por lista de permitidos.
 *
 * Por isso a régua aqui é por NOME de parâmetro. Parâmetro novo cujo nome não
 * esteja neste mapa **reprova**, e essa é a parte que importa: a decisão de como
 * validá-lo passa a ser tomada num commit que alguém lê, e não esquecida numa
 * rota que já estava verde.
 */
const VERIFICADOR_DO_PARAMETRO: Record<string, RegExp> = {
  // Todo id de entidade deste produto é uuid.
  id: /ehUuid/,
  eventoId: /ehUuid/,
  acessoId: /ehUuid/,
  convidadoId: /ehUuid/,
  participacaoId: /ehUuid/,
  midiaId: /ehUuid/,
  fotoId: /ehUuid/,
  indicacaoId: /ehUuid/,
  perguntaId: /ehUuid/,
  itemId: /ehUuid/,

  // A chave humana do inquilino, e a única que aparece na URL do convidado.
  slug: /ehSlug/,

  // Credencial ao portador, 64 hexadecimais, que chega quebrada de cliente de
  // e-mail com a mesma facilidade de um uuid.
  token: /ehTokenDeAcesso/,

  /**
   * A palavra da seção (V-04 a V-09, V-18). Ela **não é id**: é uma das oito
   * chaves do catálogo, e o verificador dela é uma lista de permitidos derivada
   * do próprio catálogo. `ehUuid` aqui seria verde e errado.
   */
  secao: /ehChaveDeSecao/,
};

/** `[eventoId]` e `[secao]` de um caminho de arquivo, na ordem em que aparecem. */
function parametrosDe(relativo: string): string[] {
  return [...relativo.matchAll(/\[(\w+)\]/g)].map(a => a[1]);
}

/**
 * Parâmetros que não são id de entidade e portanto não têm o que validar aqui.
 * É uma lista de exceções conhecidas, com motivo — não um lugar para esconder
 * rota nova.
 */
const SEM_ID_DE_ENTIDADE: Record<string, string> = {};

function arquivosComParametro(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) arquivosComParametro(completo, acc);
    else if (
      (entrada.name === "route.ts" || entrada.name === "page.tsx") &&
      completo.includes("[")
    ) {
      acc.push(completo);
    }
  }
  return acc;
}

const rotas = PASTAS.flatMap(p => arquivosComParametro(p)).map(caminho => ({
  caminho,
  relativo: path.relative(RAIZ, caminho).split(path.sep).join("/"),
  fonte: fs.readFileSync(caminho, "utf8"),
}));

describe("rotas com [param] na URL", () => {
  it("existe pelo menos uma rota para conferir — se não, o varredor quebrou", () => {
    expect(
      rotas.length,
      "Nenhuma rota com [param] encontrada. Ou o produto perdeu /e/[slug], ou este varredor parou de achar arquivo — e aí o teste vira verde sem verificar nada."
    ).toBeGreaterThan(0);
  });

  it("nenhuma rota leva um parâmetro da URL ao banco sem validar o formato", () => {
    const semGuarda = rotas
      .filter(r => !(r.relativo in SEM_ID_DE_ENTIDADE))
      .filter(r => !VERIFICADORES.test(r.fonte))
      .map(r => r.relativo);

    expect(
      semGuarda,
      "Estas rotas leem um parâmetro da URL e mandam direto para o banco:\n" +
        semGuarda.map(r => `  - ${r}`).join("\n") +
        "\n\nUse ehUuid(), ehIdNumerico() ou ehSlug() de lib/ids.ts e devolva 404. " +
        "Id malformado é 404, não 500. Se o parâmetro não for id de entidade, " +
        "declare a exceção com o motivo em SEM_ID_DE_ENTIDADE."
    ).toEqual([]);
  });

  it("a validação vem ANTES da consulta, e não depois", () => {
    /**
     * Duas coisas saem do texto antes da comparação, e as duas por experiência:
     *
     * 1. As linhas de `import` — elas trazem os nomes das funções de consulta
     *    para o topo do arquivo por ordem alfabética, e sem removê-las este
     *    teste reprovaria uma rota correta.
     * 2. Os COMENTÁRIOS — a rota de intenção explica no cabeçalho, de propósito,
     *    que `registrarIntencao(...)` vem antes de `assinarFaixas(...)`. Contar
     *    essa menção como "consulta" faria o teste reprovar justamente o arquivo
     *    que documenta a ordem que ele existe para proteger.
     */
    const semImports = (fonte: string) =>
      fonte
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1")
        .replace(/^import[\s\S]*?;$/gm, "");
    const CONSULTA =
      /eventoPorSlug\(|eventoDaRequisicao\(|buscarEvento\w*\(|listarIndicacoes\(|autorizar\(|garantirParticipacao\(|listarAcessos\(|confirmarFaixa\(|registrarIntencao\(/;

    const foraDeOrdem = rotas
      .filter(r => VERIFICADORES.test(r.fonte))
      .filter(r => {
        const corpo = semImports(r.fonte);
        const posValidacao = corpo.search(VERIFICADORES);
        const posConsulta = corpo.search(CONSULTA);
        return posConsulta !== -1 && posValidacao !== -1 && posConsulta < posValidacao;
      })
      .map(r => r.relativo);

    expect(
      foraDeOrdem,
      "Nestas rotas a consulta aparece antes do verificador. Validar depois de " +
        "consultar não evita nada — o erro do Postgres já aconteceu:\n" +
        foraDeOrdem.map(r => `  - ${r}`).join("\n")
    ).toEqual([]);
  });

  it("cada parâmetro é validado pelo verificador do seu tipo, e não pelo do vizinho", () => {
    const faltando: string[] = [];
    const desconhecidos: string[] = [];
    let conferidos = 0;

    for (const rota of rotas) {
      if (rota.relativo in SEM_ID_DE_ENTIDADE) continue;
      for (const parametro of parametrosDe(rota.relativo)) {
        conferidos++;
        const verificador = VERIFICADOR_DO_PARAMETRO[parametro];
        if (!verificador) {
          desconhecidos.push(`${rota.relativo} → [${parametro}]`);
          continue;
        }
        if (!verificador.test(rota.fonte)) {
          faltando.push(`${rota.relativo} → [${parametro}]`);
        }
      }
    }

    // Sem esta linha o teste fica verde por não ter conferido nada — que é como
    // um varredor quebrado se disfarça de suíte passando.
    expect(conferidos, "Nenhum [param] extraído dos caminhos").toBeGreaterThan(20);

    expect(
      desconhecidos,
      "Estes parâmetros não estão em VERIFICADOR_DO_PARAMETRO: " +
        desconhecidos.join(", ") +
        ". Declare o verificador do parâmetro novo — um parâmetro que ninguém " +
        "declarou é um parâmetro que a varredura acima dá por validado porque a " +
        "rota valida OUTRA coisa."
    ).toEqual([]);

    expect(
      faltando,
      "Estes parâmetros chegam ao banco sem o verificador do próprio tipo: " +
        faltando.join(", ")
    ).toEqual([]);
  });

  it("a lista de exceções não guarda rota que já não existe", () => {
    const existentes = new Set(rotas.map(r => r.relativo));
    const orfas = Object.keys(SEM_ID_DE_ENTIDADE).filter(r => !existentes.has(r));
    expect(
      orfas,
      `Exceções apontando para rota inexistente: ${orfas.join(", ")}. Remova-as — ` +
        "exceção esquecida vira permissão silenciosa se o arquivo voltar."
    ).toEqual([]);
  });
});
