import path from "node:path";
import { describe, expect, it } from "vitest";

import baseline from "@/design-system.baseline.json";
// A MESMA medição que o build usa. Importá-la daqui é o ponto: se o teste
// medisse por conta própria, o CI e o build poderiam discordar sobre o mesmo
// código — que é a pior forma possível de uma catraca falhar.
import { medir } from "@/scripts/ds-medidas.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");

type Medida = Record<string, number>;

describe("catraca do design system", () => {
  const { medido, detalhes, quantosArquivos } = medir(RAIZ) as {
    medido: Medida;
    detalhes: string[];
    quantosArquivos: number;
  };

  it("a medição achou os arquivos — se não achou, o resto é falso positivo", () => {
    expect(quantosArquivos).toBeGreaterThan(5);
  });

  for (const chave of Object.keys(baseline).filter(k => !k.startsWith("_"))) {
    it(`${chave} não subiu`, () => {
      expect(
        medido[chave],
        `${chave} subiu. Onde:\n` +
          detalhes.filter(d => d.includes(chave)).map(d => `  - ${d}`).join("\n") +
          "\n\nRemova o desvio — não aumente o teto em design-system.baseline.json."
      ).toBeLessThanOrEqual((baseline as unknown as Medida)[chave]);
    });
  }

  it("nenhuma cor literal em app/ e components/ — o projeto nasceu em zero e fica em zero", () => {
    expect(medido.coresLiterais).toBe(0);
    expect(medido.coresEmFuncao).toBe(0);
  });

  it("nenhum `dark:` — não existe modo escuro neste produto", () => {
    // Regra §13 do padrão da casa: ou está montado e testado, ou não existe.
    // Meio modo escuro é código morto que parece funcionalidade, e alguém
    // escreve `dark:` achando que tem efeito.
    expect(medido.modoEscuro).toBe(0);
  });
});
