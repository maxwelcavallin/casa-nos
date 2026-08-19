import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import { conferirPublicacao, definirPublicacao } from "@/lib/publicacao";

/**
 * PUBLICAR E TIRAR DO AR (v1.0, V-11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **`site.publicar`, E NÃO `site.editar`.** As duas têm linhas idênticas na
 * matriz hoje, e continuam separadas de propósito (`lib/autorizacao.ts`):
 * publicar é o ato com consequência diferente — é o instante em que o endereço
 * passa a responder para 150 pessoas — e é o primeiro que se restringe quando
 * existir um quarto tipo de acesso (assessora), que `evento_acessos.tipo` já
 * aceita como valor.
 *
 * **UM `PATCH`, E O ESTADO INTEIRO NO CORPO.** Não há `POST /publicar` e
 * `POST /despublicar`: seriam duas rotas, duas entradas na matriz e dois lugares
 * para alguém esquecer o guarda. O corpo é `{ publicado: boolean }`, e a rota
 * recusa qualquer outra coisa — inclusive `"true"` e `1`.
 *
 * **A ROTA NÃO DECIDE SE O EVENTO DO GA4 SAI.** Ela devolve `mudou`, que é o que
 * o banco respondeu, e a tela emite `site_published` só quando ele vier `true`
 * junto de `publicado: true`. O critério da V-11 é literal — *"só na transição
 * de `false` para `true`"* e *"dois toques não geram dois eventos"* —, e a única
 * forma de isso ser verdade sob toque duplo é a decisão sair da mesma instrução
 * que grava. Ver `lib/publicacao.ts`.
 *
 * **NADA É APAGADO** (RV-13). Tirar do ar grava `false` e mais nada; o endereço
 * responde 404 porque `buscarEventoPorSlug` e `buscarEventoPorDominio` já exigem
 * `publicado = true` desde a `0001`. Não há código novo nesse caminho, e não
 * deve haver.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/eventos/[id]/site/publicacao";

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  // Antes de qualquer consulta (`dados.md` §3).
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "site.publicar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  const publicado = conferirPublicacao(corpo);
  if (publicado === null) {
    // O erro vai identificado por campo, como no resto do painel: ele aparece
    // onde a pessoa mexeu, e não num alerta genérico no topo.
    return pedidoInvalido({ publicado: "Mande `publicado` como true ou false." });
  }

  const resultado = await definirPublicacao(acesso.evento.id, publicado);
  // Evento de outro casamento, ou excluído entre o `autorizar` e agora: 404, a
  // mesma resposta de id malformado e de recurso inexistente.
  if (!resultado) return naoEncontrado();

  return NextResponse.json({ publicado: resultado.publicado, mudou: resultado.mudou });
});
