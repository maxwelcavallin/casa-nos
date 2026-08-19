import { describe } from "vitest";

import { casosDeHora } from "@/test/conteudo-comum";

/**
 * O MESMO CÓDIGO, COM O RELÓGIO DO PROCESSO EM BRASÍLIA.
 *
 * `conteudo-do-site.test.ts` roda em `TZ=UTC`, que é como a Vercel roda. Este
 * roda como roda a máquina de quem desenvolve — e **os dois exigem o mesmo
 * resultado**.
 *
 * É a única forma de provar que a hora da programação não passa por `Date`: um
 * cálculo que use o relógio do processo passa num fuso e erra no outro sem
 * nenhum erro aparecer. O caso concreto é `23:30`, que com uma conversão para
 * instante viraria `02:30` do dia seguinte — a programação do casamento
 * anunciando a festa começando de madrugada.
 *
 * O projeto `fuso-brasilia` do `vitest.config.mts` só inclui `*.brasilia.test.ts`
 * de propósito: rodar a suíte inteira duas vezes dobraria o CI para verificar
 * uma coisa só.
 */
describe("a programação do dia, em Brasília", () => {
  casosDeHora();
});
