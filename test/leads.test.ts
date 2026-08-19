import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import { mesDe, mesPrevistoValido, normalizarContato, registrarLead } from "@/lib/leads";
import { TEXTO_DA_PERMISSAO } from "@/lib/textos-do-loop";

/**
 * O LEAD QUE SOBREVIVE A 18 MESES (H-16).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO GUARDA, e por que cada coisa importa:
 *
 * 1. **`evento_id_origem` não pode faltar.** Sem ele, o número que decide se
 *    este negócio tem canal de aquisição sai zero por construção — o clique
 *    acontece na festa e o cadastro meses depois, sem cookie (`metricas.md`
 *    §14.6). E o loop não tem segunda festa.
 * 2. **O WhatsApp fica no banco e nunca no GA4** (RN-24).
 * 3. **O reenvio não vira segundo lead.** A folha reenvia quando a rede volta, e
 *    sem a chave única "9 pessoas deixaram contato" viraria 14 por retentativa —
 *    o número que mede o loop passaria a medir a rede do salão.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";
const PARTICIPACAO = "22222222-2222-4222-8222-222222222222";

function espiao(resposta: (texto: string) => Record<string, unknown>[]) {
  const consultas: Array<{ texto: string; valores: unknown[] }> = [];
  const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
    consultas.push({ texto, valores });
    return resposta(texto);
  }) as unknown as Executor;
  return { exec, consultas };
}

const NOVO = {
  eventoIdOrigem: EVENTO,
  participacaoId: PARTICIPACAO,
  contato: "5521900000000",
  nome: null,
  temData: true,
  mesPrevisto: "2027-04",
  ctaSuperficie: "confirmacao_envio" as const,
  permissaoTexto: TEXTO_DA_PERMISSAO,
};

describe("o contato, normalizado uma vez na fronteira", () => {
  it("aceita com DDI, com parênteses e com traço — e guarda só dígitos", () => {
    /**
     * O campo **não reformata enquanto a pessoa digita**: máscara ao vivo num
     * teclado de celular às 23h é a origem clássica de "faltam dígitos" em
     * número certo. A limpeza acontece aqui, uma vez.
     */
    expect(normalizarContato("+55 (21) 90000-0000")).toBe("5521900000000");
    expect(normalizarContato("21 90000 0000")).toBe("21900000000");
  });

  it("recusa o que não é telefone", () => {
    expect(normalizarContato("123")).toBeNull();
    expect(normalizarContato("")).toBeNull();
    expect(normalizarContato(null)).toBeNull();
    // Acima do teto do E.164: não é engano de digitação, é lixo.
    expect(normalizarContato("1".repeat(20))).toBeNull();
  });

  it("normalizar é o que faz a chave única funcionar", () => {
    // Sem isto, o mesmo número com e sem parênteses viraria dois leads — e o
    // índice único não teria como saber.
    expect(normalizarContato("(21) 90000-0000")).toBe(normalizarContato("21900000000"));
  });
});

describe("o mês previsto", () => {
  it("é `AAAA-MM` e daqui para a frente", () => {
    expect(mesPrevistoValido("2027-04", "2026-08")).toBe(true);
    expect(mesPrevistoValido("2026-08", "2026-08")).toBe(true);
    expect(mesPrevistoValido("2026-03", "2026-08")).toBe(false);
    expect(mesPrevistoValido("2026-13", "2026-08")).toBe(false);
    expect(mesPrevistoValido("abril", "2026-08")).toBe(false);
  });

  it("a comparação é TEXTUAL, e não passa por `Date`", () => {
    /**
     * `AAAA-MM` é ordenável como string, e passar por `Date` traria de volta a
     * armadilha da coluna `date`: `new Date("2027-08")` é meia-noite do dia 1 em
     * UTC, que é 21h do dia 31 de julho em Brasília. Aqui nem existe dia — é um
     * mês.
     */
    expect("2027-04" >= "2026-12").toBe(true);
    expect("2026-09" >= "2026-10").toBe(false);
  });

  it("`mesDe` corta o dia sem passar por `Date`", () => {
    expect(mesDe("2026-08-19")).toBe("2026-08");
  });
});

