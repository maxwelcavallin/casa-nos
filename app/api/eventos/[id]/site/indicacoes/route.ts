import { NextResponse } from "next/server";

import {
  autorizar,
  corpoJson,
  naoEncontrado,
  pedidoInvalido,
  respostaDeErro,
  rotaDeApi,
} from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import {
  conferirIndicacao,
  contarIndicacoes,
  criarIndicacao,
  MAXIMO_DE_INDICACOES,
  type DadosDaIndicacao,
} from "@/lib/indicacoes";

/**
 * CRIAR UMA INDICAÇÃO — hotel ou dica (v1.0, V-06).
 *
 * **O TETO RESPONDE 409 COM O NÚMERO NO CORPO**, e não um 400 genérico. A
 * diferença importa na tela: 409 com `{ teto: 20 }` vira "vocês já têm 20
 * indicações — apague uma para pôr outra", enquanto um 400 sem número vira
 * "erro", que não diz o que fazer.
 *
 * A conferência do teto acontece **no servidor**, e não só no botão: o botão
 * desabilitado é conveniência, e um `POST` montado à mão passa por cima dele.
 */

const CAMINHO = "/api/eventos/[id]/site/indicacoes";

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  const { dados, erros } = conferirIndicacao(corpo, { parcial: false });
  if (erros.length > 0) return pedidoInvalido({ campos: erros });

  const quantas = await contarIndicacoes(acesso.evento.id);
  if (quantas >= MAXIMO_DE_INDICACOES) {
    return respostaDeErro(409, "teto de indicacoes atingido", {
      teto: MAXIMO_DE_INDICACOES,
      quantas,
    });
  }

  const indicacao = await criarIndicacao(acesso.evento.id, {
    // `conferirIndicacao` com `parcial: false` garante os dois obrigatórios; o
    // `as` documenta isso em vez de repetir a checagem e deixar as duas versões
    // divergirem.
    ...(dados as DadosDaIndicacao),
    // A ordem padrão põe a nova no fim, e não no começo: quem acabou de
    // cadastrar o quinto hotel não espera que ele apareça antes dos quatro.
    ordem: dados.ordem ?? quantas + 1,
  });

  return NextResponse.json(
    {
      id: indicacao.id,
      tipo: indicacao.tipo,
      titulo: indicacao.titulo,
      referencia: indicacao.referencia,
      descricao: indicacao.descricao,
      url: indicacao.url,
      ordem: indicacao.ordem,
    },
    { status: 201 }
  );
});
