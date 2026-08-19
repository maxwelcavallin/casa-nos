import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import {
  atualizarConvidado,
  excluirConvidado,
  MAXIMO_DO_NOME,
  type AtualizacaoDeConvidado,
} from "@/lib/convidados";
import { ehUuid } from "@/lib/ids";

/**
 * Editar e apagar um slot da lista (H-03).
 *
 * OS DOIS PARÂMETROS SÃO VALIDADOS ANTES DE QUALQUER CONSULTA (`dados.md` §3).
 * `[convidadoId]` vem de uma tela de painel, mas ele também vem de um link
 * colado, de um recarregamento com a URL editada e de um cliente de e-mail que
 * quebrou a linha — e uuid torto estoura `22P02` no Postgres, que vira 500 onde
 * a resposta certa é 404.
 */

const CAMINHO = "/api/eventos/[id]/convidados/[convidadoId]";

function paraAusente(valor: unknown): boolean | null | undefined {
  // TRI-ESTADO, e ele é o dado: `undefined` não mexe, `null` limpa, booleano
  // grava. `null` significa "não informado" na migration 0004, e é DIFERENTE de
  // `false` — o denominador de P exclui só quem foi marcado ausente de verdade.
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  return valor === true;
}

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id, convidadoId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(convidadoId)) return naoEncontrado();

  const acesso = await autorizar(id, "convidados.editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const bruto = corpo as Record<string, unknown>;

  const mudanca: AtualizacaoDeConvidado = { ausente: paraAusente(bruto.ausente) };

  if (bruto.nome !== undefined) {
    const nome = typeof bruto.nome === "string" ? bruto.nome.trim() : "";
    if (nome === "") return pedidoInvalido("nome vazio");
    if (nome.length > MAXIMO_DO_NOME) return pedidoInvalido("nome longo demais");
    mudanca.nome = nome;
  }

  if (bruto.pessoas_no_slot !== undefined) {
    const pessoas = Number(bruto.pessoas_no_slot);
    // O `CHECK` do banco já recusa (`pessoas_no_slot >= 1`), e isso viraria 500.
    // A conferência aqui é o que faz o zero digitado sair como 400 com motivo.
    if (!Number.isSafeInteger(pessoas) || pessoas < 1) {
      return pedidoInvalido("pessoas_no_slot invalido");
    }
    mudanca.pessoasNoSlot = pessoas;
  }

  const convidado = await atualizarConvidado(acesso.evento.id, convidadoId, mudanca);
  // Slot de OUTRO evento devolve `null` e vira 404, nunca 403: 403 confirmaria
  // que o slot existe, e a lista de convidados do outro casamento não é
  // informação que este produto deva dar.
  if (!convidado) return naoEncontrado();

  return NextResponse.json({
    id: convidado.id,
    nome: convidado.nome,
    pessoas_no_slot: convidado.pessoasNoSlot,
    ausente: convidado.ausente,
  });
});

export const DELETE = rotaDeApi(CAMINHO, async (_pedido, contexto) => {
  const { id, convidadoId } = await contexto.params;
  if (!ehUuid(id) || !ehUuid(convidadoId)) return naoEncontrado();

  const acesso = await autorizar(id, "convidados.editar");
  if (!acesso.ok) return acesso.resposta;

  /**
   * EXCLUSÃO LÓGICA, e o slot **continua contando** na medição da janela se já
   * tiver mídia associada (H-03). A tela diz isso antes de apagar:
   * *"Se ela já mandou fotos, elas continuam no álbum e continuam contando."*
   *
   * Uma exclusão física apagaria o denominador de uma medição já feita, e
   * nenhum número da noite voltaria a bater — sem nenhum erro aparecer.
   */
  const apagou = await excluirConvidado(acesso.evento.id, convidadoId);
  if (!apagou) return naoEncontrado();

  return new NextResponse(null, { status: 204 });
});
