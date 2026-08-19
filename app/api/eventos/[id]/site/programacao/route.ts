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
  conferirMomento,
  contarMomentos,
  criarMomento,
  MAXIMO_DE_MOMENTOS,
  type DadosDoMomento,
} from "@/lib/conteudo-do-site";
import { ehUuid } from "@/lib/ids";

/**
 * CRIAR UM MOMENTO DA PROGRAMAÇÃO (v1.0, V-08).
 *
 * **O TETO RESPONDE 409 COM O NÚMERO NO CORPO.** Acima de 12 momentos a seção
 * deixa de ser programação e vira agenda, e uma lista de 40 linhas num celular é
 * a mesma informação ausente. O 409 com `{ teto: 12 }` vira uma frase que diz o
 * que fazer; um 400 sem número vira "erro".
 *
 * **A HORA É OPCIONAL**, e nulo significa "momento sem horário anunciado" — "a
 * festa vai até o fim" não tem horário, e o casal precisa poder dizer isso.
 */

const CAMINHO = "/api/eventos/[id]/site/programacao";

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  const { dados, erros } = conferirMomento(corpo, { parcial: false });
  if (erros.length > 0) return pedidoInvalido({ campos: erros });

  // A conferência é do SERVIDOR: o botão desabilitado é conveniência, e um
  // `POST` montado à mão passa por cima dele.
  const quantos = await contarMomentos(acesso.evento.id);
  if (quantos >= MAXIMO_DE_MOMENTOS) {
    return respostaDeErro(409, "teto de momentos atingido", {
      teto: MAXIMO_DE_MOMENTOS,
      quantos,
    });
  }

  const momento = await criarMomento(acesso.evento.id, {
    ...(dados as DadosDoMomento),
    hora: dados.hora ?? null,
    descricao: dados.descricao ?? null,
    // O novo entra no fim: quem acabou de cadastrar o quinto momento não espera
    // que ele apareça antes dos quatro.
    ordem: dados.ordem ?? quantos + 1,
  });

  return NextResponse.json(momento, { status: 201 });
});
