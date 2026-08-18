import { describe, expect, it } from "vitest";

import {
  contagemAte,
  dataParaExibir,
  dataPorExtenso,
  horaParaExibir,
  instanteDoEvento,
} from "@/lib/datas";

/**
 * DATA — o teste que só significa alguma coisa rodando em UTC.
 *
 * A máquina de quem desenvolve roda em horário de Brasília; a Vercel roda em
 * UTC. Todo defeito de data deste produto existe só em UTC. Rodar isto no fuso
 * local seria rodar no único ambiente onde o bug não aparece — por isso o
 * primeiro teste confere o próprio fuso do processo. Se ele falhar, os outros
 * são verdes sem valor.
 */
describe("o processo de teste roda em UTC", () => {
  it("getTimezoneOffset é zero", () => {
    expect(
      new Date().getTimezoneOffset(),
      "Os testes precisam rodar com TZ=UTC (ver vitest.config.mts). " +
        "Em horário de Brasília, os testes de data passam mesmo com o código errado."
    ).toBe(0);
  });
});

describe("dataParaExibir", () => {
  it("formata a string, sem passar por Date", () => {
    expect(dataParaExibir("2027-08-22")).toBe("22/08/2027");
  });

  it("NÃO perde um dia — que é o bug que este arquivo existe para impedir", () => {
    // A prova do defeito: em UTC, `new Date("2027-08-22")` é meia-noite UTC, e
    // lido em São Paulo isso é 21h do dia 21. O site anunciaria o casamento no
    // dia errado — e ninguém veria isso na máquina de desenvolvimento.
    const pelaViaErrada = new Date("2027-08-22").toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
    expect(pelaViaErrada).toBe("21/08/2027");
    expect(dataParaExibir("2027-08-22")).toBe("22/08/2027");
  });
});

describe("dataPorExtenso", () => {
  it("22/08/2027 é um domingo — e o domingo é intencional", () => {
    expect(dataPorExtenso("2027-08-22")).toBe("domingo, 22 de agosto de 2027");
  });

  it("acerta o dia da semana na virada do mês", () => {
    expect(dataPorExtenso("2027-01-01")).toBe("sexta-feira, 1 de janeiro de 2027");
    expect(dataPorExtenso("2026-02-28")).toBe("sábado, 28 de fevereiro de 2026");
  });

  it("acerta 29 de fevereiro de ano bissexto", () => {
    expect(dataPorExtenso("2028-02-29")).toBe("terça-feira, 29 de fevereiro de 2028");
  });
});

describe("horaParaExibir", () => {
  it("esconde os minutos quando são zero", () => {
    expect(horaParaExibir("16:00:00")).toBe("16h");
    expect(horaParaExibir("16:30:00")).toBe("16h30");
    expect(horaParaExibir("09:05")).toBe("9h05");
  });
});

describe("instanteDoEvento", () => {
  it("meia-noite em São Paulo é 3h em UTC — o casamento não começa 3h mais cedo", () => {
    const instante = instanteDoEvento("2027-08-22", null);
    expect(instante.toISOString()).toBe("2027-08-22T03:00:00.000Z");
  });

  it("16h em São Paulo é 19h em UTC", () => {
    const instante = instanteDoEvento("2027-08-22", "16:00");
    expect(instante.toISOString()).toBe("2027-08-22T19:00:00.000Z");
  });

  it("aceita o formato com segundos que o Postgres devolve em `time`", () => {
    expect(instanteDoEvento("2027-08-22", "16:00:00").toISOString()).toBe(
      "2027-08-22T19:00:00.000Z"
    );
  });

  it("o deslocamento sai do fuso, e não de um -03:00 chumbado no código", () => {
    // Um fuso com regra diferente prova que a conta consulta o fuso de verdade.
    // Se alguém trocar a implementação por uma string "-03:00", este quebra.
    const emLisboa = instanteDoEvento("2027-08-22", "12:00", "Europe/Lisbon");
    expect(emLisboa.toISOString()).toBe("2027-08-22T11:00:00.000Z");
  });
});

describe("contagemAte", () => {
  const alvo = new Date("2027-08-22T03:00:00.000Z");

  it("quebra o restante em dias, horas, minutos e segundos", () => {
    const agora = new Date("2027-08-20T01:59:58.000Z");
    expect(contagemAte(alvo, agora)).toEqual({
      dias: 2,
      horas: 1,
      minutos: 0,
      segundos: 2,
      chegou: false,
    });
  });

  it("não mostra número negativo depois da data — a página troca de texto", () => {
    const depois = new Date("2027-08-23T00:00:00.000Z");
    expect(contagemAte(alvo, depois)).toEqual({
      dias: 0,
      horas: 0,
      minutos: 0,
      segundos: 0,
      chegou: true,
    });
  });

  it("o instante exato já conta como chegou", () => {
    expect(contagemAte(alvo, new Date(alvo.getTime())).chegou).toBe(true);
  });
});
