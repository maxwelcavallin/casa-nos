import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import { trocarVisibilidade, type Visibilidade } from "@/lib/midias";
import { participacaoDaSessao } from "@/lib/sessao";

/**
 * A VISIBILIDADE VOLTA ATRÁS, PARA SEMPRE (H-10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **SÓ A PARTICIPAÇÃO QUE ENVIOU.** Nem o casal, nem o moderador, nem o dono —
 * e isso não é uma permissão negada por configuração, é a decisão de modelagem
 * mais importante do PRD (§3.2, P2):
 *
 *   `midias.visibilidade` tem **um único caminho de escrita** no produto inteiro
 *   (`trocarVisibilidade`), e ele exige o `participacao_id` da sessão.
 *   Quando o casal tira algo do feed, ele escreve `midias.aprovacao`, que é
 *   outra coluna e outra rota.
 *
 * É o que torna "o casal nunca promove `noivos` para o feed" uma impossibilidade
 * estrutural em vez de um `if` que alguém remove daqui a um ano sem entender o
 * que estava segurando. A matriz é a **segunda** tranca: uma sessão de casal
 * recebe 403 aqui, antes de chegar ao banco.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NÃO EXISTE PRAZO. A troca vale enquanto o álbum existir (12 meses). Nenhuma
 * condição de tempo entra nesta rota — nem janela de envio, nem fim da festa:
 * mudar de ideia sobre quem vê a própria foto não expira.
 */

const CAMINHO = "/api/eventos/[id]/midias/[midiaId]/visibilidade";

function paraVisibilidade(valor: unknown): Visibilidade | null {
  // DOIS VALORES (RN-03). `ambos` não é estado — o feed já inclui o casal —, e
  // um terceiro valor é erro de `CHECK` no banco. Aqui ele é 400, antes disso.
  return valor === "feed" || valor === "noivos" ? valor : null;
}

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id, midiaId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(midiaId)) return naoEncontrado();

  const acesso = await autorizar(id, "midia.visibilidade.editar");
  if (!acesso.ok) return acesso.resposta;

  const participacao = participacaoDaSessao(acesso.sessao);
  if (!participacao) return naoEncontrado();

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();

  const nova = paraVisibilidade((corpo as Record<string, unknown>).visibilidade);
  if (!nova) return pedidoInvalido("visibilidade invalida");

  const troca = await trocarVisibilidade(acesso.evento.id, midiaId, participacao.id, nova);
  // Mídia de outra participação, de outro evento, ou já excluída: 404. Os três
  // dão a mesma resposta de propósito — 403 confirmaria que a mídia existe.
  if (!troca) return naoEncontrado();

  return NextResponse.json({
    id: troca.midia.id,
    visibilidade: troca.midia.visibilidade,
    /**
     * O valor ANTERIOR volta para o cliente porque é ele que vira
     * `media_visibility_from` no `media_visibility_changed` — o evento que
     * carrega o sinal de demanda da hipótese S1. O cliente não pode deduzi-lo:
     * ele mandou o novo, e o anterior só o servidor sabia.
     */
    visibilidade_anterior: troca.de,
    /** `false` quando o valor já era esse. A tela não dispara evento nem toast. */
    mudou: troca.mudou,
  });
});
