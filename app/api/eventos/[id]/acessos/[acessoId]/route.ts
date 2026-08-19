import { revogarAcesso } from "@/lib/acessos";
import { autorizar, naoEncontrado, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";

/**
 * Revogar um link (H-02).
 *
 * REVOGA, NÃO APAGA: a linha fica com `revogado_em` preenchido. Quem cancelou o
 * link do telão às 23h precisa poder ver, no dia seguinte, que ele existiu e
 * quando morreu — e o índice único de token é parcial, então o token revogado
 * não bloqueia a criação do próximo.
 *
 * "Revogar derruba a página do telão na próxima sondagem": não há nada a fazer
 * aqui para isso acontecer, e essa é a propriedade. `acessoPorToken` filtra
 * `revogado_em is null` em toda resolução de sessão, então a sondagem seguinte
 * já não encontra sessão. Um mecanismo de invalidação separado seria uma
 * segunda verdade sobre o mesmo fato.
 *
 * 204 sem corpo. 404 quando o acesso é de outro evento — nunca 403, que
 * confirmaria a existência de um id que não é desta sessão.
 */

const CAMINHO = "/api/eventos/[id]/acessos/[acessoId]";

export const DELETE = rotaDeApi(CAMINHO, async (_pedido, contexto) => {
  const { id, acessoId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(acessoId)) return naoEncontrado();

  const acesso = await autorizar(id, "dia.configurar");
  if (!acesso.ok) return acesso.resposta;

  const mudou = await revogarAcesso(acesso.evento.id, acessoId);
  if (mudou === 0) return naoEncontrado();

  return new Response(null, { status: 204 });
});
