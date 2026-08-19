import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import { errosPorTipo, filaAgora, medicaoDoDia, participacaoAgora } from "@/lib/medicao";
import type { Evento } from "@/lib/eventos";

/**
 * As afirmações do painel do dia (H-19) que precisam valer **nos dois fusos**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Este arquivo é importado por `medicao.test.ts` (processo em UTC, como a
 * Vercel) e por `medicao.brasilia.test.ts` (processo em Brasília, como a máquina
 * de quem desenvolve). Rodar só um dos dois seria rodar no único ambiente em que
 * o defeito não aparece.
 *
 * O QUE MUDA ENTRE OS DOIS: nada, e é isso que se está afirmando. Um cálculo que
 * use o relógio do processo passa num e erra no outro sem nenhum erro aparecer —
 * e o resultado é meia festa do lado errado da janela.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const EVENTO = "11111111-1111-4111-8111-111111111111";

export function espiao(resposta: (texto: string) => Record<string, unknown>[]) {
  const consultas: Array<{ texto: string; valores: unknown[] }> = [];
  const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
    consultas.push({ texto, valores });
    return resposta(texto);
  }) as unknown as Executor;
  return { exec, consultas };
}

/** Um casamento que começa às 18h e termina depois da meia-noite. */
export const EVENTO_QUE_ATRAVESSA_A_MEIA_NOITE = {
  id: EVENTO,
  slug: "ana-e-max",
  nomeCasal: "Ana Flávia e Maxwel",
  dataEvento: "2027-08-22",
  fuso: "America/Sao_Paulo",
  inicioFestaEm: new Date("2027-08-22T21:00:00.000Z"), // 18h em Brasília
  fimFestaEm: new Date("2027-08-23T06:00:00.000Z"), // 3h do dia seguinte
} as unknown as Evento;

const RAIZ = path.resolve(import.meta.dirname, "..");

