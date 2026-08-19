import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { agoraNoServidor, horaDoInstante } from "@/lib/datas";
import { ehUuid } from "@/lib/ids";
import { durante } from "@/lib/janela";
import {
  aprovarTodasAsPendentes,
  moderarEmLote,
  paginaDaFila,
  TETO_DO_LOTE,
  type AcaoDeModeracao,
} from "@/lib/moderacao";
import { acessoDaSessao } from "@/lib/sessao";

/**
 * MODERAR EM LOTE (H-13). **"Aprovar as 84" é um toque e UMA requisição.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUAS FORMAS DE PEDIR, E AS DUAS SÃO LEGÍTIMAS:
 *
 *   `{ acao, ids: [...] }`  as fotos que estão na tela
 *   `{ acao: "aprovada", todas: true }`  tudo que está pendente
 *
 * A segunda existe porque a primeira não cabe: 400 uuid num corpo são 15 KB pelo
 * wifi de um salão às 23h, e a tela nem sempre carregou a página inteira. O que
 * a pessoa pediu foi "libera tudo", e mandar a lista seria traduzir mal o pedido
 * dela — se chegarem 3 fotos entre o toque e a requisição, ela quis liberar as
 * 403.
 *
 * **`todas` só vale para APROVAR.** Recusar tudo de uma vez não é uma intenção
 * que alguém tenha às 23h; é um toque errado com consequência de esvaziar a
 * parede da festa inteira, e ele não existe nesta rota.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A RESPOSTA TRAZ OS DOIS NÚMEROS (critério da H-13): quantas foram e quantas
 * não. A tela escreve *"380 fotos foram aprovadas. 20 não deram certo e
 * continuam na lista."* — nunca só o que deu errado, e nunca a palavra "falhou".
 * A faixa é de aviso, não de erro: um resultado que é 95% sucesso não se pinta
 * de vermelho.
 */

const CAMINHO = "/api/eventos/[id]/midias/moderacao";

function paraAcao(valor: unknown): AcaoDeModeracao | null {
  return valor === "aprovada" || valor === "recusada" ? valor : null;
}

/**
 * A FILA — o que está esperando, mais velho primeiro.
 *
 * É a única grade do produto que **não** é a mais nova primeiro, e é de
 * propósito: fila é fila, e quem espera há mais tempo aparece antes. O `total` e
 * a `mais_antiga_em` viajam junto porque os dois são texto de tela — "Aprovar as
 * 400" e "A mais antiga chegou às 22h14" —, e buscá-los numa segunda requisição
 * faria o botão principal aparecer depois da grade.
 */
export const GET = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "midia.moderar");
  if (!acesso.ok) return acesso.resposta;

  const pagina = await paginaDaFila(
    acesso.evento.id,
    new URL(pedido.url).searchParams.get("cursor")
  );

  return NextResponse.json({
    itens: pagina.itens.map(item => ({
      id: item.id,
      rotulo: item.rotulo,
      miniatura: item.miniatura,
      previa: item.previa,
    })),
    cursor: pagina.cursor,
    total: pagina.total,
    /**
     * A hora vem FORMATADA DAQUI, no fuso do evento (regra §5 do `stack.md`).
     * O computador que abre a fila às 23h é emprestado do salão e pode estar em
     * qualquer fuso — "chegou às 19h14" num casamento que começou às 18h faria
     * quem lê concluir que a fila está parada há quatro horas.
     */
    mais_antiga_hora: pagina.maisAntigaEm
      ? horaDoInstante(new Date(pagina.maisAntigaEm), acesso.evento.fuso)
      : null,
    // O modo atual, para o interruptor nascer na posição certa sem uma segunda
    // requisição. `fila` = a moderação está ligada.
    modo_moderacao: acesso.evento.modoModeracao,
  });
});

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "midia.moderar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const bruto = corpo as Record<string, unknown>;

  const acao = paraAcao(bruto.acao);
  if (!acao) return pedidoInvalido("acao invalida");

  /**
   * Quem moderou. `moderada_por` aponta para `evento_acessos`, e o moderador
   * designado é um acesso — é assim que o casal descobre depois que foi o
   * padrinho quem aprovou, sem uma tabela de auditoria.
   *
   * `null` quando quem modera é uma participação com papel `casal` (o próprio
   * casal usando o álbum). A coluna aceita nulo de propósito.
   */
  const doAcesso = acessoDaSessao(acesso.sessao);

  const agora = agoraNoServidor();
  /**
   * **O BLOQUEIO 2 DO VERDE É CALCULADO AQUI, NO SERVIDOR** (`metricas.md` §4).
   *
   * `moderation_during_event` decide se o resultado da festa vale. Deixá-lo para
   * o cliente calcular seria confiar o veredito ao relógio de um computador
   * emprestado — e a janela da festa (RN-10) é dado do evento, não do aparelho.
   * Sai na resposta, e a tela só repassa ao GA4 o que veio daqui.
   */
  const duranteAFesta = durante(acesso.evento, agora);

  if (bruto.todas === true) {
    if (acao !== "aprovada") return pedidoInvalido("todas so vale para aprovar");
    const alteradas = await aprovarTodasAsPendentes(
      acesso.evento.id,
      doAcesso?.id ?? null
    );
    return NextResponse.json({
      alteradas,
      nao_alteradas: [],
      durante_a_festa: duranteAFesta,
    });
  }

  const ids = Array.isArray(bruto.ids) ? bruto.ids : null;
  if (!ids || ids.length === 0) return pedidoInvalido("ids vazio");
  if (ids.length > TETO_DO_LOTE) return pedidoInvalido("lote grande demais");
  // Um uuid torto no meio de 400 estoura `22P02` e vira 500 no lugar de 400
  // (`dados.md` §3). A lista vem de uma tela, mas a tela vem de um navegador.
  if (!ids.every(ehUuid)) return pedidoInvalido("id invalido na lista");

  const resultado = await moderarEmLote(
    acesso.evento.id,
    ids as string[],
    acao,
    doAcesso?.id ?? null
  );

  return NextResponse.json({
    alteradas: resultado.alteradas,
    nao_alteradas: resultado.naoAlteradas,
    durante_a_festa: duranteAFesta,
  });
});
