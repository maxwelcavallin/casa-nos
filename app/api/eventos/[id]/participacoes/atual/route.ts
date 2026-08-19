import { NextResponse } from "next/server";

import { autorizar, corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import {
  identificarParticipacao,
  MAXIMO_DO_ROTULO,
  type Identificacao,
} from "@/lib/participacoes";
import { participacaoDaSessao } from "@/lib/sessao";

/**
 * O NOME É RÓTULO, E ELE É PERGUNTADO DEPOIS (H-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `atual` E NÃO `[participacaoId]`, e a escolha do caminho é a defesa.
 *
 * Com um id na URL, esta rota precisaria conferir que o id é o da sessão — e
 * essa conferência é uma linha que alguém pode esquecer, num produto em que
 * esquecê-la deixa qualquer convidado renomear qualquer outro. Com `atual`, a
 * participação sai da SESSÃO e não há id do cliente para conferir: o caminho
 * inseguro não existe.
 *
 * (A renomeação pelo casal é outra rota — `PATCH .../participacoes/[id]/rotulo`,
 * da H-23, que é da F1.7 e ainda não existe. Ela vai precisar da conferência que
 * esta não precisa, e é por isso que são duas.)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **ESTA ROTA NÃO BLOQUEIA NADA.** Ela roda com o envio já correndo. Se falhar,
 * as fotos continuam subindo e a folha diz *"Guardamos as suas fotos. O nome a
 * gente tenta de novo."* — nunca desfaz o envio (RN-02).
 */

const CAMINHO = "/api/eventos/[id]/participacoes/atual";

function lerIdentificacao(bruto: Record<string, unknown>): Identificacao | { erro: string } {
  const rotulo = typeof bruto.rotulo === "string" ? bruto.rotulo.trim() : "";
  if (rotulo.length > MAXIMO_DO_ROTULO) return { erro: "rotulo longo demais" };

  const modo = bruto.modo_identificacao;

  if (modo === "lista") {
    if (!ehUuid(bruto.convidado_id)) return { erro: "convidado_id invalido" };
    if (rotulo === "") return { erro: "rotulo vazio" };
    return { modo: "lista", convidadoId: bruto.convidado_id, rotulo };
  }

  if (modo === "avulso") {
    if (rotulo === "") return { erro: "rotulo vazio" };
    return { modo: "avulso", rotulo };
  }

  if (modo === "retomado") return { modo: "retomado", rotulo: rotulo || null };

  return { erro: "modo_identificacao invalido" };
}

export const PATCH = rotaDeApi(CAMINHO, async (pedido, contexto) => {
  const { id } = await contexto.params;
  if (!ehUuid(id)) return naoEncontrado();

  const acesso = await autorizar(id, "participacao.renomear");
  if (!acesso.ok) return acesso.resposta;

  // Sem participação não há álbum pessoal: 404, e não 403. Um moderador que
  // caísse aqui receberia "não existe", que é a verdade — ele não tem
  // participação —, em vez de "existe e você não pode", que sugeriria que há
  // uma para ele em algum lugar.
  const participacao = participacaoDaSessao(acesso.sessao);
  if (!participacao) return naoEncontrado();

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();

  const lida = lerIdentificacao(corpo as Record<string, unknown>);
  if ("erro" in lida) return pedidoInvalido(lida.erro);

  const atualizada = await identificarParticipacao(acesso.evento.id, participacao.id, lida);
  if (!atualizada) return naoEncontrado();

  return NextResponse.json({
    rotulo: atualizada.rotulo,
    /**
     * O modo devolvido pode ser DIFERENTE do pedido: um `convidado_id` que não é
     * deste evento cai para `avulso` em vez de virar erro (`lib/participacoes.ts`).
     * O cliente usa este valor no `guest_identified` — mandar o modo pedido em
     * vez do gravado faria a dimensão `identification_mode` do GA4 contar um
     * `lista` que não existe, e o erro E3 de `metricas.md` §1.2 mediria menos do
     * que a realidade.
     */
    modo_identificacao: atualizada.modoIdentificacao,
    convidado_id: atualizada.convidadoId,
  });
});
