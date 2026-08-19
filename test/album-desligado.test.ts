import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACOES_DO_ALBUM, MATRIZ, type Acao } from "@/lib/autorizacao";
import { ROTAS_DE_API, type MetodoHttp } from "@/lib/rotas";

/**
 * O ÁLBUM ESTÁ DESLIGADO, E NADA DELE FICA EXPOSTO (v1.0, V-01).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE, e por que ele é a catraca mais importante da
 * v1.0: o desligamento do álbum é UM `if` dentro de `lib/api.ts → autorizar()`,
 * e ele decide o comportamento de ~25 rotas e 10 telas. **O remédio errado —
 * desligar o guarda para fazer um teste passar — é o mais fácil de escrever**, e
 * ele não deixa nenhum sintoma: o produto volta a responder, os testes ficam
 * verdes, e o álbum fica no ar por meses sem ninguém ter decidido isso.
 *
 * As ~115 verificações da Fatia 1 continuam rodando com `albumAtivo: true` nos
 * fixtures — elas são a prova de que o álbum FUNCIONA no dia em que voltar.
 * Este arquivo é a outra metade: a prova de que ele NÃO responde hoje.
 *
 * QUATRO VARREDURAS:
 *   1. O conjunto tem as 17 ações, e as cinco de fora continuam de fora.
 *   2. Toda rota cuja ação está no conjunto responde **404** — invocando o
 *      handler de verdade, não lendo o código-fonte.
 *   3. 404 e nunca 403 — e com a flag LIGADA a mesma rota deixa de dar 404,
 *      que é o que prova que o guarda está ligado no lugar certo.
 *   4. As telas do álbum têm guarda, e o proxy não cunha cookie.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");

const EVENTO = "11111111-1111-4111-8111-111111111111";
const OUTRO_UUID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "a".repeat(64);

/**
 * Um evento completo, com a flag por parâmetro. É o mesmo objeto que
 * `linhaParaEvento` produz — se um campo novo entrar em `Evento`, o `tsc`
 * quebra aqui, que é onde se quer que ele quebre.
 */
function eventoFalso(albumAtivo: boolean) {
  return {
    id: EVENTO,
    slug: "ana-e-max",
    nomeCasal: "Ana Flávia e Maxwel",
    dataEvento: "2027-08-22",
    fuso: "America/Sao_Paulo",
    horaEvento: null,
    horaPublicada: false,
    cidade: "Rio de Janeiro",
    uf: "RJ",
    localNome: null,
    localNomePublicado: false,
    localEndereco: null,
    localLatitude: null,
    localLongitude: null,
    localRaioMetros: null,
    localRevelacao: "oculto" as const,
    publicado: true,
    albumAtivo,
    modoModeracao: "direto" as const,
    envioAbreEm: new Date("2026-01-01T00:00:00Z"),
    envioFechaEm: new Date("2028-01-01T00:00:00Z"),
    enviosEncerradosEm: null,
    novosAparelhosBloqueados: false,
    inicioFestaEm: null,
    fimFestaEm: null,
    presentesContagem: null,
    emailCasal: null,
  };
}

/** A flag que os testes deste arquivo trocam entre um caso e outro. */
let ALBUM_ATIVO = false;

/**
 * O que é substituído, e o que NÃO é.
 *
 * Substituído: o banco, a sessão e a busca do evento — tudo o que fala com o
 * mundo. **Não** substituído: `lib/api.ts`, que é o código sob teste, nem
 * `lib/autorizacao.ts`, que é a decisão sob teste. Um teste que substituísse
 * `autorizar()` provaria que o teste sabe responder 404.
 */
vi.mock("@/lib/db", () => ({
  sql: new Proxy(function () {}, {
    apply: () => {
      throw new Error(
        "O guarda deixou a requisição chegar ao banco. Com o álbum desligado, " +
          "nenhuma rota do conjunto deveria consultar nada."
      );
    },
    get: () => undefined,
  }),
}));

vi.mock("@/lib/eventos", async importarDeVerdade => {
  const real = await importarDeVerdade<typeof import("@/lib/eventos")>();
  return {
    ...real,
    buscarEventoPorId: async () => eventoFalso(ALBUM_ATIVO),
    buscarEventoPorSlug: async () => eventoFalso(ALBUM_ATIVO),
    listarIndicacoes: async () => [],
  };
});

