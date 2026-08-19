import { NextResponse } from "next/server";

import { autorizar, naoEncontrado, rotaDeApi } from "@/lib/api";
import { lerCursor, paginaDeMinhas } from "@/lib/feed";
import { ehUuid } from "@/lib/ids";
import { participacaoDaSessao } from "@/lib/sessao";

/**
 * "AS MINHAS FOTOS" (H-08) — e o contrato desta resposta é a história.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUAS PERGUNTAS, DOIS CAMPOS SEPARADOS (RN-32a, e é contrato, não estilo):
 *
 *   `visibilidade` → "quem vê isso?"   `feed` · `noivos`
 *   `chegada`      → "já chegou?"      `chegando` · `ainda_subindo` · `completa`
 *
 * **Juntar as duas num campo único de "estado" obriga a interface a desjuntar, e
 * é assim que uma das duas some.** A que some é sempre a mesma — "quem vê
 * isso?" —, porque o progresso do envio é o que parece urgente na hora de
 * desenhar. E ela é justamente a única pergunta que o convidado de fato faz
 * (`pesquisa.md` §6.2), e a razão de o botão secundário existir.
 *
 * `aprovacao` **NÃO ESTÁ AQUI**, em campo nenhum (RN-07). O convidado não vê a
 * fila de moderação — nem selo, nem "em análise", nem contador, nem tempo
 * estimado. Para ele, enviado é enviado. `test/minhas-contrato.test.ts` varre a
 * resposta e falha se a palavra aparecer.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `originais_pendentes` é o que decide se o resumo do topo existe. Zero → ele
 * **não** existe, e não vira "0 fotos subindo": aviso permanente vira mobília e
 * ninguém lê.
 */

const CAMINHO = "/api/eventos/[id]/minhas";

export const GET = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "album.minhas.ver");
  if (!acesso.ok) return acesso.resposta;

  /**
   * O ALCANCE DA MATRIZ VIRA A CLÁUSULA `where`.
   *
   * `album.minhas.ver` é `proprias` — não existe álbum de outra pessoa —, e é
   * aqui que `proprias` deixa de ser uma palavra e vira `participacao_id = ...`.
   * A matriz diz **se** pode; a rota diz **sobre o quê**, e as duas metades
   * precisam existir: uma matriz sem esta linha autorizaria "ver minhas fotos" e
   * devolveria as de todo mundo.
   */
  const participacao = participacaoDaSessao(acesso.sessao);
  if (!participacao) return naoEncontrado();

  const cursor = lerCursor(new URL(pedido.url).searchParams.get("cursor"));
  const pagina = await paginaDeMinhas(acesso.evento.id, participacao.id, cursor);

  return NextResponse.json({
    itens: pagina.itens.map(item => ({
      id: item.id,
      lote_id: item.loteId,
      visibilidade: item.visibilidade,
      chegada: item.chegada,
      miniatura: item.miniatura,
      previa: item.previa,
    })),
    cursor: pagina.cursor,
    total: pagina.total,
    originais_pendentes: pagina.originaisPendentes,
  });
});
