import { NextResponse } from "next/server";

import { corpoJson, pedidoInvalido, respostaDeErro, rotaDeApi } from "@/lib/api";
import { chaveDeOrigem, excedeuLimite, permitir } from "@/lib/limite-taxa";
import { ehTokenDeAcesso } from "@/lib/segredos";
import { conferirSenha, hashDeSenha } from "@/lib/senhas";
import { gravarCookieDeAcesso } from "@/lib/sessao";
import {
  abrirSessao,
  consumirTokenDeUsuario,
  eventoDoUsuario,
  marcarEmailVerificado,
  revogarSessoesDoUsuario,
  trocarSenha,
  usuarioPorId,
} from "@/lib/usuarios";

/**
 * A SENHA NOVA, com o token que chegou por e-mail.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **A ORDEM DOS QUATRO PASSOS É O CONTRATO DESTA ROTA**, e o terceiro é o que
 * quase sempre falta:
 *
 *   1. **consumir o token** — atômico, uma vez só (`update ... where usado_em is
 *      null returning`). O verificador de links do cliente de e-mail abre o link
 *      antes da pessoa, e sem atomicidade os dois passariam.
 *   2. **gravar a senha nova**
 *   3. **REVOGAR TODAS AS SESSÕES DA CONTA** — quem redefiniu a senha porque
 *      desconfia que alguém entrou não ganha nada se o cookie do intruso
 *      continuar valendo trinta dias. É a diferença entre trocar a fechadura e
 *      pedir a chave de volta.
 *   4. **abrir uma sessão nova** para quem acabou de trocar. Sem isto, o passo 3
 *      derrubaria a própria pessoa, e ela cairia numa tela de login logo depois
 *      de provar quem é.
 *
 * **O E-MAIL FICA CONFIRMADO DE QUEBRA.** Quem abriu um link que só existia
 * dentro daquela caixa provou o controle do endereço — exigir uma segunda
 * confirmação depois disso seria pedir a mesma prova duas vezes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/sessao/senha";

/** Vinte por hora por origem: o token já é único, já expira e já morre no uso. */
const LIMITE = 20;
const JANELA_MS = 60 * 60 * 1000;

export const POST = rotaDeApi(CAMINHO, async pedido => {
  if (!permitir(chaveDeOrigem(pedido.headers, "sessao-senha"), LIMITE, JANELA_MS)) {
    return excedeuLimite();
  }

  const corpo = (await corpoJson(pedido)) as Record<string, unknown> | null;

  // Formato conferido antes da consulta, pelo mesmo motivo de `ehUuid`: o token
  // vem da URL e chega torto de cliente de e-mail que quebra linha.
  if (!ehTokenDeAcesso(corpo?.token)) return respostaDeErro(410, "link expirado");

  const problema = conferirSenha(corpo?.senha);
  if (problema) return pedidoInvalido({ campos: [{ campo: "senha", mensagem: problema }] });

  const usuarioId = await consumirTokenDeUsuario(corpo.token as string, "recuperacao");
  /**
   * 410 e não 404, e os quatro casos — não existe, expirou, já usado, é de outro
   * tipo — dão a mesma resposta. A tela mostra "este link expirou" com o botão
   * que pede outro, que é a saída certa nos quatro.
   */
  if (!usuarioId) return respostaDeErro(410, "link expirado");

  const usuario = await usuarioPorId(usuarioId);
  if (!usuario) return respostaDeErro(410, "link expirado");

  await trocarSenha(usuarioId, await hashDeSenha(corpo.senha as string));
  await marcarEmailVerificado(usuarioId);
  await revogarSessoesDoUsuario(usuarioId);

  const eventoId = await eventoDoUsuario(usuarioId);
  /**
   * Conta sem casamento não deveria existir — o cadastro cria os dois numa
   * instrução só. Se existir, a senha nova **já foi gravada** e a pessoa
   * consegue entrar pela tela de sempre; o que não dá é abrir uma sessão para um
   * casamento que não há.
   */
  if (!eventoId) return NextResponse.json({ evento_id: null });

  const token = await abrirSessao(eventoId, usuarioId);
  const resposta = NextResponse.json({ evento_id: eventoId });
  gravarCookieDeAcesso(resposta, eventoId, token);
  return resposta;
});