/**
 * A sessão é a do CASAL DONO — o portador mais poderoso do produto.
 *
 * De propósito: se o guarda respondesse 404 para um anônimo e deixasse o dono
 * passar, o teste com anônimo ficaria verde e o álbum continuaria no ar para
 * quem tem o link do painel. O desligamento não é falta de permissão, é a
 * funcionalidade não existir — e ela não existe nem para o dono.
 */
vi.mock("@/lib/sessao", async importarDeVerdade => {
  const real = await importarDeVerdade<typeof import("@/lib/sessao")>();
  return {
    ...real,
    sessaoDoEvento: async () => ({
      tipo: "casal",
      acesso: {
        id: OUTRO_UUID,
        eventoId: EVENTO,
        tipo: "casal",
        rotulo: null,
        dono: true,
        expiraEm: null,
      },
    }),
  };
});

// A tabela de erro é banco. Sem isto, uma exceção dentro de uma rota viraria
// outra exceção dentro do registro dela, e o relatório mostraria a segunda.
vi.mock("@/lib/observabilidade", () => ({
  registrarErro: async () => undefined,
  registrarErroDeCliente: async () => undefined,
}));

/* ------------------------------------------------------------------ *
 * 1. O conjunto — as 17 que entram e as cinco que não entram
 * ------------------------------------------------------------------ */

describe("o conjunto de ações do álbum", () => {
  it("tem exatamente as 17 ações da decisão", () => {
    // Lista travada: acrescentar ou tirar uma ação daqui é uma decisão visível
    // num diff, e não um efeito colateral de mexer noutra coisa.
    expect([...ACOES_DO_ALBUM].sort()).toEqual(
      [
        "album.minhas.ver",
        "convidados.editar",
        "convidados.ver.publico",
        "dia.configurar",
        "evento.materiais.ver",
        "feed.ver",
        "lead.criar",
        "medicao.ver",
        "midia.baixar",
        "midia.enviar",
        "midia.excluir",
        "midia.moderar",
        "midia.ver.todas",
        "midia.visibilidade.editar",
        "participacao.reconciliar",
        "participacao.recuperar",
        "participacao.renomear",
      ].sort()
    );
  });

  it("as cinco que NÃO podem entrar continuam fora", () => {
    /**
     * Cada uma tem um custo concreto se entrar:
     *   evento.configurar → ninguém loga.
     *   site.editar / site.publicar → a v1.0 inteira responde 404.
     *   interno.erro → o único canal que leva defeito a uma pessoa que lê some,
     *                  e o SITE também falha.
     *   interno.cron → a rotina que promete que nenhuma foto se perde para.
     */
    for (const acao of [
      "evento.configurar",
      "site.editar",
      "site.publicar",
      "interno.erro",
      "interno.cron",
    ] as Acao[]) {
      expect(ACOES_DO_ALBUM.has(acao), `${acao} entrou no conjunto`).toBe(false);
    }
  });

  it("toda ação do conjunto existe na matriz", () => {
    const naMatriz = new Set(Object.keys(MATRIZ));
    const fantasmas = [...ACOES_DO_ALBUM].filter(a => !naMatriz.has(a));
    expect(
      fantasmas,
      "Ação no conjunto e fora da matriz: " +
        fantasmas.join(", ") +
        ". Ela nunca será conferida por rota nenhuma."
    ).toEqual([]);
  });

  it("`dia.configurar` existe e é do casal e do dono", () => {
    // O renomeio que torna o desligamento possível. Sem ele, ou o login quebra
    // (com `evento.configurar` no conjunto) ou a tela do dia continua aberta.
    expect(MATRIZ["dia.configurar"]).toEqual({ casal: "todas", dono: "todas" });
  });
});

/* ------------------------------------------------------------------ *
 * 2. A varredura: toda rota do conjunto responde 404
 * ------------------------------------------------------------------ */

declare global {
  interface ImportMeta {
    glob<T = unknown>(padrao: string): Record<string, () => Promise<T>>;
  }
}

type Modulo = Partial<Record<MetodoHttp, (p: Request, c: unknown) => Promise<Response>>>;

const modulos = import.meta.glob<Modulo>("../app/api/**/route.ts");

