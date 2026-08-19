import { NextResponse } from "next/server";

import { respostaDeErro, rotaDeApi, corpoJson } from "@/lib/api";
import { chaveDeOrigem, excedeuLimite, permitir } from "@/lib/limite-taxa";
import { ehTokenDeAcesso } from "@/lib/segredos";
import { gravarCookieDeAcesso } from "@/lib/sessao";
import {
  abrirSessao,
  consumirTokenDeUsuario,
  eventoDoUsuario,
  marcarEmailVerificado,
} from "@/lib/usuarios";

/**
 * CONFIRMAR O E-MAIL — o link que sai no cadastro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **CONFIRMAR NÃO DESTRAVA NADA, E ISSO É DECISÃO.** A conta funciona desde o
 * primeiro segundo: o casal que se cadastra na véspera precisa editar o site
 * agora, e travar o painel atrás de um e-mail que pode demorar, cair no lixo
 * eletrônico ou ser digitado errado troca um risco pequeno por uma parede.
 *
 * O que o endereço confirmado significa está escrito na migration: é a prova de
 * que a caixa é de quem diz ser. Ela importa no dia em que a conta precisar de
 * uma senha nova — e ali o link chega naquele endereço, e não em outro.
 *
 * **`POST` E NÃO `GET`, e não é preferência de verbo:** um `GET` que consome o
 * token é disparado pelo verificador de links do cliente de e-mail, e o casal
 * receberia "este link expirou" no primeiro clique — porque o antivírus do
 * Outlook já o teria usado. É o defeito clássico de link mágico, e ele é
 * invisível em teste: nenhum ambiente de desenvolvimento tem um antivírus de
 * e-mail abrindo os links. A página `/verificar/[token]` é quem chama esta rota.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/sessao/verificacao";

const LIMITE = 20;
const JANELA_MS = 60 * 60 * 1000;

export const POST = rotaDeApi(CAMINHO, async pedido => {
  if (!permitir(chaveDeOrigem(pedido.headers, "sessao-verificacao"), LIMITE, JANELA_MS)) {
    return excedeuLimite();
  }

  const corpo = (await corpoJson(pedido)) as Record<string, unknown> | null;
  if (!ehTokenDeAcesso(corpo?.token)) return respostaDeErro(410, "link expirado");

  const usuarioId = await consumirTokenDeUsuario(corpo.token as string, "verificacao");
  if (!usuarioId) return respostaDeErro(410, "link expirado");

  await marcarEmailVerificado(usuarioId);

  /**
   * Quem confirmou o e-mail entra direto, e não volta para a tela de senha.
   *
   * Ele acabou de provar o controle da caixa onde o link chegou — a mesma prova
   * que a recuperação de senha usa. Mandá-lo digitar a senha logo depois disso
   * seria pedir a prova duas vezes na mesma tela.
   */
  const eventoId = await eventoDoUsuario(usuarioId);
  if (!eventoId) return NextResponse.json({ evento_id: null });

  const token = await abrirSessao(eventoId, usuarioId);
  const resposta = NextResponse.json({ evento_id: eventoId });
  gravarCookieDeAcesso(resposta, eventoId, token);
  return resposta;
});
