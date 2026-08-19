import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A INTENÇÃO PRECEDE OS BYTES. É o teste que sustenta o critério de término
 * desta fatia.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ELE EXISTE, e por que ler o código não substituiria:
 *
 * "Nenhuma mídia perdida" é medido por uma consulta: intenções sem
 * `previa_armazenada_em` até D+7 (RN-14). Se a linha de intenção nascesse
 * **depois** do upload, essa consulta compararia as fotos que chegaram com as
 * fotos que chegaram — daria **zero perda sempre**, inclusive na noite em que
 * metade das fotos ficou no celular de alguém. O critério de término da fatia
 * passaria, e o produto teria falhado.
 *
 * A ordem certa é fácil de escrever e fácil de inverter numa refatoração de
 * dois minutos ("vamos assinar antes, fica mais rápido"). Por isso ela é um
 * teste, e não um comentário.
 *
 * O QUE ESTE ARQUIVO PROVA, em três afirmações:
 *
 *  1. Quando o assinador é chamado, a linha JÁ EXISTE no banco, com estado
 *     `intencao`. Não é "a chamada A vem antes da B no arquivo": é o estado do
 *     banco observado de dentro do assinador.
 *  2. Se a assinatura FALHAR, a linha PERMANECE. É exatamente ela que a
 *     reconciliação (H-15) vai procurar. O aparelho não recebe URL, não sobe
 *     nada, e a foto aparece como perdida — que é a verdade — em vez de não
 *     existir para ninguém.
 *  3. Repetir o mesmo lote não cria linha nova e responde 200 (RN-27), com URLs
 *     renovadas. É o que a fila faz depois de dormir uma noite.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";
const PARTICIPACAO = "22222222-2222-4222-8222-222222222222";
const CLIENTE_A = "33333333-3333-4333-8333-333333333333";
const LOTE = "44444444-4444-4444-8444-444444444444";

/* ------------------------------------------------------------------ *
 * Um banco falso que entende as três instruções de `registrarIntencao`
 * ------------------------------------------------------------------ */

type Linha = Record<string, unknown>;

const banco = {
  midias: [] as Linha[],
  contadores: new Map<string, number>(),
  instrucoes: [] as string[],
};

function ehArray(valor: unknown): valor is unknown[] {
  return Array.isArray(valor);
}

const execFalso = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
  const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
  banco.instrucoes.push(texto);

  if (/count\(\*\)::int as total from midias/.test(texto)) {
    return [{ total: banco.midias.length }];
  }

  if (/^insert into midias|with inseridas as \( insert into midias/.test(texto)) {
    const arrays = valores.filter(ehArray) as unknown[][];
    const escalares = valores.filter(v => !ehArray(v));
    const [lotes, clientes, hashes, visibilidades, origens, tipos, bytes, offline] = arrays;
    const [eventoId, participacaoId, aprovacao] = escalares as string[];

    for (let i = 0; i < clientes.length; i++) {
      const clienteId = String(clientes[i]);
      // `on conflict do nothing`: o índice único (evento_id, client_media_id) é
      // quem decide. Duas requisições simultâneas produzem UMA linha.
      const jaTem = banco.midias.some(
        m => m.evento_id === eventoId && m.client_media_id === clienteId
      );
      if (jaTem) continue;

      banco.midias.push({
        id: `aaaa${banco.midias.length}-1111-4111-8111-111111111111`,
        evento_id: eventoId,
        participacao_id: participacaoId,
        lote_id: String(lotes[i]),
        client_media_id: clienteId,
        hash_conteudo: hashes[i] || null,
        estado: "intencao",
        visibilidade: String(visibilidades[i]),
        aprovacao,
        origem: origens[i] || null,
        tipo_arquivo: tipos[i] || null,
        bytes: bytes[i],
        enfileirada_offline: offline[i],
        previa_armazenada_em: null,
        original_armazenada_em: null,
        criada_em: new Date(),
        excluida_em: null,
      });
      banco.contadores.set(eventoId, (banco.contadores.get(eventoId) ?? 0) + 1);
    }
    return [];
  }

  if (/select \* from midias/.test(texto)) {
    const listas = valores.filter(ehArray) as unknown[][];
    const clientes = (listas[0] ?? []).map(String);
    const hashes = (listas[1] ?? []).map(String);
    return banco.midias.filter(
      m =>
        m.evento_id === valores[0] &&
        (clientes.includes(String(m.client_media_id)) ||
          (m.hash_conteudo !== null && hashes.includes(String(m.hash_conteudo))))
    );
  }

  if (/update participacoes/.test(texto)) return [];

  throw new Error(`instrucao nao prevista no banco falso: ${texto}`);
}) as unknown as import("@/lib/db").Executor;