/** `../app/api/eventos/[id]/dia/route.ts` → `/api/eventos/[id]/dia` */
function urlDoArquivo(arquivo: string): string {
  return "/" + arquivo.replace(/^\.\.\/app\//, "").replace(/\/route\.ts$/, "");
}

/** Um valor plausível para cada `[param]`, para o guarda de formato passar. */
function parametrosDe(caminho: string): Record<string, string> {
  const parametros: Record<string, string> = {};
  for (const achado of caminho.matchAll(/\[([^\]]+)\]/g)) {
    const nome = achado[1];
    parametros[nome] = nome === "id" ? EVENTO : nome === "token" ? TOKEN : OUTRO_UUID;
  }
  return parametros;
}

/**
 * As rotas do conjunto que **não** passam por `autorizar()`, com o motivo.
 *
 * Não é um lugar para esconder rota nova: cada entrada tem um guarda próprio,
 * verificado logo abaixo por leitura do arquivo.
 */
const GUARDA_PROPRIO: Record<string, { motivo: string; padrao: RegExp }> = {
  "/api/sessao/retomar": {
    motivo:
      "É `publica: true` e não tem evento na URL — quem chega ainda não tem sessão, " +
      "então não há `autorizar()` para atravessar. O guarda é escrito à mão e " +
      "responde 410, o mesmo status das outras três saídas da rota.",
    padrao: /!evento\.albumAtivo/,
  },
};

const rotasDoAlbum = ROTAS_DE_API.filter(rota =>
  Object.values(rota.metodos).some(acao => ACOES_DO_ALBUM.has(acao as Acao))
);

