import { NextResponse } from "next/server";

import { corpoJson, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { pode } from "@/lib/autorizacao";
import { buscarEventoPorId } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { excedeuLimite, permitir } from "@/lib/limite-taxa";
import { registrarErro, type TipoDeErro } from "@/lib/observabilidade";
import { participacaoDaSessao, sessaoDoEvento } from "@/lib/sessao";

/**
 * O APARELHO CONTA O QUE DEU ERRADO COM ELE (H-18).
 *
 * "Falha de `PUT` no R2 relatada pelo cliente vira registro no servidor, com
 * `error_kind`." É a única forma de saber que o balde recusou um objeto: o `PUT`
 * vai do celular direto para o R2, sem passar por nós, e um 403 lá é invisível
 * daqui. Sem esta rota, a foto sumiria e o log do servidor não teria uma linha
 * sequer sobre ela.
 *
 * O QUE ELA NÃO ACEITA: texto livre longo, nome, telefone, rótulo. A mensagem é
 * truncada e passa por `sanearMensagem`, que remove token, e-mail e sequência
 * longa de dígitos. O corpo desta rota vem do navegador, ou seja, de qualquer
 * um — tratá-lo como confiável seria deixar um estranho escrever no nosso
 * registro de diagnóstico.
 *
 * 202, sempre que aceito: é um relato, não uma transação. O aparelho que manda
 * isto está com problema de rede; fazê-lo esperar uma confirmação de escrita
 * seria cobrar dele justamente o que ele não tem.
 */

const CAMINHO = "/api/interno/erro-cliente";

/** Trinta relatos por hora por participação: uma fila de 30 fotos falhando toda. */
const LIMITE = 30;
const JANELA_MS = 60 * 60 * 1000;

const TIPOS: TipoDeErro[] = ["rede", "servidor", "arquivo"];

export const POST = rotaDeApi(CAMINHO, async pedido => {
  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const bruto = corpo as Record<string, unknown>;

  const eventoId = bruto.evento_id;
  if (!ehUuid(eventoId)) return pedidoInvalido("evento_id invalido");

  const evento = await buscarEventoPorId(eventoId);
  if (!evento) return pedidoInvalido("evento_id invalido");

  /**
   * EXIGE PARTICIPAÇÃO ATIVA, e a permissão vem da matriz como qualquer outra.
   *
   * Sem isso, esta rota seria um escrivão público: qualquer um encheria a tabela
   * de erro do casamento com o que quisesse, e a consulta da noite da festa —
   * que é para onde o dono vai olhar às 23h — ficaria inútil justamente quando
   * ela é o único instrumento.
   */
  const sessao = await sessaoDoEvento(evento.id);
  if (pode(sessao, "interno.erro") === "nao") {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  // A chave do limite é a PARTICIPAÇÃO, e não o IP: o relato vem de quem está
  // participando, e uma fila de 30 fotos falhando toda é o volume legítimo.
  const participacao = participacaoDaSessao(sessao);
  const chave = `${evento.id}:${participacao?.id ?? "sem-participacao"}`;
  if (!permitir(chave, LIMITE, JANELA_MS)) return excedeuLimite();

  const tipoErro = TIPOS.find(t => t === bruto.tipo_erro) ?? "rede";
  const midiaId = ehUuid(bruto.midia_id) ? bruto.midia_id : null;

  await registrarErro({
    origem: "cliente",
    rota: CAMINHO,
    sessaoTipo: sessao.tipo,
    eventoId: evento.id,
    tipoErro,
    classe: "relato-do-aparelho",
    mensagem: typeof bruto.mensagem === "string" ? bruto.mensagem : null,
    midiaId,
  });

  return NextResponse.json({ registrado: true }, { status: 202 });
});
