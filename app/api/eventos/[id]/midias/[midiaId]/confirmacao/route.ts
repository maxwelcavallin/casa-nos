import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import { participacaoDaSessao } from "@/lib/sessao";
import { confirmarFaixa, type FaixaDeEnvio } from "@/lib/midias";

/**
 * O CARIMBO DE UMA FAIXA (H-06).
 *
 * É a segunda metade do contrato de rede: o cliente faz `PUT` direto no R2 com
 * a URL assinada e depois avisa aqui. Sem este aviso o objeto existiria no balde
 * e o banco continuaria dizendo `intencao` — a foto apareceria como perdida
 * numa consulta em que ela não está perdida, e a reconciliação teria trabalho
 * todo dia por nada.
 *
 * IDEMPOTENTE POR `(midia_id, faixa)`. Repetir a confirmação **não é erro**: a
 * fila reconfirma quando não tem certeza de que a primeira chegou, e é assim que
 * ela sobrevive a uma resposta perdida no meio do caminho. O corpo diz se algo
 * mudou (`mudou: false`), e é isso que impede `media_upload_succeeded` de
 * disparar duas vezes (RN-28).
 *
 * DUAS FAIXAS, DOIS CARIMBOS, E ELES NÃO SÃO A MESMA COISA: prévia faltando é
 * **perda** (RN-14); original faltando é **qualidade degradada** (RN-15). Os
 * dois números nunca são somados em nenhuma tela.
 */

const CAMINHO = "/api/eventos/[id]/midias/[midiaId]/confirmacao";

function paraFaixa(valor: unknown): FaixaDeEnvio | null {
  return valor === "previa" || valor === "original" ? valor : null;
}

function paraInteiroOpcional(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
  return Math.trunc(valor);
}

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id, midiaId } = await contexto.params;
  // Os DOIS parâmetros são validados antes de qualquer consulta. Um `midiaId`
  // torto estoura `22P02` no Postgres e vira 500 onde a resposta certa é 404
  // (`dados.md` §3) — e esta rota é chamada por um aparelho com rede ruim, que é
  // exatamente quem manda coisa truncada.
  if (!ehUuid(id) || !ehUuid(midiaId)) return naoEncontrado();

  const acesso = await autorizar(id, "midia.enviar");
  if (!acesso.ok) return acesso.resposta;
  const participacao = participacaoDaSessao(acesso.sessao);
  if (!participacao) return naoEncontrado();

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();

  const bruto = corpo as Record<string, unknown>;
  const faixa = paraFaixa(bruto.faixa);
  if (!faixa) return pedidoInvalido("faixa invalida");

  /**
   * A CONFIRMAÇÃO EXIGE A PARTICIPAÇÃO DONA, e não só uma participação válida.
   *
   * `confirmarFaixa` recebe o `participacao_id` da SESSÃO e o usa na cláusula
   * `where`. Sem isso, qualquer convidado do mesmo casamento poderia carimbar a
   * mídia de outro — e um carimbo falso é pior que uma foto perdida: a foto
   * deixa de aparecer na consulta de perda, e ninguém procura por ela.
   *
   * Mídia de outro evento ou de outra participação devolve `null`, que vira 404
   * (nunca 403: 403 confirmaria que a mídia existe).
   */
  const resultado = await confirmarFaixa(
    acesso.evento.id,
    midiaId,
    participacao.id,
    faixa,
    {
      bytesPrevia: paraInteiroOpcional(bruto.bytes_previa),
      largura: paraInteiroOpcional(bruto.largura),
      altura: paraInteiroOpcional(bruto.altura),
    }
  );

  if (!resultado) return naoEncontrado();

  return NextResponse.json({
    midia_id: resultado.midia.id,
    faixa,
    // `false` significa "já estava confirmada". O cliente não dispara evento de
    // sucesso de novo, e o servidor não trata isso como erro.
    mudou: resultado.mudou,
    previa_confirmada: resultado.midia.previaArmazenadaEm !== null,
    original_confirmado: resultado.midia.originalArmazenadaEm !== null,
  });
});