describe("toda rota do álbum responde 404 com a flag desligada", () => {
  beforeEach(() => {
    ALBUM_ATIVO = false;
  });

  it("o varredor achou rotas — se não, o resto é falso positivo", () => {
    expect(
      rotasDoAlbum.length,
      "Nenhuma rota com ação do conjunto. Ou o produto perdeu o álbum, ou este " +
        "varredor parou de casar as ações — e aí ele fica verde sem verificar nada."
    ).toBeGreaterThanOrEqual(20);
  });

  for (const rota of rotasDoAlbum) {
    const excecao = GUARDA_PROPRIO[rota.caminho];
    if (excecao) continue;

    for (const [metodo, acao] of Object.entries(rota.metodos)) {
      if (!ACOES_DO_ALBUM.has(acao as Acao)) continue;

      it(`${metodo} ${rota.caminho} → 404`, async () => {
        const arquivo = Object.keys(modulos).find(a => urlDoArquivo(a) === rota.caminho);
        expect(arquivo, `sem arquivo no disco para ${rota.caminho}`).toBeTruthy();

        const modulo = await modulos[arquivo as string]();
        const manipulador = modulo[metodo as MetodoHttp];
        expect(manipulador, `${rota.caminho} não exporta ${metodo}`).toBeTypeOf("function");

        const pedido = new Request(`https://casa-nos.invalid${rota.caminho}`, {
          method: metodo,
          headers: { "content-type": "application/json", "x-telao": TOKEN },
          body: metodo === "GET" || metodo === "DELETE" ? undefined : "{}",
        });

        const resposta = await manipulador!(pedido, {
          params: Promise.resolve(parametrosDe(rota.caminho)),
        });

        expect(
          resposta.status,
          `${metodo} ${rota.caminho} respondeu ${resposta.status}. Com o álbum ` +
            `desligado, a ação \`${acao}\` não existe — e "não existe" é 404. ` +
            "Se você chegou aqui depois de mexer em `autorizar()`, o conserto NÃO " +
            "é tirar a rota do conjunto."
        ).toBe(404);
      });
    }
  }

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * A VACUIDADE, ESCRITA EM VEZ DE ESCONDIDA.
   *
   * A varredura acima usa **uma** sessão: a do casal dono. Três rotas do álbum
   * exigem uma PARTICIPAÇÃO (o cookie do convidado), e com esta sessão elas
   * respondem 404 por conta própria — ou seja, o `→ 404` delas passaria mesmo
   * com o guarda arrancado.
   *
   * Isso não invalida a cobertura: a ação de cada uma (`midia.enviar`,
   * `participacao.renomear`) está no bloco unitário de `autorizar()` logo
   * abaixo, que é onde o guarda de verdade é exercido. O que este teste impede é
   * a lista crescer em silêncio — no dia em que uma quarta rota entrar aqui sem
   * ninguém escrever, a varredura estaria protegendo menos do que parece.
   * ─────────────────────────────────────────────────────────────────────────
   */
  it("as rotas que respondem 404 nos DOIS sentidos são exatamente as declaradas", async () => {
    const declaradas = [
      "POST /api/eventos/[id]/midias/intencao",
      "POST /api/eventos/[id]/midias/[midiaId]/confirmacao",
      "PATCH /api/eventos/[id]/participacoes/atual",
    ].sort();

    ALBUM_ATIVO = true;
    const nosDoisSentidos: string[] = [];

    for (const rota of rotasDoAlbum) {
      if (GUARDA_PROPRIO[rota.caminho]) continue;
      const arquivo = Object.keys(modulos).find(a => urlDoArquivo(a) === rota.caminho);
      if (!arquivo) continue;
      const modulo = await modulos[arquivo]();

      for (const [metodo, acao] of Object.entries(rota.metodos)) {
        if (!ACOES_DO_ALBUM.has(acao as Acao)) continue;
        const manipulador = modulo[metodo as MetodoHttp];
        if (!manipulador) continue;

        const pedido = new Request(`https://casa-nos.invalid${rota.caminho}`, {
          method: metodo,
          headers: { "content-type": "application/json", "x-telao": TOKEN },
          body: metodo === "GET" || metodo === "DELETE" ? undefined : "{}",
        });
        const resposta = await manipulador(pedido, {
          params: Promise.resolve(parametrosDe(rota.caminho)),
        });
        if (resposta.status === 404) nosDoisSentidos.push(`${metodo} ${rota.caminho}`);
      }
    }
    ALBUM_ATIVO = false;

    expect(
      nosDoisSentidos.sort(),
      "Com `album_ativo = true` estas rotas continuaram em 404, e portanto o " +
        "`→ 404` delas na varredura NÃO prova o guarda. Se a lista cresceu, ou " +
        "uma rota nova exige participação (escreva-a aqui, com o motivo), ou o " +
        "guarda deixou de depender da flag — que é o defeito grave."
    ).toEqual(declaradas);
  });

  it("as exceções declaradas têm guarda próprio no arquivo", () => {
    const semGuarda: string[] = [];
    for (const [caminho, { padrao }] of Object.entries(GUARDA_PROPRIO)) {
      const arquivo = path.join(RAIZ, "app", caminho.replace(/^\//, ""), "route.ts");
      const fonte = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : "";
      if (!padrao.test(fonte)) semGuarda.push(caminho);
    }
    expect(
      semGuarda,
      "Estas rotas estão declaradas como exceção e não têm o guarda:\n" +
        semGuarda.map(c => `  - ${c}`).join("\n")
    ).toEqual([]);
  });

  it("a lista de exceções não guarda rota que já não está no conjunto", () => {
    const noConjunto = new Set(rotasDoAlbum.map(r => r.caminho));
    const orfas = Object.keys(GUARDA_PROPRIO).filter(c => !noConjunto.has(c));
    expect(orfas, `Exceções sobrando: ${orfas.join(", ")}`).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 3. 404 e nunca 403 — e a flag ligada destrava
 * ------------------------------------------------------------------ */

describe("o guarda está no lugar certo, e é 404", () => {
  beforeEach(() => {
    ALBUM_ATIVO = false;
  });

  it("`autorizar` responde 404 para toda ação do conjunto — nunca 403", async () => {
    const { autorizar } = await import("@/lib/api");
    const errados: string[] = [];

    for (const acao of ACOES_DO_ALBUM) {
      const resultado = await autorizar(EVENTO, acao);
      if (resultado.ok) {
        errados.push(`${acao}: passou`);
        continue;
      }
      if (resultado.resposta.status !== 404) {
        errados.push(`${acao}: ${resultado.resposta.status}`);
      }
    }

    expect(
      errados,
      "403 confirmaria que o álbum existe e só não pode agora — informação que o " +
        "produto não deve dar sobre uma funcionalidade que ele decidiu não " +
        "oferecer. É a mesma regra do recurso de outro inquilino.\n" +
        errados.map(e => `  - ${e}`).join("\n")
    ).toEqual([]);
  });

  it("o corpo do 404 é o mesmo de qualquer outro 404 do produto", async () => {
    const { autorizar } = await import("@/lib/api");
    const resultado = await autorizar(EVENTO, "feed.ver");
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    // Corpo diferente entregaria pela porta dos fundos o que o status esconde.
    expect(await resultado.resposta.json()).toEqual({ erro: "nao encontrado" });
  });

  it("**com a flag ligada, as mesmas ações deixam de dar 404**", async () => {
    /**
     * ESTE É O TESTE QUE IMPEDE O REMÉDIO ERRADO.
     *
     * Um guarda desligado — ou um `ACOES_DO_ALBUM` esvaziado — faria o bloco
     * acima ficar vermelho. Mas um guarda que responda 404 SEMPRE, ignorando a
     * flag, faria os dois blocos ficarem verdes e o álbum nunca mais voltaria:
     * o `UPDATE` do religamento não teria efeito nenhum, e ninguém saberia por
     * quê. Este caso é o que separa "desligado por dado" de "quebrado".
     */
    ALBUM_ATIVO = true;
    const { autorizar } = await import("@/lib/api");

    const aindaEm404: string[] = [];
    for (const acao of ACOES_DO_ALBUM) {
      const resultado = await autorizar(EVENTO, acao);
      if (!resultado.ok && resultado.resposta.status === 404) aindaEm404.push(acao);
    }

    expect(
      aindaEm404,
      "Com `album_ativo = true` estas ações continuaram em 404. O religamento é " +
        "um `UPDATE`, e ele precisa funcionar:\n" +
        aindaEm404.map(a => `  - ${a}`).join("\n")
    ).toEqual([]);
  });

  it("**nenhuma rota do painel do site entrou no conjunto por engano**", () => {
    /**
     * A v1.0 INTEIRA responderia 404 se `site.editar` caísse no conjunto — e o
     * sintoma seria "o painel parou de funcionar", sem ninguém ligar a causa ao
     * desligamento do álbum. Esta varredura é por CAMINHO, e não por ação: ela
     * pega também o caso em que alguém declara uma rota nova de `/site/` com
     * uma ação do álbum copiada de outra linha.
     */
    const doSite = ROTAS_DE_API.filter(r => r.caminho.includes("/site/"));
    expect(doSite.length, "sumiram as rotas do painel do site").toBeGreaterThanOrEqual(8);

    const capturadas = doSite
      .filter(r => Object.values(r.metodos).some(a => ACOES_DO_ALBUM.has(a as Acao)))
      .map(r => r.caminho);

    expect(
      capturadas,
      "Estas rotas da v1.0 estão declaradas com uma ação do álbum:\n" +
        capturadas.map(c => `  - ${c}`).join("\n") +
        "\n\nCom o álbum desligado elas responderiam 404, e o painel inteiro pararia."
    ).toEqual([]);
  });

  it("a flag não interfere nas ações de fora do conjunto", async () => {
    const { autorizar } = await import("@/lib/api");
    // `evento.configurar` é o login. Com o álbum desligado ele precisa continuar
    // atravessando — este é o caso que, errado, tranca o casal do lado de fora.
    const resultado = await autorizar(EVENTO, "evento.configurar");
    expect(resultado.ok, "o casal deixou de conseguir entrar").toBe(true);

    const site = await autorizar(EVENTO, "site.editar");
    expect(site.ok, "a v1.0 foi desligada junto com o álbum").toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 4. As superfícies que não são rota de API
 * ------------------------------------------------------------------ */

function fonte(relativo: string): string {
  const caminho = path.join(RAIZ, relativo);
  return fs.existsSync(caminho) ? fs.readFileSync(caminho, "utf8") : "";
}

describe("as telas e o proxy", () => {
  /**
   * As telas são componentes de servidor assíncronos: montá-las aqui exigiria um
   * banco. O que se verifica é que o guarda ESTÁ no arquivo — que é a falha
   * possível (alguém cria a tela nova e esquece) e não a falha improvável (o
   * `if` escrito não funciona, que os blocos acima já cobrem no mesmo conceito).
   */
  const TELAS_DO_ALBUM: Array<[string, RegExp]> = [
    ["app/e/[slug]/album/page.tsx", /!evento\.albumAtivo/],
    ["app/e/[slug]/album/minhas/page.tsx", /!evento\.albumAtivo/],
    ["app/telao/[token]/page.tsx", /!evento\.albumAtivo/],
    ["app/r/[token]/page.tsx", /!evento\.albumAtivo/],
    ["app/painel/[eventoId]/dia/page.tsx", /podeNoEvento\(sessao, "dia\.configurar"/],
    ["app/painel/[eventoId]/fila/page.tsx", /podeNoEvento\(sessao, "midia\.moderar"/],
    ["app/painel/[eventoId]/midias/page.tsx", /podeNoEvento\(sessao, "midia\.ver\.todas"/],
    ["app/painel/[eventoId]/dia-ao-vivo/page.tsx", /podeNoEvento\(sessao, "medicao\.ver"/],
    [
      "app/painel/[eventoId]/materiais/page.tsx",
      /podeNoEvento\(sessao, "evento\.materiais\.ver"/,
    ],
    [
      "app/painel/[eventoId]/convidados/page.tsx",
      /podeNoEvento\(sessao, "convidados\.editar"/,
    ],
  ];

  it("as dez telas do álbum passam pelo guarda", () => {
    const semGuarda = TELAS_DO_ALBUM.filter(([arquivo, padrao]) => {
      const texto = fonte(arquivo);
      return texto === "" || !padrao.test(texto);
    }).map(([arquivo]) => arquivo);

    expect(
      semGuarda,
      "Estas telas do álbum não conferem `album_ativo`:\n" +
        semGuarda.map(a => `  - ${a}`).join("\n") +
        "\n\nTela de painel usa `podeNoEvento(sessao, acao, evento)`; tela pública " +
        "confere `evento.albumAtivo` e chama `notFound()`."
    ).toEqual([]);
  });

  it("**nenhuma tela de painel usa `pode()` sem o evento**", () => {
    /**
     * `pode(sessao, acao)` só olha a matriz — ela não conhece a flag. Uma tela de
     * painel que a use continua abrindo com o álbum desligado, e o defeito é
     * invisível em revisão porque a linha parece exatamente igual à certa.
     */
    const infratoras: string[] = [];
    const pastaPainel = path.join(RAIZ, "app", "painel");
    const varrer = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) varrer(completo);
        else if (entrada.name === "page.tsx") {
          const texto = fs
            .readFileSync(completo, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|[^:])\/\/.*$/gm, "$1");
          if (/(?<!podeNo)\bpode\s*\(\s*sessao/.test(texto)) {
            infratoras.push(path.relative(RAIZ, completo).split(path.sep).join("/"));
          }
        }
      }
    };
    varrer(pastaPainel);

    expect(
      infratoras,
      "Estas telas de painel chamam `pode(sessao, ...)` em vez de " +
        "`podeNoEvento(sessao, ..., evento)`:\n" +
        infratoras.map(a => `  - ${a}`).join("\n")
    ).toEqual([]);
  });

  it("o proxy não cunha cookie de participação com o álbum desligado", () => {
    /**
     * Sem esta linha, abrir `/e/<slug>/album` com o álbum desligado deixaria um
     * cookie de participação, válido por meses, no navegador de quem foi para
     * lugar nenhum.
     */
    expect(fonte("proxy.ts")).toMatch(/if \(!evento\.albumAtivo\) return NextResponse\.next\(\)/);
  });

  it("a rota curta leva ao SITE, e não ao álbum", () => {
    /**
     * `/<slug>` era `/e/<slug>/album`, e o `proxy.ts` redireciona sem consultar o
     * banco de propósito. Se o destino continuasse sendo o álbum, o convidado
     * leria o QR e cairia num 404. Nenhum cartão foi impresso — o custo hoje é
     * zero, e a volta ao destino antigo é dependência do religamento.
     */
    const texto = fonte("proxy.ts");
    expect(texto).toMatch(/new URL\(`\/e\/\$\{partes\[0\]\}`, pedido\.nextUrl\)/);
    expect(texto).not.toMatch(/new URL\(`\/e\/\$\{partes\[0\]\}\/album`/);
  });

  it("o cron continua agendado, e a consulta dele filtra a flag", () => {
    /**
     * O agendamento NÃO sai do `vercel.json`: cron que some volta esquecido, e a
     * reconciliação é a promessa de que nenhuma foto se perde. O que muda é a
     * consulta — ela varre zero e a rotina termina em silêncio.
     */
    expect(fonte("vercel.json")).toMatch(/reconciliacao/);
    expect(fonte("lib/eventos.ts")).toMatch(/and album_ativo = true/);
  });
});
