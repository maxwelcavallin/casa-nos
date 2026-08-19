import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAXIMO_DE_PERGUNTAS, PERGUNTAS_SUGERIDAS } from "@/lib/conteudo-do-site";

/**
 * O LOTE DAS CINCO, NA ROTA (v1.0, V-16).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **POR QUE O LOTE É UMA FORMA DE CORPO E NÃO UMA ROTA NOVA:** o PRD especifica
 * `POST /…/perguntas`, e uma rota a mais custaria entrada em `lib/rotas.ts`, no
 * contrato, na matriz de autorização e nas três varreduras — tudo isso para o
 * mesmo verbo, no mesmo recurso, com a mesma permissão.
 *
 * **O QUE ESTE ARQUIVO SEGURA É O TETO, e ele é diferente do teto de uma
 * pergunta só:** com 12 perguntas gravadas, aceitar o lote de cinco deixaria 17
 * numa seção cujo limite é 15. A conferência precisa ser contra o **tamanho do
 * lote**, e não contra "já chegou no teto?" — e a diferença só aparece com o
 * banco quase cheio, que é onde ninguém testa à mão.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";

const banco = { quantas: 0 };
const inseridos: unknown[][] = [];

const execFalso = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
  const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();

  if (/count\(\*\)::int as quantas/.test(texto)) return [{ quantas: banco.quantas }];

  if (/insert into evento_perguntas/.test(texto)) {
    inseridos.push(valores);
    const perguntas = valores[1] as string[];
    const respostas = valores[2] as string[];
    return perguntas.map((pergunta, i) => ({
      id: `id-${i}`,
      pergunta,
      resposta: respostas[i] === "" ? null : respostas[i],
      ordem: (valores[3] as number[])[i],
    }));
  }

  throw new Error(`Consulta não prevista: ${texto}`);
}) as unknown as never;

/**
 * A fábrica é içada para o topo do arquivo, então ela não pode CITAR `execFalso`
 * — só chamá-lo, mais tarde, quando o módulo já existe. É o mesmo motivo pelo
 * qual `eventoFalso` aparece dentro de uma função nas fábricas abaixo.
 */
vi.mock("@/lib/db", () => ({
  sql: (...argumentos: unknown[]) =>
    (execFalso as unknown as (...a: unknown[]) => unknown)(...argumentos),
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

vi.mock("@/lib/eventos", () => ({ buscarEventoPorId: async () => eventoFalso }));

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

const contexto = { params: Promise.resolve({ id: EVENTO }) };

function pedidoCom(corpo: unknown): Request {
  return new Request(`https://casa-nos.invalid/api/eventos/${EVENTO}/site/perguntas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

const AS_CINCO = PERGUNTAS_SUGERIDAS.map(pergunta => ({ pergunta, resposta: null }));

beforeEach(() => {
  banco.quantas = 0;
  inseridos.length = 0;
});

describe("as cinco numa requisição só", () => {
  it("cria as cinco sem resposta, e devolve 201 com elas", async () => {
    const { POST } = await import("@/app/api/eventos/[id]/site/perguntas/route");

    const resposta = await POST(pedidoCom({ perguntas: AS_CINCO }), contexto);
    expect(resposta.status).toBe(201);

    const corpo = (await resposta.json()) as { perguntas: { pergunta: string; resposta: null }[] };
    expect(corpo.perguntas.map(p => p.pergunta)).toEqual([...PERGUNTAS_SUGERIDAS]);
    expect(corpo.perguntas.every(p => p.resposta === null)).toBe(true);

    // Uma instrução de escrita, e só uma: ou entram as cinco, ou nenhuma.
    expect(inseridos).toHaveLength(1);
  });

  it("a ordem continua de onde a lista estava — e não recomeça do 1", async () => {
    banco.quantas = 2;
    const { POST } = await import("@/app/api/eventos/[id]/site/perguntas/route");

    const resposta = await POST(pedidoCom({ perguntas: AS_CINCO }), contexto);
    expect(resposta.status).toBe(201);
    expect(inseridos[0][3]).toEqual([3, 4, 5, 6, 7]);
  });
});

describe("o teto é conferido contra o lote inteiro", () => {
  it("**com 12 gravadas, o lote de cinco é recusado com 409 — e nada é inserido**", async () => {
    banco.quantas = MAXIMO_DE_PERGUNTAS - 3;
    const { POST } = await import("@/app/api/eventos/[id]/site/perguntas/route");

    const resposta = await POST(pedidoCom({ perguntas: AS_CINCO }), contexto);

    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as { detalhe: { teto: number; quantas: number } };
    // Os dois números no corpo: um 409 sem número vira "erro" na tela, e "erro"
    // não vira ação nenhuma.
    expect(corpo.detalhe.teto).toBe(MAXIMO_DE_PERGUNTAS);
    expect(corpo.detalhe.quantas).toBe(MAXIMO_DE_PERGUNTAS - 3);
    expect(inseridos).toEqual([]);
  });

  it("cabendo exatamente, entra", async () => {
    banco.quantas = MAXIMO_DE_PERGUNTAS - 5;
    const { POST } = await import("@/app/api/eventos/[id]/site/perguntas/route");

    expect((await POST(pedidoCom({ perguntas: AS_CINCO }), contexto)).status).toBe(201);
  });
});

describe("o item ruim do lote diz qual item é", () => {
  it("o erro nomeia a posição, e nenhuma das outras é gravada", async () => {
    const { POST } = await import("@/app/api/eventos/[id]/site/perguntas/route");

    const resposta = await POST(
      pedidoCom({ perguntas: [{ pergunta: "Qual é o traje?" }, { pergunta: "   " }] }),
      contexto
    );

    expect(resposta.status).toBe(400);
    const corpo = (await resposta.json()) as {
      detalhe: { campos: { campo: string }[] };
    };
    /**
     * Sem o índice, cinco itens produzem cinco mensagens sobre "pergunta" e
     * nenhuma diz qual delas — e a pessoa não tem como consertar o que não sabe
     * onde está.
     */
    expect(corpo.detalhe.campos[0].campo).toBe("perguntas[1].pergunta");
    expect(inseridos).toEqual([]);
  });
});
