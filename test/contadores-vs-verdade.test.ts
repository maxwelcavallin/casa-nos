import { afterAll, describe, expect, it } from "vitest";

import { sql } from "@/lib/db";
import {
  confirmarFaixa,
  excluirMidia,
  registrarIntencao,
  type ItemDeIntencao,
} from "@/lib/midias";
import { recomputarContadores } from "@/lib/reconciliacao";

/**
 * O AGREGADO CONTRA A VERDADE, DEPOIS DE 500 OPERAÇÕES (critério da H-14).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE TESTE PRECISA DE BANCO DE VERDADE, e por que ele não é opcional:
 *
 * `evento_contadores` é mantido **dentro da mesma instrução** que muda o estado
 * da mídia — um CTE em `confirmarFaixa` e outro em `excluirMidia`. É SQL, e SQL
 * não é verificável com um banco falso: um `greatest(x - 1, 0)` escrito errado,
 * um `on conflict` que não dispara, um contador que decrementa duas vezes na
 * exclusão de uma mídia sem prévia — nada disso aparece num executor de mentira,
 * porque ali quem responde sou eu.
 *
 * E o número errado é o pior tipo: ele é rápido, é plausível, e o casal
 * acredita nele. A regra do produto é **nunca mostrar número menor que a
 * realidade**.
 *
 * **SEM `DATABASE_URL` O TESTE É PULADO, e isso está declarado.** Num ambiente
 * sem credencial ele não pode rodar, e fingir que passou seria pior que pular.
 * O `pnpm verificar` do CI roda com a credencial de pré-produção.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TEM_BANCO = Boolean(process.env.DATABASE_URL);

/** Um evento próprio, com marca no slug. Ele é apagado no fim. */
const SLUG = `teste-contadores-${Date.now().toString(36)}`;

let eventoId = "";
let participacaoId = "";

async function preparar(): Promise<void> {
  const [evento] = await sql`
    insert into eventos (slug, nome_casal, data_evento, fuso, cidade, uf, publicado)
    values (${SLUG}, 'Teste Contadores', current_date, 'America/Sao_Paulo', 'Rio de Janeiro', 'RJ', false)
    returning id
  `;
  eventoId = String(evento.id);

  const [participacao] = await sql`
    insert into participacoes (evento_id, token_hash, papel)
    values (${eventoId}::uuid, ${`hash-${SLUG}`}, 'convidado')
    returning id
  `;
  participacaoId = String(participacao.id);
}

async function limpar(): Promise<void> {
  if (!eventoId) return;
  // `on delete cascade` cuida de mídias, participações e contadores.
  await sql`delete from eventos where id = ${eventoId}::uuid`;
}

afterAll(async () => {
  if (TEM_BANCO) await limpar();
});

