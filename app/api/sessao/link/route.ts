import { NextResponse } from "next/server";

import { criarConvite, emailMascarado, eventoDoConvite } from "@/lib/acessos";
import { corpoJson, naoEncontrado, pedidoInvalido, rotaDeApi } from "@/lib/api";
import { enviarEmail } from "@/lib/brevo";
import { buscarEventoPorDominio, buscarEventoPorId } from "@/lib/eventos";
import { ehUuid } from "@/lib/ids";
import { chaveDeOrigem, excedeuLimite, permitir } from "@/lib/limite-taxa";
import { ehTokenDeAcesso, VALIDADE_CONVITE_MINUTOS } from "@/lib/segredos";

/**
 * "Mandar um link novo" (H-02).
 *
 * NÃO EXISTE SENHA, e não existe cadastro público na Fatia 1 (decisão P4). O
 * casal recebe um link por e-mail, ele vale 30 minutos e uma vez só, e vira um
 * cookie httpOnly de 30 dias. Isso troca "recuperação de senha" — que é uma
 * tela, um fluxo e uma superfície de ataque — pelo mesmo mecanismo que a
 * recuperação usaria de qualquer forma.
 *
 * A RESPOSTA NÃO CONTA SE O E-MAIL EXISTE. Um 404 para e-mail desconhecido
 * transformaria esta rota num verificador de endereços: qualquer um descobriria
 * quem é o casal de um casamento tentando endereços. 202 em todos os casos, e a
 * tela diz "mandamos, confira a caixa" — que é verdade do ponto de vista de quem
 * pediu, e é a única resposta que não entrega nada.
 *
 * O 404 desta rota é outro: é o evento que não existe. Sem evento não há a quem
 * mandar link nenhum, e isso não revela dado de pessoa.
 */

const CAMINHO = "/api/sessao/link";

/** Três pedidos por hora por origem. Amortecedor, não defesa — ver lib/limite-taxa.ts. */
const LIMITE = 3;
const JANELA_MS = 60 * 60 * 1000;

function origemDaRequisicao(pedido: Request): string {
  const cabecalhos = pedido.headers;
  const anfitriao = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "";
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? "https";
  return anfitriao ? `${protocolo}://${anfitriao}` : "";
}

export const POST = rotaDeApi(CAMINHO, async pedido => {
  if (!permitir(chaveDeOrigem(pedido.headers, "sessao-link"), LIMITE, JANELA_MS)) {
    return excedeuLimite();
  }

  const corpo = await corpoJson(pedido);
  if (!corpo || typeof corpo !== "object") return pedidoInvalido();
  const bruto = corpo as Record<string, unknown>;

  /**
   * DOIS CAMINHOS DE ENTRADA, e o segundo existe por causa de uma tela.
   *
   * a) `{ email }` — alguém pedindo o link do zero.
   * b) `{ token }` — o botão "Mandar um link novo" da tela de link expirado
   *    (H-02). Ali o produto JÁ SABE o endereço (ele está no evento), e pedir o
   *    e-mail seria um campo a mais numa tela cuja única função é consertar um
   *    atraso nosso. O token expirado não abre nada: ele só aponta o evento, e o
   *    link novo vai para o endereço cadastrado — que quem pede não escolhe.
   */
  const porToken = ehTokenDeAcesso(bruto.token);
  const email = typeof bruto.email === "string" ? bruto.email.trim().toLowerCase() : "";
  if (!porToken && !email.includes("@")) {
    return pedidoInvalido({ email: "Escreva o e-mail." });
  }

  const eventoIdDoConvite = porToken ? await eventoDoConvite(bruto.token as string) : null;
  const eventoIdBruto = eventoIdDoConvite ?? bruto.evento_id;
  const evento = ehUuid(eventoIdBruto)
    ? await buscarEventoPorId(eventoIdBruto)
    : await buscarEventoPorDominio(
        pedido.headers.get("x-forwarded-host") ?? pedido.headers.get("host")
      );

  if (!evento) return naoEncontrado();

  const destino = porToken ? (evento.emailCasal ?? "").trim().toLowerCase() : email;
  const cadastrado =
    !!evento.emailCasal && evento.emailCasal.trim().toLowerCase() === destino;

  if (cadastrado) {
    const token = await criarConvite(evento.id);
    const base = origemDaRequisicao(pedido);
    await enviarEmail({
      para: destino,
      assunto: "Seu link de acesso ao painel do casamento",
      texto:
        `Este link abre o painel do seu casamento:\n\n` +
        `${base}/entrar/${token}\n\n` +
        `Ele vale ${VALIDADE_CONVITE_MINUTOS} minutos e serve uma vez.\n` +
        `Se ele expirar, peca outro na mesma tela.\n`,
    });
  }

  // 202 nos dois casos. Ver o comentário do topo: a resposta não é a confirmação
  // de que o e-mail existe, é a confirmação de que o pedido foi aceito.
  return NextResponse.json(
    {
      enviado: true,
      // Só quando o pedido veio do token: ali a tela confirma para onde foi, e
      // quem está pedindo já tinha o link. No caminho do e-mail digitado isto
      // seria devolver a informação que a pessoa acabou de dar — ou pior,
      // confirmar que o endereço que ela chutou existe.
      destino: porToken && cadastrado ? emailMascarado(evento.emailCasal) : null,
    },
    { status: 202 }
  );
});
