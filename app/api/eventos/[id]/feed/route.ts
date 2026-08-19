import { NextResponse } from "next/server";

import { autorizar, naoEncontrado, rotaDeApi } from "@/lib/api";
import { lerCursor, paginaDoFeed } from "@/lib/feed";
import { ehUuid } from "@/lib/ids";

/**
 * O FEED DA FESTA (H-11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTA RESPOSTA **NÃO** TEM, e é o critério de aceite mais fácil de
 * quebrar sem perceber: **nenhum campo de estado**, em veículo nenhum (RN-32e).
 *
 * "Quem vê?" é constante aqui — tudo que está no feed está no feed. "Já
 * chegou?" também — o feed só contém o que já chegou. Um campo de estado numa
 * grade em que ele nunca varia é ruído em 6.000 cards, e é o que faria as duas
 * perguntas vazarem para uma tela onde nenhuma delas tem resposta variável.
 * Elas existem só onde variam: "as minhas fotos" e o painel.
 *
 * `test/feed-contrato.test.ts` varre a resposta e falha se `visibilidade`,
 * `chegada` ou `aprovacao` aparecerem.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A GRADE CARREGA **MINIATURA** (400 px), e a prévia (1600 px) só vai junto para
 * quando a foto abrir. Sem essa separação, uma grade de 30 fotos baixa 9 MB no
 * mesmo uplink que o `escopo-core.md` §7 aponta como ponto de quebra — e o teto
 * de "abrir o álbum em 3 s com 6.000 itens" (B16) fica inalcançável.
 */

const CAMINHO = "/api/eventos/[id]/feed";

export const GET = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "feed.ver");
  if (!acesso.ok) return acesso.resposta;

  const cursor = lerCursor(new URL(pedido.url).searchParams.get("cursor"));
  const pagina = await paginaDoFeed(acesso.evento.id, cursor);

  return NextResponse.json({
    itens: pagina.itens.map(item => ({
      id: item.id,
      lote_id: item.loteId,
      // Quantas mídias no lote inteiro — não a fração que caiu nesta página.
      // É a contagem do cartão de rajada ("+29").
      no_lote: item.noLote,
      // O rótulo viaja porque ele é o `aria-label` do card e o texto do cartão
      // de rajada. Ele NÃO é desenhado sobre a miniatura: num tile de 104 px,
      // um nome de 40 caracteres obrigaria a truncar, e nome truncado de
      // terceiro é pior que nome ausente.
      rotulo: item.rotulo,
      miniatura: item.miniatura,
      previa: item.previa,
      largura: item.largura,
      altura: item.altura,
    })),
    cursor: pagina.cursor,
  });
});
