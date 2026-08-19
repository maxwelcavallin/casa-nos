import { describe, expect, it } from "vitest";

import { partesLocais } from "@/lib/datas";
import { diasDesdeOEvento } from "@/lib/medida-do-dia";

/**
 * O MESMO CÓDIGO, COM O RELÓGIO DO PROCESSO EM BRASÍLIA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O projeto `lib` roda em `TZ=UTC`, que é como a Vercel roda. Este roda como
 * roda a máquina de quem desenvolve. **Os mesmos instantes precisam produzir os
 * mesmos números** — e a única forma de provar isso é rodar os dois, porque um
 * cálculo que use o relógio do processo passa num e erra no outro **sem nenhum
 * erro aparecer**.
 *
 * É a mesma catraca que a janela de envio já tem (`janela-de-envio.brasilia`),
 * aplicada agora ao `days_since_event` e à data que a tela anuncia — os dois
 * números novos da F1.3/F1.4 que dependem de calendário.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = { dataEvento: "2027-08-22", fuso: "America/Sao_Paulo" };

describe("o fuso do processo não muda nenhuma conta", () => {
  it("o relógio deste projeto é mesmo o de Brasília", () => {
    // Sem esta afirmação, o arquivo poderia rodar em UTC por engano de
    // configuração e passar por ser idêntico ao gêmeo — verificando nada.
    expect(process.env.TZ).toBe("America/Sao_Paulo");
  });

  it("`days_since_event` dá os mesmos números", () => {
    expect(diasDesdeOEvento(EVENTO, new Date("2027-08-21T15:00:00.000Z"))).toBe(-1);
    expect(diasDesdeOEvento(EVENTO, new Date("2027-08-22T03:30:00.000Z"))).toBe(0);
    // 22h de Brasília do dia da festa: já é dia 23 em UTC, e continua sendo 0.
    expect(diasDesdeOEvento(EVENTO, new Date("2027-08-23T01:00:00.000Z"))).toBe(0);
    expect(diasDesdeOEvento(EVENTO, new Date("2027-09-21T15:00:00.000Z"))).toBe(30);
  });

  it("a data anunciada pela tela é a mesma", () => {
    expect(partesLocais(new Date("2027-08-21T03:00:00.000Z"), "America/Sao_Paulo")).toEqual({
      dia: "2027-08-21",
      hora: null,
    });
    expect(partesLocais(new Date("2027-08-21T21:00:00.000Z"), "America/Sao_Paulo")).toEqual({
      dia: "2027-08-21",
      hora: "18:00",
    });
    expect(partesLocais(new Date("2027-08-22T01:00:00.000Z"), "America/Sao_Paulo").dia).toBe(
      "2027-08-21"
    );
  });
});
