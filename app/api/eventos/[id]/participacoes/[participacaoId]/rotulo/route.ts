import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import { MAXIMO_DO_ROTULO, renomearParticipacao } from "@/lib/participacoes";

/**
 * O CASAL RENOMEIA UMA PARTICIPAÇÃO (H-23, `Could`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA É A ÚNICA ROTA DE PARTICIPAÇÃO COM **ID NO CAMINHO**, e a diferença com a
 * `atual` é a história inteira: lá quem age é o dono da participação, e o id
 * viria do cookie; aqui quem age é o casal, sobre a participação **de outra
 * pessoa**, e o id precisa ser dito. É por isso que ele é validado com `ehUuid`
 * antes de qualquer consulta e por isso que o `evento_id` entra na cláusula do
 * `update` — um id de participação de outro casamento não pode ser renomeado a
 * partir deste painel (RN-25).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O QUE ESTA ROTA **NÃO** FAZ, e é metade da H-23: não junta participações e não
 * numera nada. "Ana Silva (2)" seria o produto batizando um convidado, e juntar
 * álbuns moveria mídia entre participações — o que quebraria o alcance
 * `proprias` de quem enviou, que é a base de toda a H-10.
 *
 * E o aviso que leva a esta rota **só existe depois da festa**. A regra não mora
 * aqui: mora na tela, que é quem sabe se está desenhando durante ou depois de
 * `fim_festa_em`. O painel inteiro obedece à promessa de que o casal não
 * trabalha durante o próprio casamento.
 */

const CAMINHO = "/api/eventos/[id]/participacoes/[participacaoId]/rotulo";

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id, participacaoId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(participacaoId)) return naoEncontrado();

  const acesso = await autorizar(id, "participacao.renomear");
  if (!acesso.ok) return acesso.resposta;

  /**
   * O alcance `proprias` (convidado) **não passa por aqui**: quem renomeia a
   * própria participação usa `PATCH .../participacoes/atual`, que não tem id a
   * conferir. Aceitar `proprias` nesta rota obrigaria a comparar o id do caminho
   * com o da sessão — a verificação que a rota `atual` existe para não precisar.
   */
  if (acesso.alcance !== "todas") return naoEncontrado();

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const rotulo = (corpo as Record<string, unknown>).rotulo;

  if (typeof rotulo !== "string" || !rotulo.trim()) {
    return pedidoInvalido({ rotulo: "Escreva um nome." });
  }
  if (rotulo.trim().length > MAXIMO_DO_ROTULO) {
    return pedidoInvalido({ rotulo: "Esse nome é longo demais." });
  }

  const participacao = await renomearParticipacao(acesso.evento.id, participacaoId, rotulo);
  if (!participacao) return naoEncontrado();

  return NextResponse.json({ id: participacao.id, rotulo: participacao.rotulo });
});