/* ------------------------------------------------------------------ *
 * O que o teste substitui, e o que ele NÃO substitui
 *
 * Substitui: banco, sessão, evento e o assinador do R2. Tudo o que fala com o
 * mundo. NÃO substitui `lib/midias.ts`, que é o código sob teste, nem a rota,
 * que é onde a ordem vive.
 * ------------------------------------------------------------------ */

vi.mock("@/lib/db", () => ({ sql: execFalso }));

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
  // A FLAG LIGADA NO FIXTURE (v1.0, V-01). A `0014` desligou o álbum em
  // produção; os testes da Fatia 1 continuam sendo a prova de que ele funciona
  // no dia em que voltar, e por isso eles rodam com ela ligada. Desligar o
  // guarda para fazer teste passar seria apagar essa prova.
  albumAtivo: true,
  modoModeracao: "direto" as const,
  // Janela aberta: 2026 até 2028. A conferência da janela tem teste próprio.
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
    tipo: "convidado",
    participacao: {
      id: PARTICIPACAO,
      eventoId: EVENTO,
      papel: "convidado",
      convidadoId: null,
      rotulo: null,
      modoIdentificacao: null,
      faixaLenta: false,
      primeiroAcessoEm: null,
    },
  }),
  participacaoDaSessao: (sessao: { tipo: string; participacao?: unknown }) =>
    sessao.tipo === "convidado" ? sessao.participacao : null,
}));

vi.mock("@/lib/observabilidade", () => ({
  registrarErro: async () => {},
  sanearMensagem: (v: unknown) => String(v),
}));

/**
 * O ASSINADOR ESPIÃO. Ele observa o BANCO no instante em que é chamado — é daí
 * que sai a prova. Um espião que só contasse chamadas provaria que as duas
 * funções foram chamadas, não que a linha existia.
 */
const estadoNoMomentoDaAssinatura: Array<{ midiaId: string; existiaNoBanco: boolean; estado: unknown }> =
  [];
let assinaturaEstoura = false;

vi.mock("@/lib/r2", async () => {
  const real = await vi.importActual<typeof import("@/lib/r2")>("@/lib/r2");
  return {
    ...real,
    configuracaoR2: () => ({
      contaOuEndpoint: "https://exemplo.r2.cloudflarestorage.com",
      balde: "casa-nos",
      chaveDeAcesso: "chave-de-teste",
      segredo: "segredo-de-teste",
    }),
    assinarFaixas: async (
      _configuracao: unknown,
      eventoId: string,
      midiaId: string
    ) => {
      const linha = banco.midias.find(m => m.id === midiaId && m.evento_id === eventoId);
      estadoNoMomentoDaAssinatura.push({
        midiaId,
        existiaNoBanco: linha !== undefined,
        estado: linha?.estado,
      });
      if (assinaturaEstoura) throw new Error("R2 fora do ar");
      return {
        miniatura: `https://exemplo/${midiaId}/t.jpg?assinada`,
        previa: `https://exemplo/${midiaId}/p.jpg?assinada`,
        original: `https://exemplo/${midiaId}/o.jpg?assinada`,
      };
    },
  };
});

const { POST } = await import("@/app/api/eventos/[id]/midias/intencao/route");

function pedidoDeIntencao(clientMediaId = CLIENTE_A) {
  return new Request("https://casa-nos.test/api/eventos/x/midias/intencao", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lote_id: LOTE,
      itens: [
        {
          client_media_id: clientMediaId,
          lote_id: LOTE,
          bytes: 4_200_000,
          tipo_arquivo: "image/jpeg",
          hash_conteudo: "a".repeat(64),
          visibilidade: "feed",
          origem: "galeria",
          enfileirada_offline: false,
        },
      ],
    }),
  });
}

const contexto = { params: Promise.resolve({ id: EVENTO }) };

beforeEach(() => {
  banco.midias = [];
  banco.contadores.clear();
  banco.instrucoes = [];
  estadoNoMomentoDaAssinatura.length = 0;
  assinaturaEstoura = false;
});

