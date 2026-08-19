import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import { atualizarIndicacao, conferirIndicacao, excluirIndicacao } from "@/lib/indicacoes";

/**
 * EDITAR E APAGAR UMA INDICAÇÃO (v1.0, V-06).
 *
 * **OS DOIS PARÂMETROS SÃO VALIDADOS ANTES DE QUALQUER CONSULTA** (`dados.md`
 * §3). `[indicacaoId]` vem de uma tela de painel, mas ele também vem de um link
 * colado e de um recarregamento com a URL editada — e uuid torto estoura `22P02`
 * no Postgres, que vira 500 onde a resposta certa é 404.
 *
 * **`PATCH` É PARCIAL**: campo ausente não mexe no que está gravado. Sem isso,
 * salvar só o link apagaria a descrição, e o casal não saberia por quê. E onde o
 * nulo é um valor — limpar o link de um hotel é uma edição legítima —, mandar
 * `null` explícito limpa.
 */

const CAMINHO = "/api/eventos/[id]/site/indicacoes/[indicacaoId]";

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id, indicacaoId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(indicacaoId)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  const { dados, erros } = conferirIndicacao(corpo, { parcial: true });
  if (erros.length > 0) return pedidoInvalido({ campos: erros });

  const indicacao = await atualizarIndicacao(acesso.evento.id, indicacaoId, dados);
  // Indicação de OUTRO evento devolve `null` e vira 404, nunca 403: 403
  // confirmaria que ela existe, e a lista de hotéis do outro casamento não é
  // informação que este produto deva dar.
  if (!indicacao) return naoEncontrado();

  return NextResponse.json({
    id: indicacao.id,
    tipo: indicacao.tipo,
    titulo: indicacao.titulo,
    referencia: indicacao.referencia,
    descricao: indicacao.descricao,
    url: indicacao.url,
    ordem: indicacao.ordem,
  });
});

export const DELETE = rotaDeApi(CAMINHO, async (_pedido, contexto) => {
  const { id, indicacaoId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(indicacaoId)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  /**
   * EXCLUSÃO LÓGICA (`dados.md` §7): é conteúdo que o casal escreveu e pode
   * querer de volta. A confirmação na tela **nomeia o item** ("Apagar o Hotel
   * Vermont?"), e não "Tem certeza?".
   */
  const apagou = await excluirIndicacao(acesso.evento.id, indicacaoId);
  if (!apagou) return naoEncontrado();

  return new NextResponse(null, { status: 204 });
});
