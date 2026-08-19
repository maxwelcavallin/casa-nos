import { NextResponse } from "next/server";

import {
  autorizar,
  corpoJson,
  naoEncontrado,
  pedidoInvalido,
  respostaDeErro,
  rotaDeApi,
} from "@/lib/api";
import {
  conferirPergunta,
  contarPerguntas,
  criarPergunta,
  MAXIMO_DE_PERGUNTAS,
  type DadosDaPergunta,
} from "@/lib/conteudo-do-site";
import { ehUuid } from "@/lib/ids";

/**
 * CRIAR UMA PERGUNTA (v1.0, V-09).
 *
 * **A RESPOSTA É OPCIONAL, E ISSO É O MECANISMO.** Nulo significa "sugerida,
 * ainda não respondida", e nesse estado a pergunta **não renderiza no site**. É
 * o que torna seguro sugerir as cinco perguntas da persona (V-16): elas nascem
 * sem resposta e ficam invisíveis até a noiva responder.
 *
 * **O TETO RESPONDE 409 COM O NÚMERO NO CORPO** (15).
 */

const CAMINHO = "/api/eventos/[id]/site/perguntas";

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  const { dados, erros } = conferirPergunta(corpo, { parcial: false });
  if (erros.length > 0) return pedidoInvalido({ campos: erros });

  const quantas = await contarPerguntas(acesso.evento.id);
  if (quantas >= MAXIMO_DE_PERGUNTAS) {
    return respostaDeErro(409, "teto de perguntas atingido", {
      teto: MAXIMO_DE_PERGUNTAS,
      quantas,
    });
  }

  const pergunta = await criarPergunta(acesso.evento.id, {
    ...(dados as DadosDaPergunta),
    resposta: dados.resposta ?? null,
    ordem: dados.ordem ?? quantas + 1,
  });

  return NextResponse.json(pergunta, { status: 201 });
});