describe("a intenção precede os bytes", () => {
  it("quando a URL é assinada, a linha de intenção JÁ EXISTE no banco", async () => {
    const resposta = await POST(pedidoDeIntencao(), contexto);
    expect(resposta.status).toBe(200);

    expect(
      estadoNoMomentoDaAssinatura,
      "o assinador nem foi chamado — o teste não observou nada"
    ).toHaveLength(1);

    expect(
      estadoNoMomentoDaAssinatura[0].existiaNoBanco,
      "a URL foi assinada para uma mídia que ainda não existia no banco. " +
        "Isso permite objeto no R2 sem linha no banco, e faz a consulta de perda medir zero sempre."
    ).toBe(true);

    expect(estadoNoMomentoDaAssinatura[0].estado).toBe("intencao");
  });

  it("a chave assinada carrega o id que só existe depois da linha", async () => {
    await POST(pedidoDeIntencao(), contexto);
    const [linha] = banco.midias;
    expect(estadoNoMomentoDaAssinatura[0].midiaId).toBe(linha.id);
  });

  it("se a assinatura falhar, a linha de intenção PERMANECE", async () => {
    assinaturaEstoura = true;
    const resposta = await POST(pedidoDeIntencao(), contexto);

    // O invólucro de rota transforma a exceção em 500 com o formato único.
    expect(resposta.status).toBe(500);
    const corpo = (await resposta.json()) as { erro: string };
    expect(corpo.erro).toBeTruthy();

    expect(
      banco.midias,
      "a linha sumiu junto com a falha de assinatura. É exatamente ela que a " +
        "reconciliação procura: sem ela, a foto não existe para ninguém e a perda mede zero."
    ).toHaveLength(1);
    expect(banco.midias[0].estado).toBe("intencao");
    expect(banco.midias[0].previa_armazenada_em).toBeNull();
  });

  it("repetir o mesmo lote devolve 200 e UMA linha, com URLs novas (RN-27)", async () => {
    await POST(pedidoDeIntencao(), contexto);
    const primeira = banco.midias[0].id;

    const segunda = await POST(pedidoDeIntencao(), contexto);
    expect(segunda.status).toBe(200);

    expect(banco.midias, "a repetição criou linha nova").toHaveLength(1);
    expect(banco.midias[0].id).toBe(primeira);

    const corpo = (await segunda.json()) as {
      itens: Array<{ ja_existia: boolean; urls: Record<string, string> }>;
    };
    expect(corpo.itens[0].ja_existia).toBe(true);
    expect(corpo.itens[0].urls.previa).toContain("assinada");
  });

  it("vídeo é 422 com mensagem própria, e nenhuma linha é criada", async () => {
    const pedido = new Request("https://casa-nos.test/api/eventos/x/midias/intencao", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lote_id: LOTE,
        itens: [
          {
            client_media_id: CLIENTE_A,
            lote_id: LOTE,
            bytes: 90_000_000,
            tipo_arquivo: "video/mp4",
            hash_conteudo: null,
            visibilidade: "feed",
            origem: "galeria",
            enfileirada_offline: false,
          },
        ],
      }),
    });

    const resposta = await POST(pedido, contexto);
    expect(resposta.status).toBe(422);
    expect((await resposta.json()).erro).toBe("tipo nao suportado");
    expect(banco.midias).toHaveLength(0);
  });

  it("visibilidade fora dos DOIS valores é 400, e não chega ao banco (RN-03)", async () => {
    const pedido = new Request("https://casa-nos.test/api/eventos/x/midias/intencao", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lote_id: LOTE,
        itens: [
          {
            client_media_id: CLIENTE_A,
            lote_id: LOTE,
            bytes: 1000,
            tipo_arquivo: "image/jpeg",
            hash_conteudo: null,
            // O valor que morreu na §3.1 V1 do PRD. Ele não pode voltar por
            // uma requisição, porque a dimensão do GA4 e o CHECK do Postgres
            // precisam ser a mesma palavra.
            visibilidade: "ambos",
            origem: "galeria",
            enfileirada_offline: false,
          },
        ],
      }),
    });

    const resposta = await POST(pedido, contexto);
    expect(resposta.status).toBe(400);
    expect(banco.midias).toHaveLength(0);
  });

  it("id malformado na URL é 404, nunca 500", async () => {
    const resposta = await POST(pedidoDeIntencao(), {
      params: Promise.resolve({ id: "nao-e-uuid" }),
    });
    expect(resposta.status).toBe(404);
  });
});
