import { describe, expect, it } from "vitest";

import { janelaDeEnvioPadrao, paraInputLocal } from "@/lib/datas";

/**
 * A MESMA JANELA, COM O PROCESSO EM `TZ=America/Sao_Paulo`.
 *
 * Este arquivo roda no projeto `fuso-brasilia` do vitest, e existe por uma razão
 * só: provar que o resultado NÃO DEPENDE do fuso do processo.
 *
 * A máquina de quem desenvolve roda em Brasília; a Vercel roda em UTC. Um
 * cálculo que use o relógio do processo passa aqui e erra lá, ou o contrário — e
 * o sintoma em produção não é um erro, é uma janela três horas deslocada: o
 * convidado que manda às 23h30 do sétimo dia recebe "os envios foram
 * encerrados", e ninguém consegue reproduzir.
 *
 * Os números são os mesmos do arquivo irmão, escritos à mão de propósito.
 * Importá-los de lá deixaria os dois testes concordando por construção, que é
 * exatamente o que este arquivo existe para não fazer.
 */

const DIA = "2027-08-22";

describe("a janela em Brasília é a mesma janela", () => {
  it("os instantes são idênticos aos calculados em UTC", () => {
    const janela = janelaDeEnvioPadrao(DIA, "America/Sao_Paulo");
    expect(janela.abre.toISOString()).toBe("2027-08-21T03:00:00.000Z");
    expect(janela.fecha.toISOString()).toBe("2027-08-30T02:59:59.000Z");
  });

  it("o campo do formulário mostra o mesmo horário local", () => {
    const janela = janelaDeEnvioPadrao(DIA, "America/Sao_Paulo");
    expect(paraInputLocal(janela.abre, "America/Sao_Paulo")).toBe("2027-08-21T00:00");
    expect(paraInputLocal(janela.fecha, "America/Sao_Paulo")).toBe("2027-08-29T23:59");
  });

  it("o fuso do processo é mesmo o de Brasília — senão este arquivo não prova nada", () => {
    expect(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      "o projeto `fuso-brasilia` do vitest.config.mts perdeu o TZ; sem ele este " +
        "arquivo é uma cópia do irmão e não verifica nada"
    ).toBe("America/Sao_Paulo");
  });
});
