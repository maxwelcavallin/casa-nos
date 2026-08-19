import { describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import { chavesDaMidia } from "@/lib/r2";
import type { ClienteDeObjetos } from "@/lib/r2-objetos";
import {
  expurgarExcluidas,
  perdaDoEvento,
  reconciliarParticipacao,
  recomputarContadores,
} from "@/lib/reconciliacao";

/**
 * RECONCILIAÇÃO — a rotina que torna "nenhuma foto se perde" verificável (H-15).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O ENVIO TEM DOIS PASSOS SEPARADOS POR UMA REDE RUIM: o `PUT` no R2 e o `POST`
 * de confirmação. **O segundo é o que falha**, porque acontece depois de o
 * aparelho ter gastado o uplink inteiro subindo o arquivo. Sem esta rotina, uma
 * foto que chegou ao balde e não conseguiu avisar é contada como perdida para
 * sempre — e a promessa central do produto seria falsa exatamente no caso que
 * ele existe para resolver.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";
const PARTICIPACAO = "22222222-2222-4222-8222-222222222222";
const MIDIA = "33333333-3333-4333-8333-333333333333";
const CLIENT_MEDIA = "44444444-4444-4444-8444-444444444444";

const CHAVES = chavesDaMidia(EVENTO, MIDIA, "image/jpeg", "feed");
const CHEGOU_EM = new Date("2027-08-22T23:14:00.000Z");

function clienteFalso(presentes: string[]) {
  const existentes = new Set(presentes);
  const cliente: ClienteDeObjetos = {
    async cabeca(chave) {
      return existentes.has(chave)
        ? { chave, tamanho: 1234, modificadoEm: CHEGOU_EM }
        : null;
    },
    async copiar() {
      return true;
    },
    async apagar(chave) {
      existentes.delete(chave);
      return true;
    },
    async listar() {
      return { objetos: [], proximo: null };
    },
    async purgarNaBorda() {
      return true;
    },
    async respondeNoPublico() {
      return false;
    },
  };
  return { cliente, existentes };
}

function banco(linhasPendentes: Array<Record<string, unknown>>) {
  const escritas: Array<{ texto: string; valores: unknown[] }> = [];
  let jaListou = false;
  const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
    if (/^select id, client_media_id/.test(texto)) {
      if (jaListou) return [];
      jaListou = true;
      return linhasPendentes;
    }
    escritas.push({ texto, valores });
    return [];
  }) as unknown as Executor;
  return { exec, escritas };
}

const PENDENTE = {
  id: MIDIA,
  client_media_id: CLIENT_MEDIA,
  tipo_arquivo: "image/jpeg",
  visibilidade: "feed",
  previa_armazenada_em: null,
  original_armazenada_em: null,
};

describe("adoção — os bytes chegaram e a confirmação se perdeu", () => {
  it("adota a prévia quando o objeto existe, com a data DO OBJETO", async () => {
    /**
     * A data é a do objeto, e não `now()`. Se a foto chegou às 22h14 e a adoção
     * acontece às 12h do dia seguinte, carimbar `now()` jogaria a foto para o
     * topo do feed no dia seguinte à festa (RN-16) — e mataria a curva de
     * chegada por hora, que é como se descobre quando a rede do salão caiu.
     */
    const { cliente } = clienteFalso([CHAVES.previa]);
    const { exec, escritas } = banco([PENDENTE]);

    const saida = await reconciliarParticipacao(EVENTO, PARTICIPACAO, [], { cliente, exec });

    expect(saida.adocoes).toHaveLength(1);
    expect(saida.adocoes[0].faixas).toEqual(["previa"]);
    const carimbo = escritas.find(e => e.texto.includes("previa_armazenada_em ="));
    expect(carimbo?.valores).toContain(CHEGOU_EM.toISOString());
  });

  it("**toda adoção vira registro, com o `client_media_id`**", async () => {
    /**
     * Uma adoção significa que **uma confirmação se perdeu** — informação sobre
     * a rede do salão, não rotina silenciosa. É dela que sai o alerta de "mais
     * de 5 adoções numa passada".
     */
    const { cliente } = clienteFalso([CHAVES.previa]);
    const { exec, escritas } = banco([PENDENTE]);
    await reconciliarParticipacao(EVENTO, PARTICIPACAO, [], { cliente, exec });

    const registro = escritas.find(e => e.texto.startsWith("insert into eventos_de_erro"));
    expect(registro).toBeDefined();
    expect(registro?.valores.some(v => String(v).includes(CLIENT_MEDIA))).toBe(true);
  });

  it("é IDEMPOTENTE: a cláusula exige o carimbo vazio", async () => {
    const { cliente } = clienteFalso([CHAVES.previa]);
    const { exec, escritas } = banco([PENDENTE]);
    await reconciliarParticipacao(EVENTO, PARTICIPACAO, [], { cliente, exec });
    const carimbo = escritas.find(e => e.texto.includes("previa_armazenada_em ="));
    expect(carimbo?.texto).toMatch(/previa_armazenada_em is null/);
  });

  it("a consulta é limitada à PRÓPRIA participação", async () => {
    /**
     * Sem `participacao_id` na cláusula, um convidado dispararia `HEAD` no balde
     * inteiro do casamento a cada abertura de tela — 6.000 requisições ao R2 por
     * toque.
     */
    const consultas: string[] = [];
    const exec = (async (partes: TemplateStringsArray) => {
      consultas.push(partes.join(" ? ").replace(/\s+/g, " ").trim());
      return [];
    }) as unknown as Executor;
    const { cliente } = clienteFalso([]);
    await reconciliarParticipacao(EVENTO, PARTICIPACAO, [], { cliente, exec });
    expect(consultas[0]).toMatch(/participacao_id = \?/);
  });

  it("original presente e prévia ausente vira MARCA, e não perda", async () => {
    /**
     * Caso B8: o navegador não conseguiu gerar a miniatura (HEIC exótico,
     * memória de aparelho antigo). Os bytes **estão** no balde — contar isso
     * como perda seria a leitura errada. A geração no servidor não está
     * implementada e a ausência é declarada em `lib/reconciliacao.ts`; o que
     * existe é a marca, que aparece no painel como qualidade degradada.
     */
    const { cliente } = clienteFalso([CHAVES.original]);
    const { exec, escritas } = banco([PENDENTE]);
    const saida = await reconciliarParticipacao(EVENTO, PARTICIPACAO, [], { cliente, exec });

    expect(saida.previaPendenteServidor).toBe(1);
    expect(escritas.some(e => e.texto.includes("previa_pendente_servidor = true"))).toBe(true);
  });

  it("sem R2 configurado, a rotina não faz nada e não estoura", async () => {
    const saida = await reconciliarParticipacao(EVENTO, PARTICIPACAO, [], { cliente: null });
    expect(saida.adocoes).toEqual([]);
  });
});

