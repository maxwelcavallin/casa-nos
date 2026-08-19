import { NextResponse } from "next/server";

import { corpoJson, respostaDeErro, rotaDeApi } from "@/lib/api";
import { chaveDeOrigem, excedeuLimite, permitir } from "@/lib/limite-taxa";
import { hashDeSenha, precisaRecriarOHash, senhaConfere } from "@/lib/senhas";
import { gravarCookieDeAcesso } from "@/lib/sessao";
import {
  abrirSessao,
  eventoDoUsuario,
  normalizarEmail,
  trocarSenha,
  usuarioPorEmail,
} from "@/lib/usuarios";

/**
 * ENTRAR COM E-MAIL E SENHA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **UMA RESPOSTA SÓ PARA OS TRÊS "NÃO".** E-mail que não existe, senha errada e
 * conta sem casamento devolvem o **mesmo 401 com a mesma frase**. Distinguir
 * "esse e-mail não tem conta" de "a senha está errada" transforma a tela de
 * login num verificador de endereços: qualquer um descobre quem tem conta aqui
 * testando e-mails, e o que se ganha em gentileza se perde em privacidade de
 * quem nem está usando o produto naquele momento.
 *
 * **O TEMPO TAMBÉM RESPONDE, E POR ISSO ELE É IGUALADO.** Sem o hash de mentira
 * abaixo, um e-mail desconhecido voltaria em milissegundos e um e-mail conhecido
 * com senha errada levaria as 210 000 iterações do PBKDF2 — e a diferença, que é
 * grande e mensurável pela rede, contaria exatamente o que as frases iguais se
 * recusam a contar.
 *
 * **A SESSÃO É A MESMA DE SEMPRE:** uma linha em `evento_acessos` com o hash de
 * um token, que vira cookie `httpOnly`. Login não inventa mecanismo de sessão
 * novo — e é por isso que toda a autorização, o filtro de inquilino e as
 * catracas continuam valendo sem uma linha de mudança.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CAMINHO = "/api/sessao/entrar";

/**
 * Dez tentativas por hora por origem.
 *
 * O limite é por ORIGEM e não por e-mail, de propósito: por e-mail, qualquer um
 * tranca a conta de qualquer pessoa mandando dez senhas erradas — a defesa vira
 * a arma. O custo de 210 000 iterações por tentativa já é o que torna a força
 * bruta cara do outro lado.
 */
const LIMITE = 10;
const JANELA_MS = 60 * 60 * 1000;

/**
 * O hash de mentira: um valor real, com os parâmetros de hoje, para gastar o
 * mesmo tempo quando o e-mail não existe. A senha comparada contra ele nunca
 * confere — o que importa é que ela seja comparada.
 */
const HASH_DE_MENTIRA =
  "pbkdf2-sha256$210000$00000000000000000000000000000000$" +
  "0000000000000000000000000000000000000000000000000000000000000000";

const RECUSA = () =>
  respostaDeErro(401, "credenciais nao conferem", {
    campos: [
      {
        campo: "senha",
        mensagem: "E-mail ou senha não conferem. Se vocês esqueceram a senha, dá para pedir outra.",
      },
    ],
  });

export const POST = rotaDeApi(CAMINHO, async pedido => {
  if (!permitir(chaveDeOrigem(pedido.headers, "sessao-entrar"), LIMITE, JANELA_MS)) {
    return excedeuLimite();
  }

  const corpo = (await corpoJson(pedido)) as Record<string, unknown> | null;
  const email = normalizarEmail(corpo?.email);
  const senha = typeof corpo?.senha === "string" ? corpo.senha : "";

  // Campo vazio não vale ida ao banco — e continua respondendo a mesma coisa que
  // uma senha errada, pelo motivo do cabeçalho.
  if (email === "" || senha === "") return RECUSA();

  const usuario = await usuarioPorEmail(email);
  const confere = await senhaConfere(senha, usuario?.senhaHash ?? HASH_DE_MENTIRA);
  if (!usuario || !confere) return RECUSA();

  const eventoId = await eventoDoUsuario(usuario.id);
  if (!eventoId) return RECUSA();

  /**
   * O custo do hash subiu desde que esta senha foi guardada, e este é o único
   * momento em que a senha em claro existe do nosso lado — então é aqui, e em
   * nenhum outro lugar, que dá para reescrevê-la com os parâmetros de hoje. A
   * falha não derruba o login: a pessoa entrou, e o hash antigo continua válido.
   */
  if (precisaRecriarOHash(usuario.senhaHash)) {
    try {
      await trocarSenha(usuario.id, await hashDeSenha(senha));
    } catch {
      // Ver acima: quem falhou foi a melhoria, não a entrada.
    }
  }

  const token = await abrirSessao(eventoId, usuario.id);
  const resposta = NextResponse.json({ evento_id: eventoId });
  gravarCookieDeAcesso(resposta, eventoId, token);
  return resposta;
});
