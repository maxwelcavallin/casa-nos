import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import { reconciliarParticipacao } from "@/lib/reconciliacao";
import { participacaoDaSessao } from "@/lib/sessao";

/**
 * O GATILHO QUE IMPORTA MAIS (H-15): **a participação reabre o álbum e diz o que
 * julga pendente.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE GATILHO VALE MAIS QUE O CRON: quem reabre o álbum é justamente
 * quem tinha foto na fila. O `PUT` no R2 é o passo que consome o uplink inteiro;
 * o `POST` de confirmação é o que falha depois dele, quando a rede já acabou. A
 * pessoa fecha a aba achando que perdeu, volta no dia seguinte — e é aqui que a
 * foto dela é adotada, **antes** de a grade responder. Ela vê a própria foto
 * aparecer sem saber que houve conserto.
 *
 * O cron diário (12:00 UTC) existe para quem nunca mais volta.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **LIMITADO À PRÓPRIA PARTICIPAÇÃO** (critério da história): `participacao.
 * reconciliar` é `proprias` na matriz, e a consulta carrega o `participacao_id`.
 * Sem isso, um convidado dispararia `HEAD` no balde inteiro do casamento a cada
 * abertura de tela — 6.000 requisições ao R2 por toque.
 *
 * A LISTA DE `client_media_id` É UMA DICA, NÃO UM FILTRO DE CONFIANÇA. Ela vem
 * da fila local do aparelho e serve para estreitar a busca ao que ele acha que
 * ficou para trás. Vazia, a rotina confere tudo o que está sem carimbo naquela
 * participação — que é o certo quando a fila local foi perdida com o navegador.
 */

const CAMINHO = "/api/eventos/[id]/participacoes/atual/reconciliar";

/** Teto do que o aparelho pode listar. Uma fila real não passa disto. */
const TETO_DE_DICAS = 200;

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "participacao.reconciliar");
  if (!acesso.ok) return acesso.resposta;

  const participacao = participacaoDaSessao(acesso.sessao);
  if (!participacao) return naoEncontrado();

  const corpo = await corpoJson(pedido);
  const bruto = (corpo ?? {}) as Record<string, unknown>;
  const dicas = Array.isArray(bruto.client_media_ids)
    ? (bruto.client_media_ids as unknown[]).filter(ehUuid).slice(0, TETO_DE_DICAS)
    : [];

  const resultado = await reconciliarParticipacao(
    acesso.evento.id,
    participacao.id,
    dicas
  );

  /**
   * A resposta conta o que foi adotado, e a tela **não mostra isso**.
   *
   * O convidado não precisa saber que houve conserto — para ele a foto
   * simplesmente está lá, e um aviso de "recuperamos 3 fotos" transformaria um
   * acerto invisível numa notícia de que algo tinha dado errado. Os números
   * existem para o teste e para o cliente decidir se recarrega a grade.
   */
  return NextResponse.json({
    conferidas: resultado.conferidas,
    adotadas: resultado.adocoes.length,
    // Sem `client_media_id` no corpo: ele já está no registro do servidor, e
    // devolvê-lo não ajuda a tela a fazer nada.
    recarregar: resultado.adocoes.length > 0,
  });
});
