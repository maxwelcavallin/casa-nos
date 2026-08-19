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
  criarPerguntasEmLote,
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **DUAS FORMAS DE CORPO, E A SEGUNDA É A V-16.**
 *
 *   `{ pergunta, resposta? }`     uma pergunta — o caminho de sempre
 *   `{ perguntas: [ … ] }`        um lote — as cinco sugeridas, **numa
 *                                 requisição só** (PRD §V-16)
 *
 * O lote existe como forma de corpo, e não como rota nova, por dois motivos que
 * se somam: o PRD especifica esta rota, e uma rota a mais custaria entrada em
 * `lib/rotas.ts`, no contrato, na matriz de autorização e nas varreduras — tudo
 * isso para o mesmo verbo, no mesmo recurso, com a mesma permissão.
 *
 * **O TETO É CONFERIDO CONTRA O LOTE INTEIRO, ANTES DE INSERIR QUALQUER UMA.**
 * Cinco `insert` que param no terceiro deixariam o casal com duas perguntas, sem
 * explicação, e com a oferta das cinco já sumida — porque a seção passou a ter
 * pergunta. Ou entram as cinco, ou nenhuma.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/eventos/[id]/site/perguntas";

export const POST = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "site.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  const emLote = (corpo as { perguntas?: unknown } | null)?.perguntas;

  if (Array.isArray(emLote)) {
    const conferidas: DadosDaPergunta[] = [];
    const erros = [];
    for (const [i, item] of emLote.entries()) {
      const conferida = conferirPergunta(item, { parcial: false });
      // O índice vai no nome do campo: sem ele, cinco itens produzem cinco
      // mensagens sobre "pergunta" e nenhuma diz qual delas.
      for (const erro of conferida.erros) {
        erros.push({ campo: `perguntas[${i}].${erro.campo}`, mensagem: erro.mensagem });
      }
      if (conferida.erros.length === 0) {
        conferidas.push({
          ...(conferida.dados as DadosDaPergunta),
          resposta: conferida.dados.resposta ?? null,
          ordem: 0,
        });
      }
    }
    if (erros.length > 0) return pedidoInvalido({ campos: erros });
    if (conferidas.length === 0) return pedidoInvalido({ campos: [] });

    const jaExistem = await contarPerguntas(acesso.evento.id);
    if (jaExistem + conferidas.length > MAXIMO_DE_PERGUNTAS) {
      return respostaDeErro(409, "teto de perguntas atingido", {
        teto: MAXIMO_DE_PERGUNTAS,
        quantas: jaExistem,
      });
    }

    const criadas = await criarPerguntasEmLote(
      acesso.evento.id,
      conferidas.map((item, i) => ({ ...item, ordem: jaExistem + i + 1 }))
    );
    return NextResponse.json({ perguntas: criadas }, { status: 201 });
  }

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
