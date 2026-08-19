import { describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import {
  escreverCursor,
  fotosDoTelao,
  lerCursor,
  novidadesDoFeed,
  PAGINA_DO_FEED,
  paginaDoFeed,
} from "@/lib/feed";

/**
 * O FEED DA FESTA (H-11) — e ele é infraestrutura, não enfeite.
 *
 * É o feed que mantém a aba aberta, e no iOS a fila só drena com a aba aberta
 * (`escopo-core.md` §3.4). Um defeito aqui não é "a grade ficou estranha": é a
 * foto de alguém não subindo.
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

/** Guarda o SQL para as afirmações sobre a cláusula, não só sobre o resultado. */
function espiao(resposta: (texto: string) => Record<string, unknown>[]) {
  const consultas: Array<{ texto: string; valores: unknown[] }> = [];
  const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
    consultas.push({ texto, valores });
    return resposta(texto);
  }) as unknown as Executor;
  return { exec, consultas };
}

function linhaDoFeed(sobrepor: Record<string, unknown> = {}) {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    lote_id: "88888888-8888-4888-8888-888888888888",
    armazenada_em: new Date("2027-08-22T23:00:00.000Z"),
    largura: 1600,
    altura: 1200,
    rotulo: "Ana Silva",
    no_lote: 1,
    ...sobrepor,
  };
}

describe("os quatro filtros do feed", () => {
  it("a cláusula exige armazenada, feed, aprovação e não excluída", async () => {
    /**
     * Os quatro juntos, e cada um tem uma consequência própria se cair:
     *
     *   `estado = 'armazenada'`   → foto sem prévia apareceria como quadro vazio
     *   `visibilidade = 'feed'`   → **uma foto `noivos` na parede da festa**
     *   `aprovacao in (...)`      → a fila deixaria de segurar o feed (RN-05)
     *   `excluida_em is null`     → a foto apagada voltaria (RN-20)
     *
     * O segundo é o que não tem conserto depois.
     */
    const { exec, consultas } = espiao(() => []);
    await paginaDoFeed(EVENTO, null, 40, exec);
    const sql = consultas[0].texto;
    expect(sql).toMatch(/estado = 'armazenada'/);
    expect(sql).toMatch(/visibilidade = 'feed'/);
    expect(sql).toMatch(/aprovacao in \('nao_requer', 'aprovada'\)/);
    expect(sql).toMatch(/excluida_em is null/);
  });

  it("o telão usa O MESMO recorte, e não um parecido", async () => {
    /**
     * Se as duas consultas divergirem, uma foto que o convidado tirou do feed
     * continuaria na parede — e a promessa da H-10 ("some do feed **e do
     * telão**") passaria a depender de alguém lembrar de mudar dois lugares.
     */
    const doFeed = espiao(() => []);
    await paginaDoFeed(EVENTO, null, 40, doFeed.exec);
    const doTelao = espiao(() => []);
    await fotosDoTelao(EVENTO, null, 60, doTelao.exec);

    for (const pedaco of [
      "estado = 'armazenada'",
      "visibilidade = 'feed'",
      "aprovacao in ('nao_requer', 'aprovada')",
      "excluida_em is null",
    ]) {
      expect(doFeed.consultas[0].texto).toContain(pedaco);
      expect(doTelao.consultas[0].texto).toContain(pedaco.replace(/^/, "m.")
        .replace("m.estado", "m.estado")
      );
    }
  });

  it("ordena pela hora do SERVIDOR, e nunca por `capturada_em` (RN-16)", async () => {
    // Relógio de aparelho erra, e uma foto com EXIF de 2019 no topo do feed de
    // um casamento é visível para 200 pessoas ao mesmo tempo.
    const { exec, consultas } = espiao(() => []);
    await paginaDoFeed(EVENTO, null, 40, exec);
    expect(consultas[0].texto).toMatch(/order by armazenada_em desc, id desc/);
    expect(consultas[0].texto).not.toMatch(/capturada_em/);
  });

  it("todas as consultas carregam o `evento_id` (RN-25)", async () => {
    for (const executar of [
      (e: Executor) => paginaDoFeed(EVENTO, null, 40, e),
      (e: Executor) => novidadesDoFeed(EVENTO, null, e),
      (e: Executor) => fotosDoTelao(EVENTO, null, 60, e),
    ]) {
      const { exec, consultas } = espiao(texto =>
        // `count(*)::int as quantas` é da sondagem. O feed também tem um
        // `count(*) over (partition by lote_id)` — casar só por "count" faria
        // este banco falso devolver a linha errada para a consulta errada.
        /as quantas/.test(texto) ? [{ quantas: 0, ate: null }] : []
      );
      await executar(exec);
      for (const consulta of consultas) expect(consulta.valores).toContain(EVENTO);
      for (const consulta of consultas) expect(consulta.valores).not.toContain(OUTRO);
    }
  });
});

