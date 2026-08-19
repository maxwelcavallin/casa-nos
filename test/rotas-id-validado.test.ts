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
const VERIFICADORES = /ehUuid|ehIdNumerico|ehSlug|ehTokenDeAcesso/;

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
