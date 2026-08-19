import { NextResponse } from "next/server";

import { pode, type Acao, type Alcance } from "@/lib/autorizacao";
import { buscarEventoPorId, type Evento } from "@/lib/eventos";
import { registrarErro } from "@/lib/observabilidade";
import { sessaoDoEvento, type Sessao } from "@/lib/sessao";

/**
 * O formato de erro do produto, e o invólucro que garante que ele saia sempre.
 *
 * DUAS REGRAS DA CASA VIRAM CÓDIGO AQUI (`stack.md` §5):
 *
 * - **Erro responde status correto e corpo `{ erro, detalhe? }`.** Nunca 200 com
 *   `{ sucesso: false }` — um 200 mentiroso passa por qualquer cliente, por
 *   qualquer retentativa e por qualquer painel de monitoramento sem acender
 *   nada, e o defeito só aparece na tela do convidado.
 * - **404 é 404.** Id malformado, recurso inexistente e recurso de OUTRO evento
 *   dão os três a mesma resposta. Distinguir "não existe" de "existe e não é
 *   seu" entrega a lista de ids do outro casamento a quem estiver adivinhando.
 */

export type CorpoDeErro = { erro: string; detalhe?: unknown };

export function respostaDeErro(
  status: number,
  erro: string,
  detalhe?: unknown
): NextResponse<CorpoDeErro> {
  return NextResponse.json(detalhe === undefined ? { erro } : { erro, detalhe }, {
    status,
  });
}

export const naoEncontrado = () => respostaDeErro(404, "nao encontrado");
export const proibido = () => respostaDeErro(403, "sem permissao");
export const pedidoInvalido = (detalhe?: unknown) =>
  respostaDeErro(400, "pedido invalido", detalhe);

/* ------------------------------------------------------------------ *
 * Autorização — evento, sessão e matriz, num passo só
 * ------------------------------------------------------------------ */

export type Autorizada = {
  ok: true;
  evento: Evento;
  sessao: Sessao;
  /** O alcance da matriz. A rota USA isto: `"proprias"` não é `"todas"`. */
  alcance: Alcance;
};

export type Recusada = { ok: false; resposta: NextResponse<CorpoDeErro> };

/**
 * Resolve o evento, resolve a sessão e consulta a matriz — nesta ordem.
 *
 * **Nenhuma rota decide perfil por conta própria.** `test/autorizacao-matriz.test.ts`
 * varre `app/api/**` e quebra o CI se encontrar um `if` sobre `sessao.tipo`. O
 * que a rota faz com o `alcance` é outra coisa: `"proprias"` obriga a rota a
 * acrescentar `participacao_id = ...` na consulta, e isso é regra de negócio,
 * não decisão de perfil.
 *
 * O `eventoId` chega já validado como uuid pela rota — a validação de formato
 * vem antes de qualquer consulta (`dados.md` §3), e ela mora na rota de
 * propósito, onde o teste de varredura consegue vê-la.
 */
export async function autorizar(
  eventoId: string,
  acao: Acao
): Promise<Autorizada | Recusada> {
  const evento = await buscarEventoPorId(eventoId);
  if (!evento) return { ok: false, resposta: naoEncontrado() };

  const sessao = await sessaoDoEvento(evento.id);
  const alcance = pode(sessao, acao);
  if (alcance === "nao") {
    // 403 e não 404: o evento existe e o portador chegou até ele. O que falta é
    // poder. Trocar por 404 aqui esconderia de quem tem um link de moderador o
    // motivo de a tela não abrir.
    return { ok: false, resposta: proibido() };
  }

  return { ok: true, evento, sessao, alcance };
}

/* ------------------------------------------------------------------ *
 * O invólucro
 * ------------------------------------------------------------------ */

type Manipulador = (
  pedido: Request,
  contexto: { params: Promise<Record<string, string>> }
) => Promise<Response>;

/**
 * Toda rota de API é embrulhada aqui, e o motivo é a H-18.
 *
 * "Toda rota de API captura exceção e registra: rota, `evento_id`, tipo de
 * sessão, e o erro." Escrito como regra, isso vira trinta `try/catch` copiados,
 * e o trigésimo primeiro não é escrito. Escrito como invólucro, é impossível
 * uma rota nova nascer sem — porque ela nasce chamando isto.
 *
 * O `caminho` é o DECLARADO (`lib/rotas.ts`), nunca `pedido.url`: a URL carrega
 * slug, token e id de mídia, e slug e token são identificador legível. O que vai
 * para a tabela de erro tem a mesma régua do que vai para o GA4.
 */
export function rotaDeApi(caminho: string, manipulador: Manipulador): Manipulador {
  return async (pedido, contexto) => {
    try {
      return await manipulador(pedido, contexto);
    } catch (falha) {
      const parametros = await contexto.params.catch(() => ({}) as Record<string, string>);
      await registrarErro({
        origem: "servidor",
        rota: caminho,
        sessaoTipo: "desconhecida",
        eventoId: typeof parametros.id === "string" ? parametros.id : null,
        tipoErro: "servidor",
        classe: falha instanceof Error ? falha.name : typeof falha,
        mensagem: falha instanceof Error ? falha.message : String(falha),
        httpStatus: 500,
      });
      return respostaDeErro(500, "nao foi possivel concluir agora");
    }
  };
}

/**
 * Lê o corpo JSON sem deixar um corpo malformado virar 500.
 *
 * `await pedido.json()` estoura em corpo vazio e em JSON quebrado, e os dois
 * chegam sozinhos: um `fetch` do aparelho que perdeu a rede no meio do envio
 * manda corpo truncado. Isso é 400, não 500 — e a diferença importa porque a
 * fila do cliente trata 5xx como "tente de novo" e 4xx como "não adianta".
 */
export async function corpoJson(pedido: Request): Promise<unknown | null> {
  try {
    return await pedido.json();
  } catch {
    return null;
  }
}
