import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A ROTA QUE APAGA A FOTO, E A ORDEM DOS DOIS PASSOS (v1.0, V-19, RV-22 e RV-24).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O QUE ESTE ARQUIVO PROVA, E POR QUE LER O CÓDIGO NÃO SUBSTITUI.**
 *
 * A exclusão é uma coreografia entre um balde e um Postgres, **sem transação
 * entre os dois**. A ordem é o requisito inteiro:
 *
 *   1. o objeto sai de `pub/`;
 *   2. só então a linha recebe `excluido_em`.
 *
 * Invertida, ela produz exatamente o defeito que a confirmação de tirar o site
 * do ar promete que não existe: uma linha que diz "apagada" sobre um arquivo que
 * continua respondendo para quem guardou o endereço (RV-21). E inverter os dois
 * passos é uma refatoração de trinta segundos — "marca a linha primeiro, aí se o
 * R2 demorar a tela já responde" —, que parece uma melhoria de latência e é uma
 * mentira gravada no banco.
 *
 * As três asserções, e todas são sobre ESTADO, não sobre ordem de linhas no
 * arquivo:
 *
 *   1. quando o banco é chamado, o objeto **já saiu** do balde;
 *   2. com o balde recusando, a resposta é **502 e a linha continua viva**;
 *   3. a 13ª foto responde **409 com os dois números** no corpo.
 *
 * **NADA DISSO RODOU EM PRODUÇÃO.** As cinco variáveis do R2 não estão
 * configuradas: o caminho exercitado de verdade foi o de degradação (503 na
 * intenção), e nenhuma foto chegou a subir. Enquanto isso for verdade, este
 * arquivo é a única prova que existe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";
const FOTO = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

/* ------------------------------------------------------------------ *
 * A linha do tempo compartilhada — é dela que sai a prova de ordem
 * ------------------------------------------------------------------ */

type Marca = { quem: "r2" | "banco"; o_que: string };

const linhaDoTempo: Marca[] = [];

const banco = {
  /** A foto existe, e ainda não foi marcada. */
  viva: true,
  /** Quantas fotos armazenadas o evento tem, para o teto. */
  quantas: 0,
};

const execFalso = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
  const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();

  if (/count\(\*\)::int as quantas/.test(texto)) {
    linhaDoTempo.push({ quem: "banco", o_que: "contar" });
    return [{ quantas: banco.quantas }];
  }

  if (/^select id, legenda/.test(texto)) {
    linhaDoTempo.push({ quem: "banco", o_que: "buscar" });
    return banco.viva
      ? [
          {
            id: FOTO,
            legenda: null,
            largura: 1600,
            altura: 1067,
            ordem: 1,
            armazenada_em: new Date(),
          },
        ]
      : [];
  }

  if (/^update evento_fotos set excluido_em/.test(texto)) {
    linhaDoTempo.push({ quem: "banco", o_que: "marcar" });
    if (!banco.viva) return [];
    banco.viva = false;
    return [{ id: FOTO }];
  }

  throw new Error(`Consulta não prevista: ${texto} | ${JSON.stringify(valores)}`);
}) as unknown as never;

vi.mock("@/lib/db", () => ({ sql: execFalso }));

/**
 * O R2 ESPIÃO. Ele **observa o banco no instante em que é chamado** — é daí que
 * sai a prova. Um espião que só contasse chamadas provaria que as duas funções
 * foram chamadas, e não que a linha ainda estava viva quando o objeto saiu.
 */
const r2 = { recusa: false };

vi.mock("@/lib/r2-objetos", () => ({
  apagarDerivadasDaFoto: async () => {
    linhaDoTempo.push({ quem: "r2", o_que: banco.viva ? "apagou-com-linha-viva" : "apagou-tarde" });
    return !r2.recusa;
  },
}));

