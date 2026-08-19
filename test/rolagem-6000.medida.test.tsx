import { render } from "@testing-library/react";
import React from "react";
import { describe, it } from "vitest";

import { Providers } from "@/components/Providers";
import { CardMidia } from "@/components/album/CardMidia";
import { GradeMidias } from "@/components/album/GradeMidias";

/**
 * **A MEDIDA QUE DECIDE A VIRTUALIZAÇÃO** (H-21, gatilho do `po` em 19/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * *"Acima de 3 s, a virtualização vira obrigatória antes do congelamento de
 * código; abaixo, é Fatia 2."*
 *
 * O QUE ESTE ARQUIVO MEDE, E O QUE ELE NÃO MEDE — e a distinção é o valor dele:
 *
 * **MEDE:** quantos nós de DOM a grade produz por foto, e como o custo de montar
 * cresce com o número de itens. A contagem de nós é **independente de aparelho**:
 * ela é a mesma no meu computador e no Android de 3 anos, e é ela que decide se
 * a virtualização é necessária.
 *
 * **NÃO MEDE:** milissegundos num aparelho real. Isto é `jsdom` — sem layout,
 * sem pintura, sem decodificação de imagem, sem GPU. O tempo daqui é uma ordem
 * de grandeza, não um veredito; cravar um limite em ms sobre ele seria inventar
 * um critério e chamá-lo de medição.
 *
 * O TERCEIRO NÚMERO, e ele não está aqui: **a rolagem só chega a 6.000 nós se
 * alguém rolar 150 páginas.** A abertura do álbum monta 40 cartões — o teto da
 * H-11 ("abrir em 3 s") é sobre isso, e o teste de carga mediu a metade do
 * servidor. O que 6.000 nós descrevem é o pior caso de uma noite inteira com a
 * aba aberta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TAMANHOS = [40, 200, 1000, 6000];

function foto(indice: number) {
  return {
    id: `midia-${indice}`,
    miniatura: `https://fotos.casa-nos.app/pub/e/evento/m/midia-${indice}/t.jpg`,
    visibilidade: indice % 3 === 0 ? ("noivos" as const) : ("feed" as const),
    chegada: indice % 7 === 0 ? ("ainda_subindo" as const) : ("completa" as const),
    noLote: indice % 11 === 0 ? 4 : 1,
  };
}

describe("a grade, do tamanho de uma noite", () => {
  it("mede a montagem e a contagem de nós", () => {
    const linhas: string[] = [];

    for (const quantos of TAMANHOS) {
      const itens = Array.from({ length: quantos }, (_, i) => foto(i));

      const inicio = performance.now();
      const { container, unmount } = render(
        <Providers>
          <GradeMidias>
            {itens.map(item => (
              <CardMidia
                key={item.id}
                miniatura={item.miniatura}
                visibilidade={item.visibilidade}
                chegada={item.chegada}
                noLote={item.noLote}
              />
            ))}
          </GradeMidias>
        </Providers>
      );
      const montagem = performance.now() - inicio;
      const nos = container.querySelectorAll("*").length;

      linhas.push(
        `  ${String(quantos).padStart(5)} fotos  ` +
          `montagem=${montagem.toFixed(0).padStart(6)} ms  ` +
          `nos=${String(nos).padStart(7)}  ` +
          `nos/foto=${(nos / quantos).toFixed(1).padStart(5)}  ` +
          `us/foto=${((montagem * 1000) / quantos).toFixed(0).padStart(5)}`
      );
      unmount();
    }

    console.log("\nA GRADE, DO TAMANHO DE UMA NOITE (jsdom — ordem de grandeza)\n");
    for (const linha of linhas) console.log(linha);
    console.log(
      "\n  Abrir o album monta 40 cartoes (uma pagina). 6.000 so acontece se\n" +
        "  alguem rolar 150 paginas sem recarregar. Ver docs/carga-fatia-1.md.\n"
    );
  });
});
