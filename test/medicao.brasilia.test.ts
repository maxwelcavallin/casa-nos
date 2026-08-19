import { describe } from "vitest";

import { afirmacoesDoPainelDoDia } from "./medicao-comum";

/**
 * As MESMAS afirmações, com o processo em `America/Sao_Paulo`.
 *
 * O projeto `fuso-brasilia` do `vitest.config.mts` roda só os arquivos
 * `*.brasilia.test.ts`: rodar a suíte inteira duas vezes dobraria o tempo do CI
 * para verificar uma coisa só.
 *
 * O que se está afirmando aqui é que **nada muda**. Uma festa que começa às 18h
 * e termina depois da meia-noite precisa significar o mesmo conjunto de mídias
 * nos dois ambientes — senão metade dela vai para o dia seguinte.
 */
describe("painel do dia · processo em America/Sao_Paulo", () => {
  afirmacoesDoPainelDoDia("America/Sao_Paulo");
});
