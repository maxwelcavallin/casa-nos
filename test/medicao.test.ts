import { describe } from "vitest";

import { afirmacoesDoPainelDoDia } from "./medicao-comum";

/**
 * O painel do dia, com o processo em **UTC** — que é como a Vercel roda.
 *
 * O irmão deste arquivo (`medicao.brasilia.test.ts`) roda as MESMAS afirmações
 * com o relógio do processo em Brasília, que é como roda a máquina de quem
 * desenvolve. Os dois existem porque um cálculo que use o relógio do processo
 * passa num e erra no outro **sem nenhum erro aparecer**.
 */
describe("painel do dia · processo em UTC", () => {
  afirmacoesDoPainelDoDia("UTC");
});
