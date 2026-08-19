import { NextResponse } from "next/server";

import { corpoJson, rotaDeApi } from "@/lib/api";
import { enviarEmail } from "@/lib/brevo";
import { chaveDeOrigem, excedeuLimite, permitir } from "@/lib/limite-taxa";
import {
  criarTokenDeUsuario,
  normalizarEmail,
  usuarioPorEmail,
  VALIDADE_DE_TOKEN_MINUTOS,
} from "@/lib/usuarios";

/**
 * "ESQUECI A SENHA" — o pedido do link.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **A RESPOSTA NÃO CONTA SE O E-MAIL EXISTE.** É a mesma regra do login e a mesma
 * frase que a rota antiga do link mágico já usava: 202 em todos os casos, e a
 * tela diz *"se existir uma conta com esse e-mail, o link está a caminho"*.
 * Distinguir os dois casos transformaria esta rota num verificador de endereços
 * — e ela é a rota mais fácil de varrer do produto inteiro, porque ninguém
 * precisa de senha para chamá-la.
 *
 * **QUEM NÃO CONFIRMOU O E-MAIL TAMBÉM RECEBE O LINK**, e isso é deliberado: o
 * link chega no endereço, e quem abre o endereço prova o controle dele. Recusar
 * aqui deixaria de fora justamente quem mais precisa — a pessoa que se cadastrou,
 * não viu o e-mail de confirmação, e esqueceu a senha.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/sessao/recuperacao";

/** Três por hora por origem, como era o pedido de link da H-02. */
const LIMITE = 3;
const JANELA_MS = 60 * 60 * 1000;

function origemDaRequisicao(pedido: Request): string {
  const anfitriao =
    pedido.headers.get("x-forwarded-host") ?? pedido.headers.get("host") ?? "";
  const protocolo = pedido.headers.get("x-forwarded-proto") ?? "https";
  return anfitriao ? `${protocolo}://${anfitriao}` : "";
}

export const POST = rotaDeApi(CAMINHO, async pedido => {
  if (!permitir(chaveDeOrigem(pedido.headers, "sessao-recuperacao"), LIMITE, JANELA_MS)) {
    return excedeuLimite();
  }

  const corpo = (await corpoJson(pedido)) as Record<string, unknown> | null;
  const email = normalizarEmail(corpo?.email);

  if (email.includes("@")) {
    const usuario = await usuarioPorEmail(email);
    if (usuario) {
      const token = await criarTokenDeUsuario(usuario.id, "recuperacao");
      const base = origemDaRequisicao(pedido);
      await enviarEmail({
        para: usuario.email,
        assunto: "Uma senha nova para o site de casamento de voces",
        texto:
          `Alguem pediu uma senha nova para esta conta.\n\n` +
          `Escolha a senha nova aqui:\n${base}/recuperar/${token}\n\n` +
          `O link vale ${VALIDADE_DE_TOKEN_MINUTOS} minutos e serve uma vez so.\n\n` +
          `Se nao foi voce quem pediu, ignore este e-mail: a senha atual continua ` +
          `valendo e nada mudou.\n`,
      });
    }
  }

  /**
   * 202 sempre — inclusive quando o e-mail nem tem formato de e-mail. Um 400
   * para "abc" e um 202 para "abc@def.com" já contariam metade do que esta rota
   * se recusa a contar: que o formato foi aceito e a busca aconteceu.
   */
  return NextResponse.json({ enviado: true }, { status: 202 });
});
