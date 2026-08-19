import { describe, expect, it } from "vitest";

import { dataCurtaPorExtenso, partesLocais } from "@/lib/datas";
import { diasDesdeOEvento } from "@/lib/medida-do-dia";

/**
 * DIA E FUSO — e este arquivo roda com `TZ=UTC`, que é como a Vercel roda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO BUG DE DATA DESTE PRODUTO SÓ EXISTE EM UTC. A máquina de quem desenvolve
 * roda em Brasília, e ali a conta erra sozinha para o lado certo — o defeito
 * aparece só depois do deploy, entre 21h e meia-noite, que é exatamente o
 * horário da festa.
 *
 * O que está em jogo aqui: `days_since_event`, que decide a permanência (S2) no
 * GA4, e a frase *"As fotos abrem em 21 de agosto"*, que é a primeira coisa que
 * um convidado que chegou cedo lê.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = { dataEvento: "2027-08-22", fuso: "America/Sao_Paulo" };

describe("days_since_event", () => {
  it("a véspera é −1, e não 0", () => {
    // O parâmetro "pode ser negativo" (`metricas.md` §7.2). Chegar na véspera é
    // o comportamento que o produto quer, e ele precisa aparecer como tal.
    const vespera = new Date("2027-08-21T15:00:00.000Z"); // 12h em Brasília
    expect(diasDesdeOEvento(EVENTO, vespera)).toBe(-1);
  });

  it("o dia do casamento é 0 desde a meia-noite LOCAL", () => {
    // 00:30 em Brasília do dia 22 = 03:30 UTC do dia 22.
    expect(diasDesdeOEvento(EVENTO, new Date("2027-08-22T03:30:00.000Z"))).toBe(0);
    // 23:00 em Brasília do dia 22 = 02:00 UTC do dia 23. Continua sendo dia 0.
    expect(diasDesdeOEvento(EVENTO, new Date("2027-08-23T02:00:00.000Z"))).toBe(0);
  });

  it("a virada do dia é a de BRASÍLIA, e não a de UTC", () => {
    /**
     * ESTE É O TESTE QUE PEGA O DEFEITO. Às 22h de Brasília do dia 22, já é dia
     * 23 em UTC. Uma conta feita sobre `new Date(dataEvento)` — meia-noite em
     * UTC — devolveria **1** ali, e a festa inteira seria contada como "o dia
     * seguinte" a partir das 21h.
     */
    const vinteEDuasDaNoite = new Date("2027-08-23T01:00:00.000Z");
    expect(vinteEDuasDaNoite.getUTCDate()).toBe(23); // já virou em UTC
    expect(diasDesdeOEvento(EVENTO, vinteEDuasDaNoite)).toBe(0); // não virou aqui
  });

  it("D+30 é 30 — o limiar da permanência do casal", () => {
    expect(diasDesdeOEvento(EVENTO, new Date("2027-09-21T15:00:00.000Z"))).toBe(30);
  });

  it("um evento noutro fuso usa o fuso dele", () => {
    // Hoje todo evento é em São Paulo; o dia em que um não for, a conta dele não
    // pode seguir o horário de Brasília.
    const emFernandoDeNoronha = { dataEvento: "2027-08-22", fuso: "America/Noronha" };
    expect(diasDesdeOEvento(emFernandoDeNoronha, new Date("2027-08-22T03:00:00.000Z"))).toBe(0);
  });
});

describe("as frases da janela", () => {
  it("`21 de agosto`, sem o ano", () => {
    // A forma curta do `gtm.md`. Ela é lida a poucos dias do evento, e o ano ali
    // seria ruído. A forma com ano continua sendo `dataPorExtenso`.
    expect(dataCurtaPorExtenso("2027-08-21")).toBe("21 de agosto");
    expect(dataCurtaPorExtenso("2027-12-31")).toBe("31 de dezembro");
  });

  it("meia-noite devolve hora nula — a frase curta é escolhida por DADO", () => {
    /**
     * *"As fotos abrem em 21 de agosto."* contra *"...às 18:00."*: a escolha sai
     * do dado, e não de um `if` que alguém escreveu olhando o evento cobaia. Um
     * casal que abrir a janela às 18h precisa ver o horário; um que deixar o
     * padrão não pode ver "às 00:00", que soa como detalhe técnico vazando.
     */
    // 21/08 00:00 em Brasília = 21/08 03:00 UTC.
    const meiaNoite = new Date("2027-08-21T03:00:00.000Z");
    expect(partesLocais(meiaNoite, "America/Sao_Paulo")).toEqual({
      dia: "2027-08-21",
      hora: null,
    });
  });

  it("hora configurada volta como hora, no fuso do evento", () => {
    // 21/08 18:00 em Brasília = 21/08 21:00 UTC.
    const seisDaTarde = new Date("2027-08-21T21:00:00.000Z");
    expect(partesLocais(seisDaTarde, "America/Sao_Paulo")).toEqual({
      dia: "2027-08-21",
      hora: "18:00",
    });
  });

  it("o dia local NÃO é o dia em UTC depois das 21h", () => {
    // 21/08 22:00 em Brasília = 22/08 01:00 UTC. A frase precisa dizer 21.
    const dezDaNoite = new Date("2027-08-22T01:00:00.000Z");
    expect(dezDaNoite.getUTCDate()).toBe(22);
    expect(partesLocais(dezDaNoite, "America/Sao_Paulo").dia).toBe("2027-08-21");
  });
});