describe("a escrita", () => {
  it("grava `evento_id_origem`, o texto da permissão e a data", async () => {
    const { exec, consultas } = espiao(() => [
      { id: "99999999-9999-4999-8999-999999999999", criado_em: new Date() },
    ]);
    await registrarLead(NOVO, exec);
    const insercao = consultas[0];
    expect(insercao.texto).toMatch(/^insert into leads/);
    expect(insercao.texto).toMatch(/evento_id_origem/);
    expect(insercao.texto).toMatch(/permissao_em, permissao_texto/);
    expect(insercao.valores).toContain(EVENTO);
    expect(insercao.valores).toContain(TEXTO_DA_PERMISSAO);
  });

  it("o reenvio devolve o lead que já existe, e não cria um segundo", async () => {
    const { exec, consultas } = espiao(texto =>
      texto.startsWith("insert")
        ? []
        : [{ id: "99999999-9999-4999-8999-999999999999", criado_em: new Date() }]
    );
    const lead = await registrarLead(NOVO, exec);
    expect(lead.jaExistia).toBe(true);
    expect(consultas[0].texto).toMatch(/on conflict \(evento_id_origem, contato\)/);
  });
});

/* ------------------------------------------------------------------ *
 * As catracas
 * ------------------------------------------------------------------ */

const RAIZ = path.resolve(import.meta.dirname, "..");

function ler(...partes: string[]): string {
  return fs
    .readFileSync(path.join(RAIZ, ...partes), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("as catracas do loop", () => {
  it("**a rota de lead tira a origem da URL, nunca do corpo**", () => {
    /**
     * Vindo do corpo, a origem de um lead viraria algo que qualquer um escreve —
     * e o número que decide se este negócio tem canal de aquisição passaria a
     * ser preenchido pelo cliente. Vindo da URL, ele já passou por `ehUuid` e
     * por `autorizar`.
     */
    const rota = ler("app", "api", "eventos", "[id]", "leads", "route.ts");
    expect(rota).toMatch(/eventoIdOrigem: acesso\.evento\.id/);
    expect(rota).not.toMatch(/eventoIdOrigem:\s*bruto\./);
    expect(rota).not.toMatch(/evento_id_origem.*bruto/);
  });

  it("**o WhatsApp não sai para o GA4 em lugar nenhum**", () => {
    // O evento leva `has_date` e `expected_month`. Nada mais. PII no GA4 viola
    // os termos e pode zerar a propriedade — e um telefone é PII sem discussão.
    const folha = ler("components", "album", "FolhaDoCta.tsx");
    const enviarEvento = folha.slice(folha.indexOf("enviarEvento("));
    const chamada = enviarEvento.slice(0, enviarEvento.indexOf("});"));
    expect(chamada).not.toMatch(/contato/);
    expect(chamada).not.toMatch(/whatsapp/i);
    expect(chamada).toMatch(/has_date/);
    expect(chamada).toMatch(/expected_month/);
  });

  it("`cta_surface = feed` NÃO é emitido nesta fatia (H-16, R8)", () => {
    /**
     * O valor continua no dicionário e simplesmente não é emitido. Este teste
     * existe para que ninguém acrescente o CTA ao feed depois "porque o
     * dicionário permite" — o feed é a primeira tela que o convidado vê, antes
     * de ter enviado qualquer coisa, que é o caso exato que a regra proíbe.
     */
    const arquivos = ["components/album/RodapeDoLoop.tsx", "components/album/FolhaDoCta.tsx"];
    for (const relativo of arquivos) {
      const fonte = ler(...relativo.split("/"));
      expect(fonte, `${relativo} emite cta_surface = feed`).not.toMatch(
        /cta_surface:\s*"feed"/
      );
    }
    // E o feed não importa o rodapé do loop, em forma nenhuma.
    const feed = ler("components", "album", "AlbumDoConvidado.tsx");
    expect(feed).not.toMatch(/RodapeDoLoop|FolhaDoCta/);
  });

  it("o texto da permissão tem um dono só, e a rota confere contra ele", () => {
    // Se cada lado tivesse a própria cópia, uma edição de copy no componente
    // faria o banco continuar guardando a redação velha — em silêncio.
    const rota = ler("app", "api", "eventos", "[id]", "leads", "route.ts");
    expect(rota).toMatch(/bruto\.permissao_texto !== TEXTO_DA_PERMISSAO/);
    expect(rota).toMatch(/permissaoTexto: TEXTO_DA_PERMISSAO/);
  });
});
