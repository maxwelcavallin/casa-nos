import { NextResponse } from "next/server";

import { revogarAcesso } from "@/lib/acessos";
import { corpoJson, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { ehUuid } from "@/lib/ids";
import { acessoDaSessao, limparCookieDeAcesso, sessaoDoEvento } from "@/lib/sessao";

/**
 * SAIR — e sair de verdade.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **DUAS COISAS, E A SEGUNDA É A QUE FALTA NA MAIORIA DOS PRODUTOS:** apagar o
 * cookie **e revogar a linha**. Só apagar o cookie deixa o token vivo por trinta
 * dias — e ele continua valendo em qualquer lugar onde alguém o tenha copiado.
 * Num celular emprestado, "sair" que só limpa o cookie é uma promessa falsa.
 *
 * Revoga **só esta sessão**, e não todas: o casal são duas pessoas em dois
 * aparelhos, e sair no celular da noiva não pode derrubar o do noivo. Quem
 * derruba todas é a troca de senha, e ali é o comportamento certo.
 *
 * **RESPONDE 204 SEMPRE.** Cookie ausente, token de outro evento, sessão que já
 * tinha expirado: em todos, o resultado que a pessoa pediu — não estar mais
 * dentro — já vale. Um 401 no "sair" é a resposta mais inútil que existe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/sessao/sair";

export const POST = rotaDeApi(CAMINHO, async pedido => {
  const corpo = (await corpoJson(pedido)) as Record<string, unknown> | null;
  const eventoId = corpo?.evento_id;

  // Sem evento não há cookie a limpar: o cookie é por inquilino
  // (`nomeDoCookie("a", eventoId)`), e não um cookie global de sessão.
  if (!ehUuid(eventoId)) return pedidoInvalido({ evento_id: "id do casamento" });

  const sessao = await sessaoDoEvento(eventoId);
  const acesso = acessoDaSessao(sessao);
  if (acesso) await revogarAcesso(eventoId, acesso.id);

  const resposta = new NextResponse(null, { status: 204 });
  limparCookieDeAcesso(resposta, eventoId);
  return resposta;
});
