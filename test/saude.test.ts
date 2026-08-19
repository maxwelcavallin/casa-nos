import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ROTAS_DE_API } from "@/lib/rotas";

/**
 * A ROTA DE SAÚDE (`GET /api/interno/saude`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELA EXISTE POR UM INCIDENTE COM NOME E NÚMERO: a `DATABASE_URL` ficou vazia
 * por **seis deploys**, e a plataforma mostrou READY nos seis. O `next build`
 * compila sem tocar no banco — o cliente Neon é preguiçoso justamente para isso
 * —, então o build passa, o deploy sobe, o painel fica verde, e toda página
 * responde 500 para quem abrir. **A saúde do build não é a saúde do produto.**
 *
 * O QUE ESTE ARQUIVO TRAVA:
 *   1. sem segredo, 401 — e nunca "passa porque a variável está vazia";
 *   2. banco de pé e evento resolvido → `{ ok: true, evento_resolvido: true }`;
 *   3. banco de pé e **nenhum evento** → `ok: true` e `evento_resolvido: false`
 *      (o estado que responde 404 a todo mundo com a plataforma dizendo READY);
 *   4. banco caído → **503**, nunca 200 com `ok: false`;
 *   5. a falha vira **linha em `eventos_de_erro`**, que é a tabela que uma
 *      pessoa lê. Um cron que falha em silêncio é o padrão, e foi o silêncio que
 *      deixou os seis deploys passarem;
 *   6. **ela está agendada.** Uma rota de saúde que ninguém chama é um arquivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const CAMINHO = "/api/interno/saude";
const SEGREDO = "s".repeat(32);

/** O que o `sql` falso vai responder. Trocado por teste. */
let responder: (texto: string) => Promise<Record<string, unknown>[]>;
const registrados: unknown[] = [];

vi.mock("@/lib/db", () => ({
  sql: (partes: TemplateStringsArray) => responder(partes.join(" ")),
}));

vi.mock("@/lib/observabilidade", () => ({
  registrarErro: async (registro: unknown) => {
    registrados.push(registro);
  },
  registrarErroDeCliente: async () => undefined,
}));

async function chamar(cabecalho: Record<string, string> = {}): Promise<Response> {
  const { GET } = await import("@/app/api/interno/saude/route");
  return GET(new Request(`https://casa-nos.invalid${CAMINHO}`, { headers: cabecalho }), {
    params: Promise.resolve({}),
  });
}

beforeEach(() => {
  registrados.length = 0;
  vi.stubEnv("CRON_SEGREDO", SEGREDO);
  responder = async texto =>
    /from eventos/.test(texto) ? [{ existe: 1 }] : [{ um: 1 }];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("o segredo", () => {
  it("sem cabeçalho, **401** — e o corpo não diz o que existe do outro lado", async () => {
    const resposta = await chamar();
    expect(resposta.status).toBe(401);
    const corpo = await resposta.json();
    expect(JSON.stringify(corpo)).not.toMatch(/evento|banco|database/i);
  });

  it("com o segredo errado, 401", async () => {
    expect((await chamar({ "x-cron-segredo": "x".repeat(32) })).status).toBe(401);
  });

  it("**sem `CRON_SEGREDO` configurado, nada passa**", async () => {
    /**
     * O lado seguro de errar. Uma rota interna que autentica comparando com uma
     * variável vazia fica **aberta** num ambiente novo — e ninguém percebe,
     * porque ela responde 200 exatamente como deveria.
     */
    vi.stubEnv("CRON_SEGREDO", "");
    expect((await chamar({ "x-cron-segredo": "" })).status).toBe(401);
    expect((await chamar({ "x-cron-segredo": SEGREDO })).status).toBe(401);
  });

  it("aceita as duas formas: cabeçalho próprio e `Authorization: Bearer`", async () => {
    // A Vercel manda a segunda. Uma rota que só aceitasse a primeira responderia
    // 401 todo dia no horário do cron, e ninguém olha o log de um cron que
    // "está configurado".
    expect((await chamar({ "x-cron-segredo": SEGREDO })).status).toBe(200);
    expect((await chamar({ authorization: `Bearer ${SEGREDO}` })).status).toBe(200);
  });
});

describe("o que ela responde", () => {
  it("banco de pé e evento resolvido", async () => {
    const resposta = await chamar({ "x-cron-segredo": SEGREDO });
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, evento_resolvido: true });
  });

  it("**banco de pé e nenhum evento** — `ok`, e `evento_resolvido: false`", async () => {
    /**
     * É o estado que o `select 1` sozinho não distingue: banco migrado e vazio,
     * ou apontado para um ambiente sem os eventos. A plataforma diz READY, esta
     * rota diz 200, e `/` responde 404 para todo mundo. Quem lê o relatório
     * precisa ver a diferença **no corpo**.
     */
    responder = async texto => (/from eventos/.test(texto) ? [] : [{ um: 1 }]);
    const resposta = await chamar({ "x-cron-segredo": SEGREDO });
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, evento_resolvido: false });
  });

  it("**banco caído → 503**, e nunca 200 com `ok: false`", async () => {
    responder = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    const resposta = await chamar({ "x-cron-segredo": SEGREDO });
    // Um 200 mentiroso atravessa qualquer monitor sem acender nada — que é o
    // defeito que esta rota existe para não repetir.
    expect(resposta.status).toBe(503);
    expect(await resposta.json()).toEqual({ ok: false, evento_resolvido: false });
  });

  it("**a falha vira linha em `eventos_de_erro`**", async () => {
    responder = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    await chamar({ "x-cron-segredo": SEGREDO });

    expect(registrados).toHaveLength(1);
    expect(registrados[0]).toMatchObject({
      origem: "servidor",
      rota: CAMINHO,
      tipoErro: "servidor",
      httpStatus: 503,
    });
  });

  it("a rota não escreve nada no banco", async () => {
    const consultas: string[] = [];
    responder = async texto => {
      consultas.push(texto);
      return /from eventos/.test(texto) ? [{ existe: 1 }] : [{ um: 1 }];
    };
    await chamar({ "x-cron-segredo": SEGREDO });

    expect(consultas.length).toBeGreaterThanOrEqual(2);
    for (const consulta of consultas) {
      expect(consulta, consulta).not.toMatch(/insert|update|delete|alter|drop/i);
    }
  });
});

