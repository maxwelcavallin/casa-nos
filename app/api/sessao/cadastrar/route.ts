import { NextResponse } from "next/server";

import { corpoJson, pedidoInvalido, respostaDeErro, rotaDeApi } from "@/lib/api";
import { enviarEmail } from "@/lib/brevo";
import { chaveDeOrigem, excedeuLimite, permitir } from "@/lib/limite-taxa";
import { conferirSenha, hashDeSenha } from "@/lib/senhas";
import { gravarCookieDeAcesso } from "@/lib/sessao";
import {
  conferirCadastro,
  criarContaComCasamento,
  criarTokenDeUsuario,
  usuarioPorEmail,
  VALIDADE_DE_TOKEN_MINUTOS,
} from "@/lib/usuarios";

/**
 * O CADASTRO PÚBLICO — a conta nasce, e o casamento nasce com ela.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **ELA REVERTE A DECISÃO P4**, e o registro fica: até 19/08/2026 este produto
 * não tinha cadastro público, e o casal entrava por um link de e-mail. O dono
 * decidiu o contrário. O que a decisão antiga protegia — *"não vender ao segundo
 * casal antes do primeiro casamento"* — deixa de ser protegido por código e
 * passa a ser escolha de quem divulga o endereço.
 *
 * **UM CADASTRO CRIA UM CASAMENTO.** Não existe conta sem casamento neste
 * produto: a conta é a porta do painel, e o painel é o painel de um casamento. É
 * por isso que o formulário pede cinco campos e não dois — `eventos` tem quatro
 * colunas `not null`, e um cadastro que pedisse só e-mail e senha teria que
 * inventar os quatro.
 *
 * **O CASAMENTO NASCE FORA DO AR.** Ver `criarContaComCasamento`: publicar é um
 * toque no painel, e ele existe para ser dado quando o casal decidir.
 *
 * **ESTA É A ÚNICA ROTA DO PRODUTO QUE DIZ SE UM E-MAIL EXISTE**, e a
 * contradição é conhecida: o login e a recuperação respondem igual para e-mail
 * conhecido e desconhecido, de propósito, para não virarem verificadores de
 * endereço. O cadastro **não tem essa saída** — quem tenta criar uma conta com
 * um e-mail já cadastrado precisa saber que ela já existe, senão fica preso
 * numa tela que não explica nada. A enumeração é inerente a cadastro público; o
 * que dá para fazer é o que está feito: limite de taxa por origem, e a mesma
 * frase levando para o login em vez de para o suporte.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/sessao/cadastrar";

/**
 * Cinco casamentos por hora por origem. É amortecedor, não defesa
 * (`lib/limite-taxa.ts` é honesto sobre isso) — mas aqui ele impede o caso
 * concreto: um laço criando eventos vazios que ninguém apaga.
 */
const LIMITE = 5;
const JANELA_MS = 60 * 60 * 1000;

function origemDaRequisicao(pedido: Request): string {
  const anfitriao =
    pedido.headers.get("x-forwarded-host") ?? pedido.headers.get("host") ?? "";
  const protocolo = pedido.headers.get("x-forwarded-proto") ?? "https";
  return anfitriao ? `${protocolo}://${anfitriao}` : "";
}

export const POST = rotaDeApi(CAMINHO, async pedido => {
  if (!permitir(chaveDeOrigem(pedido.headers, "sessao-cadastrar"), LIMITE, JANELA_MS)) {
    return excedeuLimite();
  }

  const corpo = await corpoJson(pedido);
  const { dados, erros } = conferirCadastro(corpo);

  const senha = (corpo as Record<string, unknown> | null)?.senha;
  const problemaDaSenha = conferirSenha(senha, dados?.email);
  if (problemaDaSenha) erros.push({ campo: "senha", mensagem: problemaDaSenha });

  if (erros.length > 0 || !dados) return pedidoInvalido({ campos: erros });

  if (await usuarioPorEmail(dados.email)) {
    return respostaDeErro(409, "email ja cadastrado", {
      campos: [
        {
          campo: "email",
          mensagem: "Já existe uma conta com esse e-mail. Entre com ele, ou peça uma senha nova.",
        },
      ],
    });
  }

  const conta = await criarContaComCasamento(dados, await hashDeSenha(senha as string));

  /**
   * O e-mail de confirmação sai DEPOIS de a conta existir, e a falha dele **não
   * derruba o cadastro**. Brevo fora do ar, chave não configurada, endereço que
   * recusa: nenhum desses casos pode desfazer um casamento que já foi criado, e
   * nenhum deles deve deixar a pessoa numa tela de erro depois de a conta ter
   * nascido. O que se perde é a confirmação do endereço — que não bloqueia
   * entrar, e que a pessoa pode pedir de novo.
   */
  try {
    const token = await criarTokenDeUsuario(conta.usuarioId, "verificacao");
    const base = origemDaRequisicao(pedido);
    await enviarEmail({
      para: dados.email,
      assunto: "Confirme o e-mail do site de casamento de voces",
      texto:
        `A conta de voces foi criada.\n\n` +
        `Confirme este endereco:\n${base}/verificar/${token}\n\n` +
        `O link vale ${VALIDADE_DE_TOKEN_MINUTOS} minutos. Se ele expirar, da para pedir outro ` +
        `na tela de entrar.\n\n` +
        `O painel de voces: ${base}/painel/${conta.eventoId}/site\n`,
    });
  } catch {
    // Silêncio deliberado: ver o comentário acima. O erro de e-mail já é
    // registrado por `enviarEmail`.
  }

  const resposta = NextResponse.json(
    { evento_id: conta.eventoId, slug: conta.slug },
    { status: 201 }
  );
  gravarCookieDeAcesso(resposta, conta.eventoId, conta.token);
  return resposta;
});