const eventoFalso = {
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
  // A flag do álbum ligada no fixture, como nos outros testes da Fatia 1: as
  // rotas da galeria não dependem dela (RV-23), e `test/album-desligado.test.ts`
  // é quem prova isso.
  albumAtivo: true,
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

vi.mock("@/lib/eventos", () => ({
  buscarEventoPorId: async () => eventoFalso,
}));

vi.mock("@/lib/sessao", () => ({
  sessaoDoEvento: async () => ({
    tipo: "casal",
    acesso: {
      id: "acesso-1",
      eventoId: EVENTO,
      tipo: "casal",
      rotulo: "Ana e Max",
      dono: false,
      expiraEm: null,
    },
  }),
}));

vi.mock("@/lib/observabilidade", () => ({
  registrarErro: async () => {},
  sanearMensagem: (v: unknown) => String(v),
}));

const contexto = {
  params: Promise.resolve({ id: EVENTO, fotoId: FOTO }),
};

beforeEach(() => {
  linhaDoTempo.length = 0;
  banco.viva = true;
  banco.quantas = 0;
  r2.recusa = false;
});

describe("apagar a foto: o objeto sai primeiro, a linha depois (RV-22)", () => {
  it("**quando a linha é marcada, o objeto JÁ saiu do balde**", async () => {
    const { DELETE } = await import("@/app/api/eventos/[id]/site/galeria/[fotoId]/route");

    const resposta = await DELETE(
      new Request(`https://casa-nos.invalid/api/eventos/${EVENTO}/site/galeria/${FOTO}`, {
        method: "DELETE",
      }),
      contexto
    );

    expect(resposta.status).toBe(204);

    const ordem = linhaDoTempo.map(m => `${m.quem}:${m.o_que}`);
    /**
     * A sequência inteira, e não só "o R2 veio antes": a busca precede o balde
     * (404 antes de tocar em objeto de outro casamento) e a marcação vem por
     * último. `apagou-com-linha-viva` é a asserção que importa — ela é escrita
     * pelo espião a partir do ESTADO do banco, não da posição da chamada.
     */
    expect(ordem).toEqual(["banco:buscar", "r2:apagou-com-linha-viva", "banco:marcar"]);
  });

  it("**o balde recusando: 502, e a linha continua viva**", async () => {
    r2.recusa = true;
    const { DELETE } = await import("@/app/api/eventos/[id]/site/galeria/[fotoId]/route");

    const resposta = await DELETE(
      new Request(`https://casa-nos.invalid/api/eventos/${EVENTO}/site/galeria/${FOTO}`, {
        method: "DELETE",
      }),
      contexto
    );

    /**
     * 502 e não 500: quem recusou foi o balde, e não este servidor. A distinção
     * importa para quem investiga — 500 manda olhar o código desta rota, e o
     * problema está a um `fetch` de distância.
     */
    expect(resposta.status).toBe(502);
    expect(
      banco.viva,
      "a linha foi marcada mesmo com o objeto de pé. É exatamente a mentira que a " +
        "confirmação de tirar o site do ar promete que não existe (RV-21)."
    ).toBe(true);
    expect(linhaDoTempo.map(m => m.quem)).toEqual(["banco", "r2"]);
  });

  it("uuid torto responde 404 sem consultar nada", async () => {
    const { DELETE } = await import("@/app/api/eventos/[id]/site/galeria/[fotoId]/route");

    const resposta = await DELETE(
      new Request("https://casa-nos.invalid/api/eventos/x/site/galeria/y", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "nao-e-uuid", fotoId: FOTO }) }
    );

    // `dados.md` §3: uuid torto estoura `22P02` no Postgres e vira 500 onde a
    // resposta certa é 404. O teste prova que **nada foi consultado**.
    expect(resposta.status).toBe(404);
    expect(linhaDoTempo).toEqual([]);
  });

  it("foto que já não existe responde 404, e o balde não é tocado", async () => {
    banco.viva = false;
    const { DELETE } = await import("@/app/api/eventos/[id]/site/galeria/[fotoId]/route");

    const resposta = await DELETE(
      new Request(`https://casa-nos.invalid/api/eventos/${EVENTO}/site/galeria/${FOTO}`, {
        method: "DELETE",
      }),
      contexto
    );

    expect(resposta.status).toBe(404);
    expect(linhaDoTempo.map(m => m.quem)).toEqual(["banco"]);
  });
});

describe("o teto de 12 é validado no servidor (RV-24)", () => {
  const corpoDaIntencao = JSON.stringify({ largura: 1600, altura: 1067, bytes_previa: 300000 });

  function pedidoDeIntencao() {
    return new Request(`https://casa-nos.invalid/api/eventos/${EVENTO}/site/galeria`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpoDaIntencao,
    });
  }

  it("**a 13ª responde 409, com quantas cabem e quantas já existem**", async () => {
    banco.quantas = 12;
    // As cinco variáveis, com os nomes que `.env.example` registra. Trocar um
    // nome aqui faria o teste medir o 503 achando que mede o 409 — foi o que
    // aconteceu na primeira escrita deste arquivo.
    vi.stubEnv("R2_ENDPOINT", "https://r2.exemplo");
    vi.stubEnv("R2_BUCKET", "casa-nos");
    vi.stubEnv("R2_ACCESS_KEY_ID", "chave");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "segredo");
    vi.stubEnv("R2_PUBLIC_BASE", "https://midia.exemplo");

    const { POST } = await import("@/app/api/eventos/[id]/site/galeria/route");
    const resposta = await POST(pedidoDeIntencao(), {
      params: Promise.resolve({ id: EVENTO }),
    });

    expect(resposta.status).toBe(409);

    const corpo = (await resposta.json()) as { erro: string; detalhe: { teto: number; quantas: number } };
    /**
     * **OS DOIS NÚMEROS NO CORPO**, e não um 400 genérico. Sem eles a tela
     * escreve "erro", e "erro" não vira a próxima ação de ninguém. Com eles ela
     * escreve quantas cabem e quantas já existem — que é a única informação
     * capaz de virar "apague uma".
     */
    expect(corpo.detalhe.teto).toBe(12);
    expect(corpo.detalhe.quantas).toBe(12);

    // **NENHUMA LINHA NASCEU.** Recusar depois de criar a intenção deixaria lixo
    // na tabela que nenhum cron limpa (a 0015 escreve a ausência com todas as
    // letras).
    expect(linhaDoTempo.map(m => m.o_que)).toEqual(["contar"]);

    vi.unstubAllEnvs();
  });

  it("**o teto é conferido DEPOIS do R2: sem balde, a resposta é 503**", async () => {
    /**
     * É O ESTADO DA PRODUÇÃO HOJE — as cinco variáveis não estão configuradas.
     * A ordem importa: sem balde não adianta contar, porque o envio não vai
     * acontecer de qualquer jeito, e a pessoa precisa da mensagem que diz que o
     * envio está indisponível, não de uma sobre o teto.
     */
    banco.quantas = 12;
    vi.unstubAllEnvs();

    const { POST } = await import("@/app/api/eventos/[id]/site/galeria/route");
    const resposta = await POST(pedidoDeIntencao(), {
      params: Promise.resolve({ id: EVENTO }),
    });

    expect(resposta.status).toBe(503);
    expect(linhaDoTempo, "contou fotos antes de saber se havia balde").toEqual([]);
  });
});
