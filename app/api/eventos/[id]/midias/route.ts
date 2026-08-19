import { NextResponse } from "next/server";

import { autorizar, naoEncontrado, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import { lerFiltro, paginaDoPainel, rotulosRepetidos } from "@/lib/painel-midias";

/**
 * A GRADE DO PAINEL (H-14) — **todas** as mídias do evento.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTA ROTA DEVOLVE E A DO FEED NÃO: `noivos`, pendentes e recusadas.
 *
 * A fila de aprovação segura o feed e o telão; **ela nunca segura o casal**
 * (H-13). Traduzido em código: `aprovacao` não é filtro implícito nesta consulta
 * — ela só aparece quando o próprio casal escolhe o filtro "Esperando
 * aprovação". A mesma coisa vale para `visibilidade`: a foto marcada "só para os
 * noivos" está aqui porque **este é o painel dos noivos**.
 *
 * TRÊS PERGUNTAS POR FOTO, E TRÊS É O TETO (H-14): quem vê, já chegou, e —
 * só aqui — aprovação. A quarta informação viraria legenda, e legenda numa grade
 * de 6.000 itens não é lida. O vocabulário das duas primeiras é **o mesmo** da
 * tela do convidado (RN-32); nenhum nome novo nasce nesta tela.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O ENDEREÇO DA IMAGEM É DECIDIDO POR ITEM (RN-33): `feed` sai pelo endereço
 * público estável, `noivos` sai por URL assinada de 15 minutos — gerada **dentro
 * desta resposta**, que já exigiu `midia.ver.todas`.
 */

const CAMINHO = "/api/eventos/[id]/midias";

export const GET = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "midia.ver.todas");
  if (!acesso.ok) return acesso.resposta;

  const parametros = new URL(pedido.url).searchParams;
  const daParticipacao = parametros.get("participacao");
  // O id vem da URL e vai para uma coluna `uuid`: sem esta conferência um valor
  // torto estoura `22P02` e vira 500 onde a resposta certa é uma grade sem
  // filtro (`dados.md` §3).
  const filtro = lerFiltro(
    parametros.get("filtro"),
    ehUuid(daParticipacao) ? daParticipacao : null
  );

  const pagina = await paginaDoPainel(acesso.evento.id, filtro, parametros.get("cursor"));

  /**
   * O AVISO DE RÓTULOS REPETIDOS (H-23) VIAJA JUNTO, e **quem decide se ele
   * aparece é a tela**, comparando com `fim_festa_em`.
   *
   * Ele não é calculado aqui atrás de um `if` de tempo porque a regra é de
   * conteúdo, não de dado: "nunca durante a festa" é a mesma promessa de que o
   * casal não trabalha no próprio casamento. A tela é quem sabe se está
   * desenhando durante ou depois, e é lá que a decisão fica visível para quem
   * lê o código da tela.
   *
   * Só na primeira página: repetir a lista a cada rolagem seriam N consultas
   * para um aviso que aparece uma vez no topo.
   */
  const repetidos = parametros.get("cursor") ? [] : await rotulosRepetidos(acesso.evento.id);

  return NextResponse.json({
    itens: pagina.itens.map(item => ({
      id: item.id,
      participacao_id: item.participacaoId,
      rotulo: item.rotulo,
      visibilidade: item.visibilidade,
      chegada: item.chegada,
      aprovacao: item.aprovacao,
      miniatura: item.miniatura,
      previa: item.previa,
      tem_original: item.temOriginal,
    })),
    cursor: pagina.cursor,
    rotulos_repetidos: repetidos.map(r => ({
      rotulo: r.rotulo,
      participacoes: r.participacoes.map(p => ({ id: p.id, midias: p.midias })),
    })),
  });
});
