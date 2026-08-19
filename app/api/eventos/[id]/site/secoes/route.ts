import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import { conferirSecoes, listarSecoes, salvarSecoes } from "@/lib/secoes";

/**
 * LIGAR, DESLIGAR E ORDENAR AS SEÇÕES DO SITE (v1.0, V-03).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **UM `PATCH` COM A LISTA INTEIRA, NUNCA N REQUISIÇÕES** (RV-05).
 *
 * A tentação era `PATCH /secoes/<chave>` por seção, que é mais parecido com
 * REST. Ela erra num lugar concreto: este painel é usado no celular, à noite,
 * depois do trabalho (`pesquisa.md` §persona), e nessa condição N requisições
 * parciais deixam a ordem inconsistente no meio — duas seções na posição nova,
 * cinco na antiga, e nada avisando. Reordenar é **um** ato do casal, e um ato é
 * uma requisição.
 *
 * O que a rota faz com a lista está em `lib/secoes.ts`: uma instrução só, com
 * `unnest` e `on conflict`. Ou as sete mudam, ou nenhuma.
 *
 * **DESLIGAR NÃO APAGA NADA.** `ativa = false` é estado, e o conteúdo continua no
 * banco — religar traz tudo de volta. É por isso que `evento_secoes` não tem
 * `excluido_em`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/eventos/[id]/site/secoes";

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  // Antes de qualquer consulta (`dados.md` §3).
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();

  const { mudancas, recusas } = conferirSecoes((corpo as Record<string, unknown>).secoes);

  /**
   * **400 COM O MOTIVO, E NADA GRAVADO.**
   *
   * A recusa mais provável é `capa` ou `rodape` desligada (RV-06), e ela chega
   * de um `PATCH` montado à mão — o interruptor delas não existe na tela. A
   * resposta diz qual seção e por quê; um 400 genérico faria a tela traduzir
   * "erro", que é o que este produto não escreve em lugar nenhum.
   *
   * Recusa parcial não existe: gravar cinco de sete deixaria a ordem pela metade,
   * que é exatamente o que a decisão de lote existe para evitar.
   */
  if (recusas.length > 0) return pedidoInvalido({ recusas });

  await salvarSecoes(acesso.evento.id, mudancas);

  /**
   * Devolve o estado inteiro relido, e não o que chegou. A tela repinta com o
   * que o servidor tem — se uma seção não veio na lista, ela continua no padrão
   * do catálogo, e o casal precisa ver isso e não o que ele mandou.
   */
  const secoes = await listarSecoes(acesso.evento.id);
  return NextResponse.json({
    secoes: secoes.map(s => ({ chave: s.chave, ativa: s.ativa, ordem: s.ordem })),
  });
});
