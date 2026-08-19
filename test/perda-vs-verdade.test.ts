import { afterAll, describe, expect, it } from "vitest";

import { sql } from "@/lib/db";
import { perdaDoEvento } from "@/lib/reconciliacao";

/**
 * **A CONSULTA QUE DIZ SE ALGUMA FOTO SE PERDEU** (H-15, bloqueio 1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O CRITÉRIO DE TÉRMINO DA FATIA 1 É UM NÚMERO: *perda irrecuperável = 0*. Uma
 * consulta que devolve zero **porque não sabe olhar** e uma consulta que devolve
 * zero **porque não há perda** são indistinguíveis no dia em que alguém a lê —
 * e o dia em que alguém a lê é o dia seguinte ao casamento.
 *
 * Por isso este arquivo mede as duas pontas, no banco de verdade:
 *
 *   1. Uma intenção que nunca virou prévia, num evento de **8 dias atrás**,
 *      aparece como perda. Se este número for zero, a view está cega.
 *   2. A **mesma** intenção, num evento de **hoje**, NÃO aparece: a perda só é
 *      irrecuperável depois de D+7 (RN-14). Antes disso a foto ainda pode chegar
 *      — a fila dorme e acorda —, e contá-la seria transformar o produto
 *      funcionando em alarme.
 *   3. Um original faltando **nunca** entra na perda: é qualidade degradada, e
 *      ele tem linha própria (RN-15).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **SEM `DATABASE_URL` O TESTE É PULADO.** As views vivem no Postgres; um banco
 * falso mediria o que eu escrevi no teste, e não o que a migration criou.
 */

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
const MARCA = `teste-perda-${Date.now().toString(36)}`;

const criados: string[] = [];

afterAll(async () => {
  if (!TEM_BANCO) return;
  for (const id of criados) await sql`delete from eventos where id = ${id}::uuid`;
});

/**
 * Um evento com N dias de idade, uma participação, e as mídias que o caso pede.
 */
async function cenario(opcoes: {
  diasAtras: number;
  intencoesSemPrevia: number;
  originaisPendentes: number;
}): Promise<string> {
  const [evento] = await sql`
    insert into eventos (slug, nome_casal, data_evento, fuso, cidade, uf, publicado)
    values (${`${MARCA}-${criados.length}`}, 'Teste Perda',
            current_date - (${opcoes.diasAtras} * interval '1 day'), 'America/Sao_Paulo',
            'Rio de Janeiro', 'RJ', false)
    returning id
  `;
  const eventoId = String(evento.id);
  criados.push(eventoId);

  const [participacao] = await sql`
    insert into participacoes (evento_id, token_hash, papel)
    values (${eventoId}::uuid, ${`hash-${eventoId}`}, 'convidado')
    returning id
  `;

  if (opcoes.intencoesSemPrevia > 0) {
    // Estado `intencao`, sem `previa_armazenada_em`: os bytes nunca chegaram.
    await sql`
      insert into midias
        (evento_id, participacao_id, lote_id, client_media_id, estado, tipo_arquivo, bytes)
      select ${eventoId}::uuid, ${participacao.id}::uuid,
             gen_random_uuid(), gen_random_uuid(), 'intencao', 'image/jpeg', 3500000
        from generate_series(1, ${opcoes.intencoesSemPrevia})
    `;
  }

  if (opcoes.originaisPendentes > 0) {
    // Prévia sim, original não: a foto EXISTE, está no feed, está com o casal.
    await sql`
      insert into midias
        (evento_id, participacao_id, lote_id, client_media_id, estado, tipo_arquivo, bytes,
         previa_armazenada_em, armazenada_em)
      select ${eventoId}::uuid, ${participacao.id}::uuid,
             gen_random_uuid(), gen_random_uuid(), 'armazenada', 'image/jpeg', 3500000,
             now(), now()
        from generate_series(1, ${opcoes.originaisPendentes})
    `;
  }

  return eventoId;
}

describe.skipIf(!TEM_BANCO)("a consulta de perda, contra o banco de verdade", () => {
  it("**hoje ela diz ZERO — e é a resposta certa**", async () => {
    /**
     * Três intenções sem prévia num casamento que foi hoje. A foto ainda pode
     * chegar: a fila deste produto dorme a noite inteira e acorda no dia
     * seguinte, e a reconciliação (H-15) adota o que já está no balde. Contar
     * agora transformaria o produto funcionando em alarme.
     */
    const eventoId = await cenario({
      diasAtras: 0,
      intencoesSemPrevia: 3,
      originaisPendentes: 5,
    });
    const perda = await perdaDoEvento(eventoId);
    expect(perda.previasPerdidas).toBe(0);
    // E a segunda grandeza aparece **em linha separada**, e nunca somada.
    expect(perda.originaisPendentes).toBe(5);
  }, 60_000);

  it("**passados 7 dias, as mesmas três aparecem — a view não está cega**", async () => {
    /**
     * Este é o teste que dá sentido ao de cima. Sem ele, "a perda deu zero"
     * poderia significar "a consulta não olha", e o veredito da fatia inteira
     * seria uma frase sem conteúdo.
     */
    const eventoId = await cenario({
      diasAtras: 8,
      intencoesSemPrevia: 3,
      originaisPendentes: 5,
    });
    const perda = await perdaDoEvento(eventoId);
    expect(perda.previasPerdidas).toBe(3);
    // O original pendente NÃO virou perda: ele nunca entra nessa conta.
    expect(perda.originaisPendentes).toBe(5);
  }, 60_000);

  it("sem intenção órfã, o número é zero mesmo depois de D+7", async () => {
    const eventoId = await cenario({
      diasAtras: 8,
      intencoesSemPrevia: 0,
      originaisPendentes: 40,
    });
    const perda = await perdaDoEvento(eventoId);
    expect(perda.previasPerdidas).toBe(0);
    expect(perda.originaisPendentes).toBe(40);
  }, 60_000);

  it("a mídia EXCLUÍDA não conta como perdida", async () => {
    /**
     * Quem apagou a própria foto não perdeu foto nenhuma. Sem esta cláusula, o
     * bloqueio 1 acenderia toda vez que um convidado usasse o botão de apagar —
     * e o alarme que dispara sobre o uso normal do produto é o alarme que
     * ninguém olha na segunda semana.
     */
    const eventoId = await cenario({
      diasAtras: 8,
      intencoesSemPrevia: 4,
      originaisPendentes: 0,
    });
    await sql`
      update midias set excluida_em = now(), excluida_por = 'convidado'
       where evento_id = ${eventoId}::uuid
    `;
    const perda = await perdaDoEvento(eventoId);
    expect(perda.previasPerdidas).toBe(0);
  }, 60_000);
});