describe("ela está declarada e agendada", () => {
  it("aparece em `lib/rotas.ts`, só com `GET`", () => {
    const rota = ROTAS_DE_API.find(r => r.caminho === CAMINHO);
    expect(rota).toBeTruthy();
    expect(Object.keys(rota!.metodos)).toEqual(["GET"]);
    // `publica` no sentido do middleware: ela não tem cookie a exigir. O guarda
    // de verdade é o segredo, conferido na rota.
    expect(rota!.publica).toBe(true);
  });

  it("**tem entrada no `vercel.json`** — rota de saúde que ninguém chama é um arquivo", () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ, "vercel.json"), "utf8"));
    const cron = (vercel.crons as Array<{ path: string; schedule: string }>).find(
      c => c.path === CAMINHO
    );
    expect(cron, "a rota de saúde não está agendada").toBeTruthy();

    /**
     * **`schedule` DA VERCEL É UTC** (`stack.md` §7). Brasília = UTC−3, e a
     * regra da casa manda rodar entre 12 e 20 UTC — horário comercial daqui — e
     * no máximo às 17h de Brasília, porque o plano Hobby tem uma janela de
     * tolerância de uma hora.
     *
     * E ela é **espaçada da reconciliação**: as duas na mesma hora disputam a
     * partida a frio e transformam duas leituras baratas numa janela ruim.
     */
    const [minuto, hora] = cron!.schedule.split(" ");
    expect(Number(hora)).toBeGreaterThanOrEqual(12);
    expect(Number(hora)).toBeLessThanOrEqual(20);
    expect(minuto).toMatch(/^\d+$/);

    const reconciliacao = (vercel.crons as Array<{ path: string; schedule: string }>).find(
      c => c.path === "/api/interno/reconciliacao"
    );
    expect(reconciliacao, "a reconciliação diária sumiu do agendamento").toBeTruthy();
    expect(cron!.schedule).not.toBe(reconciliacao!.schedule);
  });

  it("**o que ela NÃO pega está escrito no próprio arquivo**", () => {
    /**
     * Uma verificação que parece cobrir mais do que cobre é pior que nenhuma:
     * ela transfere a confiança sem transferir a garantia, e a próxima pessoa
     * para de olhar. Os limites moram no cabeçalho da rota, que é onde quem vai
     * confiar nela lê.
     */
    const fonte = fs.readFileSync(
      path.join(RAIZ, "app", "api", "interno", "saude", "route.ts"),
      "utf8"
    );
    for (const buraco of [/renderiza torta/i, /banco errado/i, /R2/, /Lentid/i]) {
      expect(buraco.test(fonte), `o limite ${buraco} saiu do cabeçalho da rota`).toBe(true);
    }
  });
});