describe("o agregado, recomputado da verdade", () => {
  it("grava a divergência entre o contador e a contagem real", async () => {
    /**
     * Agregado sem recomputação vira número errado permanente. O número errado
     * que é rápido não levanta suspeita de ninguém — e este produto tem regra
     * explícita de nunca mostrar ao casal número menor que a realidade.
     */
    const escritas: Array<{ texto: string; valores: unknown[] }> = [];
    const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
      if (texto.startsWith("select count(*) filter")) {
        return [
          { armazenadas: 1842, originais_pendentes: 231, intencao: 3, bytes_total: "99999" },
        ];
      }
      if (texto.startsWith("select midias_armazenadas")) {
        return [{ midias_armazenadas: 1840 }];
      }
      escritas.push({ texto, valores });
      return [];
    }) as unknown as Executor;

    const saida = await recomputarContadores(EVENTO, exec);
    expect(saida.armazenadas).toBe(1842);
    expect(saida.divergencia).toBe(2);
    // `bigint` chega como STRING do driver: sem conversão, `bytes_total` seria
    // concatenado num agregado e o painel mostraria um número absurdo.
    expect(typeof saida.bytesTotal).toBe("number");
    expect(escritas[0].valores).toContain(2);
  });
});

describe("o expurgo dos 30 dias", () => {
  it("apaga os objetos dos DOIS prefixos e carimba a linha", async () => {
    /**
     * Uma foto que já foi `feed` e virou `noivos` pode ter deixado resto no
     * outro prefixo, e o dia do expurgo é o último em que alguém olha para ela.
     * A LINHA não é apagada: ela continua carregando `client_media_id`, que é o
     * que impede a mesma foto de ser reenviada e recontada.
     */
    const { cliente, existentes } = clienteFalso([
      CHAVES.previa,
      chavesDaMidia(EVENTO, MIDIA, "image/jpeg", "noivos").previa,
    ]);
    const escritas: string[] = [];
    const exec = (async (partes: TemplateStringsArray) => {
      const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
      if (texto.startsWith("select id, tipo_arquivo")) {
        return [{ id: MIDIA, tipo_arquivo: "image/jpeg", visibilidade: "noivos" }];
      }
      escritas.push(texto);
      return [];
    }) as unknown as Executor;

    const saida = await expurgarExcluidas(EVENTO, { cliente, exec });
    expect(saida.expurgadas).toBe(1);
    expect(existentes.size).toBe(0);
    expect(escritas.some(t => t.includes("objeto_expurgado_em = now()"))).toBe(true);
    expect(escritas.some(t => /\bdelete from midias\b/.test(t))).toBe(false);
  });
});

describe("o veredito", () => {
  it("perda e originais pendentes vêm em CAMPOS SEPARADOS", async () => {
    /**
     * Somá-las produziria um número que não significa nada; mostrar só a segunda
     * esconderia a única que importa. `previasPerdidas` é o bloqueio 1, e o
     * valor esperado é **zero**.
     */
    const exec = (async () => [
      { previas_perdidas: 0, originais_pendentes: 231 },
    ]) as unknown as Executor;
    const perda = await perdaDoEvento(EVENTO, exec);
    expect(perda.previasPerdidas).toBe(0);
    expect(perda.originaisPendentes).toBe(231);
  });

  it("a consulta lê as duas views da migration 0008", async () => {
    const consultas: string[] = [];
    const exec = (async (partes: TemplateStringsArray) => {
      consultas.push(partes.join(" ? ").replace(/\s+/g, " ").trim());
      return [{ previas_perdidas: 0, originais_pendentes: 0 }];
    }) as unknown as Executor;
    await perdaDoEvento(EVENTO, exec);
    expect(consultas[0]).toMatch(/vw_perda_evento/);
    expect(consultas[0]).toMatch(/vw_originais_pendentes/);
  });
});
