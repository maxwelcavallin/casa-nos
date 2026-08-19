import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { atualizarMomento, conferirMomento, excluirMomento } from "@/lib/conteudo-do-site";
import { ehUuid } from "@/lib/ids";

/**
 * EDITAR E APAGAR UM MOMENTO (v1.0, V-08).
 *
 * **OS DOIS PARÂMETROS SÃO VALIDADOS ANTES DE QUALQUER CONSULTA** (`dados.md`
 * §3): uuid torto estoura `22P02` no Postgres e vira 500 onde a resposta certa
 * é 404.
 *
 * `PATCH` é parcial. Mandar `hora: null` **limpa** o horário — é diferente de
 * não mandar o campo, que deixa como está. Sem essa distinção, o casal não
 * conseguiria transformar um momento com horário num momento sem.
 */

const CAMINHO = "/api/eventos/[id]/site/programacao/[itemId]";

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id, itemId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(itemId)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  const { dados, erros } = conferirMomento(corpo, { parcial: true });
  if (erros.length > 0) return pedidoInvalido({ campos: erros });

  const momento = await atualizarMomento(acesso.evento.id, itemId, dados);
  // Momento de OUTRO evento devolve `null` e vira 404, nunca 403.
  if (!momento) return naoEncontrado();

  return NextResponse.json(momento);
});

export const DELETE = rotaDeApi(CAMINHO, async (_pedido, contexto) => {
  const { id, itemId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(itemId)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  // Exclusão lógica: é conteúdo que o casal escreveu e pode querer de volta.
  const apagou = await excluirMomento(acesso.evento.id, itemId);
  if (!apagou) return naoEncontrado();

  return new NextResponse(null, { status: 204 });
});
