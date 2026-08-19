import { expect, it } from "vitest";

import { conferirMomento } from "@/lib/conteudo-do-site";
import { horaParaExibir } from "@/lib/datas";

/**
 * AS ASSERÇÕES DE HORA DA PROGRAMAÇÃO, rodadas em **dois fusos**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `test/conteudo-do-site.test.ts` roda com `TZ=UTC`, que é como a Vercel roda.
 * `test/conteudo-do-site.brasilia.test.ts` roda com `TZ=America/Sao_Paulo`, que é
 * como roda a máquina de quem desenvolve. **Os dois exigem o mesmo resultado.**
 *
 * É a única forma de provar que a hora não passa por `Date`: um cálculo que use
 * o relógio do processo passa num fuso e erra no outro, sem nenhum erro
 * aparecer. O caso que importa é `23:30` — com uma conversão para instante em
 * UTC, ela viraria `02:30` do dia seguinte, e a programação do casamento
 * mostraria a festa começando de madrugada.
 *
 * O arquivo compartilhado existe pelo mesmo motivo de `medicao-comum.ts`:
 * duplicar as asserções deixaria consertar uma e esquecer a outra.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function casosDeHora(): void {
  it("**23:30 continua 23:30, e não vira 02:30**", () => {
    const { dados, erros } = conferirMomento(
      { titulo: "A festa", hora: "23:30" },
      { parcial: false }
    );
    expect(erros).toEqual([]);
    expect(dados.hora).toBe("23:30");
    expect(horaParaExibir("23:30")).toBe("23h30");
  });

  it("00:00 é meia-noite de verdade, e não some", () => {
    // `partesLocais` devolve `null` à meia-noite de propósito, num contexto em
    // que a hora é detalhe opcional de uma frase. Aqui a hora É o conteúdo: um
    // momento às 00:00 tem que aparecer.
    const { dados } = conferirMomento(
      { titulo: "A virada", hora: "00:00" },
      { parcial: false }
    );
    expect(dados.hora).toBe("00:00");
    expect(horaParaExibir("00:00")).toBe("0h");
  });

  it("os horários do dia atravessam os dois fusos sem se mover", () => {
    for (const hora of ["09:00", "16:00", "16:30", "21:45", "23:59"]) {
      const { dados } = conferirMomento({ titulo: "X", hora }, { parcial: false });
      expect(dados.hora, `${hora} se moveu`).toBe(hora);
    }
  });

  it("o momento sem hora continua sem hora", () => {
    // Nulo SIGNIFICA "sem horário anunciado". Um fuso não pode transformá-lo em
    // meia-noite — que é o que aconteceria se ele passasse por `Date`.
    const { dados, erros } = conferirMomento(
      { titulo: "A festa vai até o fim", hora: null },
      { parcial: false }
    );
    expect(erros).toEqual([]);
    expect(dados.hora).toBeNull();
  });
}