describe("o cartão de rajada e a paginação", () => {
  it("um lote vira UM cartão, com a contagem do lote inteiro (RN-17)", async () => {
    const { exec } = espiao(() => [linhaDoFeed({ no_lote: 30 })]);
    const pagina = await paginaDoFeed(EVENTO, null, 40, exec);
    expect(pagina.itens).toHaveLength(1);
    // 30, e não a fração que caiu nesta página: o agrupamento é feito no banco
    // justamente para a contagem ser a do lote e a página ter 40 CARTÕES.
    expect(pagina.itens[0].noLote).toBe(30);
  });

  it("o agrupamento acontece no banco, com `distinct on (lote_id)`", async () => {
    /**
     * Agrupando no cliente, uma página de 40 mídias em que 30 são do mesmo lote
     * entregaria 11 cartões — o convidado rolaria três vezes para encher a tela,
     * e a página seguinte poderia trazer o resto do mesmo lote e duplicar o
     * cartão.
     */
    const { exec, consultas } = espiao(() => []);
    await paginaDoFeed(EVENTO, null, 40, exec);
    expect(consultas[0].texto).toMatch(/distinct on \(lote_id\)/);
  });

  it("o cursor só existe quando há mais página", async () => {
    const cheia = espiao(() =>
      Array.from({ length: PAGINA_DO_FEED + 1 }, (_, i) =>
        linhaDoFeed({ id: `a${String(i).padStart(7, "0")}-1111-4111-8111-111111111111` })
      )
    );
    const comMais = await paginaDoFeed(EVENTO, null, PAGINA_DO_FEED, cheia.exec);
    expect(comMais.itens).toHaveLength(PAGINA_DO_FEED);
    expect(comMais.cursor).not.toBeNull();

    const curta = espiao(() => [linhaDoFeed()]);
    const fim = await paginaDoFeed(EVENTO, null, PAGINA_DO_FEED, curta.exec);
    // Sem cursor no fim: pedir a próxima página e receber vazio faria a tela
    // mostrar um esqueleto que nunca preenche.
    expect(fim.cursor).toBeNull();
  });

  it("cursor torto vira `null` em vez de estourar", () => {
    // Ele vem da URL, e a URL vem de um link colado.
    expect(lerCursor(null)).toBeNull();
    expect(lerCursor("")).toBeNull();
    expect(lerCursor("lixo")).toBeNull();
    expect(lerCursor("nao-e-data|id")).toBeNull();
  });

  it("o cursor vai e volta", () => {
    const cursor = escreverCursor({
      armazenadaEm: "2027-08-22T23:00:00.000Z",
      id: "99999999-9999-4999-8999-999999999999",
    });
    expect(lerCursor(cursor)).toEqual({
      armazenadaEm: "2027-08-22T23:00:00.000Z",
      id: "99999999-9999-4999-8999-999999999999",
    });
  });
});

describe("o contrato do feed — nenhum campo de estado (RN-32e)", () => {
  it("o item do feed não carrega visibilidade, chegada nem aprovação", async () => {
    /**
     * "Quem vê?" é constante ali (tudo que está no feed está no feed) e "já
     * chegou?" também (o feed só contém o que já chegou). Marcar estado numa
     * grade em que ele nunca varia é ruído em 6.000 cards — e é o que faria as
     * duas perguntas vazarem para uma tela onde nenhuma delas tem resposta
     * variável.
     */
    const { exec } = espiao(() => [linhaDoFeed()]);
    const pagina = await paginaDoFeed(EVENTO, null, 40, exec);
    const chaves = Object.keys(pagina.itens[0]);
    expect(chaves).not.toContain("visibilidade");
    expect(chaves).not.toContain("chegada");
    expect(chaves).not.toContain("aprovacao");
    expect(chaves).not.toContain("estado");
  });
});

describe("a sondagem barata", () => {
  it("devolve só quantidade e marca de tempo", async () => {
    const { exec } = espiao(() => [
      { quantas: 12, ate: new Date("2027-08-22T23:05:00.000Z") },
    ]);
    const novidades = await novidadesDoFeed(EVENTO, null, exec);
    expect(Object.keys(novidades).sort()).toEqual(["ate", "quantas"]);
    expect(novidades.quantas).toBe(12);
  });

  it("sem nada novo, a marca NÃO anda", async () => {
    /**
     * Devolver "agora" faria a próxima sondagem pular as fotos que chegaram
     * entre a consulta e a resposta — e elas nunca apareceriam, sem nada
     * estourar.
     */
    const desde = new Date("2027-08-22T23:00:00.000Z");
    const { exec } = espiao(() => [{ quantas: 0, ate: null }]);
    const novidades = await novidadesDoFeed(EVENTO, desde, exec);
    expect(novidades.quantas).toBe(0);
    expect(novidades.ate).toBe(desde.toISOString());
  });
});