export function afirmacoesDoPainelDoDia(nomeDoFuso: string): void {
  it(`[${nomeDoFuso}] a fração de participação é NÚMERO, e não string`, async () => {
    /**
     * `numeric` chega ao JavaScript como **string** (`dados.md` §6). Somar
     * string concatena; dividir string funciona por coerção, mas comparar não —
     * e uma participação de 40% vira 4000% pelo mesmo motivo que um total de
     * R$ 177 já virou R$ 12.200.000.055.
     *
     * O driver devolve `presentes_contagem` como string neste teste de
     * propósito: é o que ele faz de verdade com `numeric`.
     */
    const { exec } = espiao(() => [
      {
        slots_presentes: 184,
        slots_publicaram: 118,
        pessoas_teto: 131,
        presentes_contagem: "184",
      },
    ]);
    const p = await participacaoAgora(EVENTO, exec);
    expect(typeof p.pisoPessoas).toBe("number");
    expect(p.pisoPessoas).toBeCloseTo(118 / 184, 10);
    expect(p.tetoPessoas).toBeCloseTo(131 / 184, 10);
    expect(p.participacaoSlots).toBeCloseTo(118 / 184, 10);
  });

  it(`[${nomeDoFuso}] sem contagem de presentes, NÃO existe número`, async () => {
    /**
     * Nunca um número calculado sobre denominador inventado (H-19): o número
     * inventado seria bonito e seria usado. `null` obriga a tela a escrever
     * "Denominador ainda não informado" e a dizer onde resolver.
     */
    const { exec } = espiao(() => [
      { slots_presentes: 10, slots_publicaram: 4, pessoas_teto: 6, presentes_contagem: null },
    ]);
    const p = await participacaoAgora(EVENTO, exec);
    expect(p.presentesContagem).toBeNull();
    expect(p.pisoPessoas).toBeNull();
    expect(p.tetoPessoas).toBeNull();
    // A fração de SLOTS continua existindo: ela não depende do buffet.
    expect(p.participacaoSlots).toBeCloseTo(0.4, 10);
  });

  it(`[${nomeDoFuso}] a idade do item mais velho é minuto, e não texto`, async () => {
    /**
     * `extract(epoch ...)` volta como `numeric`, ou seja, como STRING. Sem
     * conversão, a comparação "acima de 15 minutos" — que é o gatilho do plano B
     * impresso — viraria comparação de texto, e `"9" > "15"` é verdadeiro.
     */
    const { exec } = espiao(() => [{ pendentes: 400, idade_minutos: "46.3" }]);
    const fila = await filaAgora(EVENTO, exec);
    expect(fila.idadeDoMaisVelhoMinutos).toBe(46);
    expect(typeof fila.idadeDoMaisVelhoMinutos).toBe("number");
  });

  it(`[${nomeDoFuso}] a janela de erros viaja como INSTANTE, e é a mesma nos dois fusos`, async () => {
    /**
     * O parâmetro é um ISO em UTC, montado a partir de um `Date`. Se em algum
     * lugar ele virasse `toLocaleDateString` ou um corte de string, a janela do
     * painel seria três horas diferente em Brasília — e a linha 4, que é a que
     * decide se alguém age, mostraria erros de outro pedaço da noite.
     */
    const agora = new Date("2027-08-22T23:30:00.000Z");
    const { exec, consultas } = espiao(() => [
      { rede: 37, portal: 0, servidor: 2, arquivo: 0 },
    ]);
    await errosPorTipo(EVENTO, new Date(agora.getTime() - 3600_000), exec);
    expect(consultas[0].valores).toContain("2027-08-22T22:30:00.000Z");
  });

  it(`[${nomeDoFuso}] os QUATRO tipos de erro são contados, e o portal tem coluna própria`, async () => {
    /**
     * `rede` e `portal` pedem ações OPOSTAS. Colapsados, o painel recomendaria
     * "não faça nada" no único caso em que agir é obrigatório.
     */
    const { exec, consultas } = espiao(() => [
      { rede: 37, portal: 3, servidor: 2, arquivo: 1 },
    ]);
    const erros = await errosPorTipo(EVENTO, new Date(0), exec);
    expect(erros).toEqual({ rede: 37, portal: 3, servidor: 2, arquivo: 1 });
    expect(consultas[0].texto).toMatch(/tipo_erro = 'portal'/);
  });

  it(`[${nomeDoFuso}] a linha que falha não derruba as outras seis`, async () => {
    /**
     * O critério da H-19, literalmente. Às 23h, seis números certos e um erro
     * valem infinitamente mais que uma tela de erro.
     */
    const exec = (async (partes: TemplateStringsArray) => {
      const texto = partes.join(" ").replace(/\s+/g, " ");
      if (texto.includes("vw_participacao_evento")) throw new Error("view fora do ar");
      if (texto.includes("evento_contadores")) {
        return [{ midias_armazenadas: 4000, originais_pendentes: 388 }];
      }
      return [{}];
    }) as unknown as Executor;

    const medicao = await medicaoDoDia(
      EVENTO_QUE_ATRAVESSA_A_MEIA_NOITE,
      new Date("2027-08-22T23:30:00.000Z"),
      exec
    );

    expect(medicao.participacao.ok).toBe(false);
    expect(medicao.midias.ok).toBe(true);
    expect(medicao.midias.ok && medicao.midias.valor.armazenadas).toBe(4000);
    // 4000 − 388: a segunda grandeza é derivada, e não uma quarta coluna.
    expect(medicao.midias.ok && medicao.midias.valor.emAltaResolucao).toBe(3612);
  });

  it(`[${nomeDoFuso}] "durante a festa" usa a janela do EVENTO, e o mesmo conjunto nos dois fusos`, async () => {
    /**
     * A festa começa às 18h e termina às 3h do dia seguinte. Uma moderação às
     * 00h30 de Brasília está **dentro**; a mesma instrução avaliada com o
     * relógio do processo cairia fora em UTC, porque lá já é o dia seguinte.
     *
     * Os limites viajam como instante (ISO em UTC) justamente por isso.
     */
    const { exec, consultas } = espiao(() => [{ quantas: 6 }]);
    await medicaoDoDia(
      EVENTO_QUE_ATRAVESSA_A_MEIA_NOITE,
      new Date("2027-08-23T03:30:00.000Z"),
      exec
    );
    const daModeracao = consultas.find(c => c.texto.includes("moderada_em is not null"));
    expect(daModeracao).toBeDefined();
    expect(daModeracao?.valores).toContain("2027-08-22T21:00:00.000Z");
    expect(daModeracao?.valores).toContain("2027-08-23T06:00:00.000Z");
  });

  it(`[${nomeDoFuso}] a view de participação usa \`at time zone\`, e nunca um corte de data`, () => {
    /**
     * O outro lado da mesma regra, no SQL. `(data_evento + time '12:00') at time
     * zone fuso` resolve o instante real; um `::date` sobre `timestamptz` usaria
     * o fuso da SESSÃO do banco, e a janela de medição mudaria conforme quem
     * conectou.
     */
    const migration = fs.readFileSync(
      path.join(RAIZ, "db", "migrations", "0008_views_medicao.sql"),
      "utf8"
    );
    expect(migration).toMatch(/at time zone e\.fuso/);
    expect(migration).toMatch(/interval '48 hours'/);
    expect(migration).not.toMatch(/armazenada_em::date/);
  });

  it(`[${nomeDoFuso}] "ainda não começou" é verdade; zero seria mentira`, async () => {
    const { exec } = espiao(() => [{}]);
    const antes = await medicaoDoDia(
      EVENTO_QUE_ATRAVESSA_A_MEIA_NOITE,
      new Date("2027-08-22T12:00:00.000Z"),
      exec
    );
    expect(antes.comecou).toBe(false);

    const durante = await medicaoDoDia(
      EVENTO_QUE_ATRAVESSA_A_MEIA_NOITE,
      new Date("2027-08-22T23:00:00.000Z"),
      exec
    );
    expect(durante.comecou).toBe(true);
  });
}
