import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { atualizarPergunta, conferirPergunta, excluirPergunta } from "@/lib/conteudo-do-site";
import { ehUuid } from "@/lib/ids";

/**
 * EDITAR E APAGAR UMA PERGUNTA (v1.0, V-09).
 *
 * **APAGAR A RESPOSTA É DIFERENTE DE APAGAR A PERGUNTA.** Mandar
 * `resposta: null` devolve a pergunta ao estado "sugerida, ainda não
 * respondida" — ela some do site e continua no painel. O `DELETE` apaga a
 * pergunta inteira, com exclusão lógica.
 *
 * Os dois parâmetros são validados antes de qualquer consulta (`dados.md` §3).
 */

const CAMINHO = "/api/eventos/[id]/site/perguntas/[perguntaId]";

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id, perguntaId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(perguntaId)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  const { dados, erros } = conferirPergunta(corpo, { parcial: true });
  if (erros.length > 0) return pedidoInvalido({ campos: erros });

  const pergunta = await atualizarPergunta(acesso.evento.id, perguntaId, dados);
  // Pergunta de OUTRO evento devolve `null` e vira 404, nunca 403.
  if (!pergunta) return naoEncontrado();

  return NextResponse.json(pergunta);
});

export const DELETE = rotaDeApi(CAMINHO, async (_pedido, contexto) => {
  const { id, perguntaId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(perguntaId)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const apagou = await excluirPergunta(acesso.evento.id, perguntaId);
  if (!apagou) return naoEncontrado();

  return new NextResponse(null, { status: 204 });
});
