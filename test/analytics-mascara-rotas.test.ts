import { describe, expect, it } from "vitest";

import { caminhoMascarado, localizacaoMascarada } from "@/lib/analytics-privacidade";
import { ROTAS_DE_API, TELAS, segmentosPublicos } from "@/lib/rotas";

/**
 * A MÁSCARA VALE PARA TODA ROTA — INCLUSIVE AS QUE AINDA NÃO EXISTEM (RN-24,
 * decisão P14).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO É CATRACA E NÃO LEMBRETE: em 18/08/2026 o produto vazou o nome do
 * casal para o GA4 em toda abertura de página — no `page_location`, no
 * `page_title` e no cabeçalho `Referer`. A correção pontual conserta o caso
 * conhecido e volta a acontecer na próxima tela. **E o GA4 não preenche o
 * passado**: identificador que vazou hoje não se limpa amanhã.
 *
 * A Fatia 1 é onde isso fica mais caro, porque ela cria as primeiras páginas
 * cujo caminho pode conter nome de convidado — que é PII de **terceiro**, e ele
 * nem escolheu estar ali.
 *
 * Esta varredura pega a lista de rotas declaradas e passa cada uma pela máscara.
 * Uma rota nova nasce mascarada; para sair da máscara é preciso declarar o
 * segmento em `lib/rotas.ts`, de propósito, num commit que alguém lê.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const WID = "11111111-1111-4111-8111-111111111111";
const SLUG = "ana-e-max";

/** O que um caminho não pode conter depois de mascarado. */
const IDENTIFICADORES = [
  { nome: "o slug do casal", valor: SLUG },
  { nome: "um token de 64 hex", valor: "f".repeat(64) },
  { nome: "um nome de convidado", valor: "joao-silva" },
  { nome: "um uuid de mídia", valor: "99999999-9999-4999-8999-999999999999" },
];

/** Preenche `[param]` com algo que identifica alguém. */
function comValores(molde: string, valor: string): string {
  return molde.replace(/\[[^\]]+\]/g, valor);
}

describe("toda rota declarada chega mascarada ao GA4", () => {
  it("existe rota para conferir", () => {
    expect(TELAS.length + ROTAS_DE_API.length).toBeGreaterThan(5);
  });

  for (const identificador of IDENTIFICADORES) {
    it(`nenhuma tela deixa passar ${identificador.nome}`, () => {
      const vazando = TELAS.map(tela => comValores(tela.caminho, identificador.valor))
        .map(caminho => ({
          caminho,
          mascarado: localizacaoMascarada(`https://anaemax.com.br${caminho}`, WID),
        }))
        .filter(r => r.mascarado.includes(identificador.valor))
        .map(r => r.caminho);

      expect(
        vazando,
        `Estes caminhos mandariam ${identificador.nome} legível ao GA4:\n` +
          vazando.map(c => `  - ${c}`).join("\n") +
          "\n\nO GA4 não preenche o passado: o que vazar hoje não se limpa amanhã."
      ).toEqual([]);
    });

    it(`nenhuma rota de API deixa passar ${identificador.nome}`, () => {
      // As rotas de API não geram `page_view`, mas elas viram `page_location` se
      // alguém as abrir no navegador — e um erro num link colado faz isso.
      const vazando = ROTAS_DE_API.map(rota => comValores(rota.caminho, identificador.valor))
        .map(caminho => localizacaoMascarada(`https://anaemax.com.br${caminho}`, WID))
        .filter(mascarado => mascarado.includes(identificador.valor));

      expect(vazando).toEqual([]);
    });
  }

  it("rota que ainda não existe nasce mascarada", () => {
    // O lado seguro de errar: o padrão é `_`, e quem quiser ver a superfície no
    // relatório declara a palavra em lib/rotas.ts.
    expect(caminhoMascarado("https://x.com.br/rota-do-futuro/maria", WID)).toBe(
      `/e/${WID}/_/_`
    );
  });

  it("o que é público é palavra de superfície, não nome de gente", () => {
    // Não dá para testar semântica; dá para travar a lista, para que acrescentar
    // uma palavra seja uma decisão visível num diff, e não um efeito colateral.
    expect([...segmentosPublicos()].sort()).toEqual([
      "album",
      /**
       * AS SETE CHAVES DE SEÇÃO (v1.0, V-04 a V-09). Elas aparecem espalhadas
       * nesta lista porque ela é ordenada, e são: `capa`, `onde`, `programacao`,
       * `historia`, `perguntas`, `indicacoes` e `rodape`.
       *
       * Cada uma nomeia **qual editor foi aberto**, e nenhuma nomeia gente: a
       * tela de `historia` é a mesma para todo casal, e o texto que ela edita
       * não vai para o GA4 em canto nenhum. O `[eventoId]` que vem antes delas
       * continua mascarado (RN-24).
       */
      "capa",
      "convidado",
      // A lista da F1.3/F1.4. As três palavras novas nomeiam SUPERFÍCIE, e
      // nenhuma delas nomeia gente: `minhas` é a mesma tela para todo mundo,
      // `convidados` é a tela de colar nomes (e não um nome), e `materiais` é o
      // cartão impresso. O rótulo do convidado continua fora de tudo.
      "convidados",
      "dia",
      // As quatro da F1.5 a F1.7. `dia-ao-vivo`, `fila` e `midias` são telas do
      // painel — nomeiam o que a tela FAZ, não quem a abriu. `r` é a porta do
      // link guardado, e o token que vem depois dela continua mascarado como
      // qualquer outro: ele é credencial ao portador.
      "dia-ao-vivo",
      "entrar",
      "feed",
      "fila",
      "historia",
      "indicacoes",
      "materiais",
      "midias",
      "minhas",
      "onde",
      "painel",
      "perguntas",
      "programacao",
      "r",
      "rodape",
      /**
       * A palavra da v1.0. `site` nomeia a SUPERFÍCIE — a casa do editor — e não
       * nomeia ninguém: é a mesma tela para todo casal. O `[eventoId]` que vem
       * antes dela continua mascarado, como em toda tela de painel (RN-24).
       */
      "site",
      "telao",
    ]);
  });

  it("os segmentos declarados por cada tela estão todos na lista", () => {
    const publicos = segmentosPublicos();
    const orfaos: string[] = [];
    for (const tela of TELAS) {
      for (const segmento of tela.segmentosPublicos) {
        if (!publicos.has(segmento)) orfaos.push(`${tela.caminho} → ${segmento}`);
      }
    }
    expect(orfaos).toEqual([]);
  });

  it("o caminho do álbum vira /e/<wedding_id>/album, e não o slug", () => {
    expect(caminhoMascarado(`https://anaemax.com.br/e/${SLUG}/album`, WID)).toBe(
      `/e/${WID}/album`
    );
  });

  it("o token do link de entrada nunca chega inteiro", () => {
    const token = "f".repeat(64);
    expect(caminhoMascarado(`https://x.com.br/entrar/${token}`, WID)).toBe(
      `/e/${WID}/entrar/_`
    );
  });
});
