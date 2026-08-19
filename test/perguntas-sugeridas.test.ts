import { describe, expect, it } from "vitest";

import {
  criarPerguntasEmLote,
  jaHouvePergunta,
  MAXIMO_DE_PERGUNTAS,
  PERGUNTAS_SUGERIDAS,
  perguntasRespondidas,
  type Pergunta,
} from "@/lib/conteudo-do-site";
import type { Executor } from "@/lib/db";

/**
 * AS CINCO PERGUNTAS SUGERIDAS (v1.0, V-16).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O QUE TORNA A SUGESTÃO SEGURA NÃO É ESTA HISTÓRIA — É A V-09.** Pergunta sem
 * resposta não renderiza no site. Sem essa regra, aceitar a oferta e fechar o
 * painel publicaria cinco perguntas em branco no site do casamento, e a
 * "facilidade" teria criado um estrago que ninguém pediu.
 *
 * Por isso o primeiro teste deste arquivo não é sobre a oferta: é sobre as cinco
 * nascerem invisíveis. Se um dia alguém "melhorar" a sugestão preenchendo
 * respostas de exemplo, é aqui que quebra.
 *
 * **A SEGUNDA REGRA É A QUE MAIS FÁCIL SE PERDE:** a oferta não volta depois que
 * o casal apaga todas. Quem decide não querer as cinco decidiu uma vez; repetir
 * a oferta a cada visita é insistência. O mecanismo é uma ausência — a consulta
 * de `jaHouvePergunta` **não filtra `excluido_em`** —, e ausência é exatamente o
 * que a próxima pessoa "arruma" ao padronizar as consultas do arquivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ANA = "11111111-1111-4111-8111-111111111111";

describe("as cinco nascem invisíveis", () => {
  it("são cinco, e são as da persona", () => {
    expect(PERGUNTAS_SUGERIDAS).toEqual([
      "Qual é o traje?",
      "A que horas começa?",
      "Como faço para chegar?",
      "Tem estacionamento?",
      "Posso levar criança?",
    ]);
  });

  it("cabem no teto com folga — cinco de quinze", () => {
    expect(PERGUNTAS_SUGERIDAS.length).toBeLessThan(MAXIMO_DE_PERGUNTAS);
  });

  it("**nenhuma delas aparece no site enquanto não for respondida**", () => {
    const comoNascem: Pergunta[] = PERGUNTAS_SUGERIDAS.map((pergunta, i) => ({
      id: `id-${i}`,
      pergunta,
      resposta: null,
      ordem: i + 1,
    }));

    expect(perguntasRespondidas(comoNascem)).toEqual([]);

    // E a que for respondida aparece sozinha — sem arrastar as outras quatro.
    const comUma = comoNascem.map((p, i) => (i === 0 ? { ...p, resposta: "Esporte fino." } : p));
    expect(perguntasRespondidas(comUma)).toHaveLength(1);
  });
});

describe("a oferta não volta depois de recusada", () => {
  function execContando(quantas: number, registro: string[]): Executor {
    return (async (strings: TemplateStringsArray) => {
      registro.push(strings.join(" ? ").replace(/\s+/g, " "));
      return [{ quantas }];
    }) as unknown as Executor;
  }

  it("**a consulta não filtra `excluido_em`, e é isso que a faz funcionar**", async () => {
    const registro: string[] = [];
    await jaHouvePergunta(ANA, execContando(0, registro));

    expect(registro[0]).toMatch(/from evento_perguntas/);
    expect(
      registro[0],
      "A consulta passou a filtrar `excluido_em`. Com o filtro, apagar as cinco " +
        "devolve a oferta na mesma tela, e o casal que decidiu não as querer " +
        "precisa recusá-las de novo a cada visita."
    ).not.toMatch(/excluido_em/);
  });

  it("uma pergunta apagada ainda conta como 'já houve'", async () => {
    // A linha continua no banco com `excluido_em` preenchido: o `count(*)` sem
    // filtro a enxerga, e é assim que a oferta some para sempre.
    expect(await jaHouvePergunta(ANA, execContando(1, []))).toBe(true);
    expect(await jaHouvePergunta(ANA, execContando(0, []))).toBe(false);
  });
});

describe("as cinco entram numa instrução só", () => {
  it("ou entram as cinco, ou nenhuma — nada de cinco `insert` seguidos", async () => {
    const instrucoes: string[] = [];
    const exec = (async (strings: TemplateStringsArray, ...valores: unknown[]) => {
      instrucoes.push(strings.join(" ? ").replace(/\s+/g, " "));
      const perguntas = valores[1] as string[];
      return perguntas.map((pergunta, i) => ({
        id: `id-${i}`,
        pergunta,
        resposta: null,
        ordem: i + 1,
      }));
    }) as unknown as Executor;

    const criadas = await criarPerguntasEmLote(
      ANA,
      PERGUNTAS_SUGERIDAS.map((pergunta, i) => ({ pergunta, resposta: null, ordem: i + 1 })),
      exec
    );

    /**
     * O driver HTTP do Neon executa **uma instrução por requisição**, sem
     * transação abraçando o arquivo. Cinco `insert` que parassem no terceiro
     * deixariam o casal com duas perguntas, sem explicação — e com a oferta já
     * sumida, porque a seção passou a ter pergunta.
     */
    expect(instrucoes).toHaveLength(1);
    expect(instrucoes[0]).toMatch(/unnest/);
    expect(criadas).toHaveLength(5);
    expect(criadas.every(p => p.resposta === null)).toBe(true);
  });

  it("lista vazia não vira instrução nenhuma", async () => {
    const exec = (async () => {
      throw new Error("não devia consultar o banco");
    }) as unknown as Executor;
    expect(await criarPerguntasEmLote(ANA, [], exec)).toEqual([]);
  });
});