describe.skipIf(!TEM_BANCO)("o contador do casal, contra a verdade", () => {
  it(
    "500 operações reais deixam o agregado igual à contagem",
    async () => {
      await preparar();

      /**
       * A MISTURA É DE PROPÓSITO, e cada caso já quebrou um contador em algum
       * produto:
       *
       *   - confirmar só a prévia            → `originais_pendentes` sobe
       *   - confirmar prévia e original      → `originais_pendentes` volta
       *   - confirmar a MESMA faixa 2 vezes  → não pode contar duas vezes
       *   - excluir com prévia confirmada    → `midias_armazenadas` desce
       *   - excluir SEM prévia               → não pode descer nada
       *   - intenção que nunca confirma      → fica em `midias_intencao`
       */
      const TOTAL = 200;
      const criadas: Array<{ id: string; confirmouPrevia: boolean }> = [];
      let operacoes = 0;

      for (let bloco = 0; bloco < TOTAL / 10; bloco++) {
        const itens: ItemDeIntencao[] = Array.from({ length: 10 }, (_, i) => ({
          clientMediaId: crypto.randomUUID(),
          loteId: crypto.randomUUID(),
          bytes: 1000 + i,
          tipoArquivo: "image/jpeg",
          hashConteudo: null,
          visibilidade: i % 3 === 0 ? "noivos" : "feed",
          origem: "camera",
          enfileiradaOffline: false,
        }));
        const registradas = await registrarIntencao(
          eventoId,
          participacaoId,
          "direto",
          itens
        );

        // Cada mídia registrada é uma operação sobre o agregado (`midias_intencao`
        // sobe), mesmo que o lote inteiro caiba numa requisição.
        operacoes += registradas.length;

        /**
         * As confirmações do bloco vão em PARALELO, e não é só velocidade: é o
         * caso que interessa. Numa festa, dez aparelhos confirmam ao mesmo
         * tempo — e o contador é mantido por um `on conflict do update` numa
         * linha só de `evento_contadores`. Se essa linha fosse ponto de
         * contenção com escrita perdida, é aqui que apareceria.
         */
        await Promise.all(
          registradas.map(async ({ midia }, posicao) => {
            const indice = bloco * 10 + posicao;
            // 10% ficam só na intenção: são a "perda" que a H-15 mede.
            if (indice % 10 === 9) {
              criadas.push({ id: midia.id, confirmouPrevia: false });
              return;
            }
            await confirmarFaixa(eventoId, midia.id, participacaoId, "previa", {
              bytesPrevia: 500,
              largura: 1600,
              altura: 1200,
            });
            operacoes += 1;
            // Repetir a confirmação NÃO pode contar duas vezes (RN-28).
            if (indice % 7 === 0) {
              await confirmarFaixa(eventoId, midia.id, participacaoId, "previa", {});
              operacoes += 1;
            }
            // 60% completam o original.
            if (indice % 10 < 6) {
              await confirmarFaixa(eventoId, midia.id, participacaoId, "original", {});
              operacoes += 1;
            }
            criadas.push({ id: midia.id, confirmouPrevia: true });
          })
        );
      }

      // E as exclusões — as duas variedades.
      await Promise.all(
        criadas
          .filter((_, indice) => indice % 11 === 0)
          .map(async criada => {
            await excluirMidia(eventoId, criada.id, "casal", null);
            operacoes += 1;
          })
      );

      // O critério da H-14 fala em 500 operações. Este número é medido, e não
      // presumido: se alguém mexer nas proporções acima, o teste avisa.
      expect(operacoes).toBeGreaterThanOrEqual(500);

      const [agregado] = await sql`
        select midias_armazenadas, originais_pendentes, midias_intencao
          from evento_contadores where evento_id = ${eventoId}::uuid
      `;
      const [verdade] = await sql`
        select
          count(*) filter (where previa_armazenada_em is not null and excluida_em is null)::int as armazenadas,
          count(*) filter (where previa_armazenada_em is not null
                             and original_armazenada_em is null
                             and excluida_em is null)::int as originais_pendentes
          from midias where evento_id = ${eventoId}::uuid
      `;

      /**
       * O QUE ESTE `expect` MEDE DE VERDADE: se o agregado mantido pelas
       * instruções do produto bate com um `count(*)` sobre as mesmas linhas.
       * Uma divergência aqui é um número errado permanente na tela do casal.
       */
      expect(Number(agregado.midias_armazenadas)).toBe(Number(verdade.armazenadas));
      expect(Number(agregado.originais_pendentes)).toBe(
        Number(verdade.originais_pendentes)
      );

      /**
       * E o recomputo do cron precisa devolver **zero** de divergência sobre um
       * agregado que já está certo: se ele "consertasse" algo aqui, o conserto
       * seria a prova de que o incremento está errado.
       */
      const recomputo = await recomputarContadores(eventoId);
      expect(recomputo.divergencia).toBe(0);
      expect(recomputo.armazenadas).toBe(Number(verdade.armazenadas));
    },
    120_000
  );
});
