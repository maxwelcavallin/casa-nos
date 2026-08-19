import { cookies } from "next/headers";

import { acessoPorToken, type Acesso } from "@/lib/acessos";
import { sql, type Executor } from "@/lib/db";
import { participacaoPorToken, type Participacao } from "@/lib/participacoes";
import {
  ehTokenDeAcesso,
  MAX_AGE_ACESSO,
  MAX_AGE_PARTICIPACAO,
  nomeDoCookie,
  opcoesDeCookie,
} from "@/lib/segredos";

/**
 * OS QUATRO PORTADORES, RESOLVIDOS NUM ARQUIVO SÓ (H-01, `stack.md` §3).
 *
 * A Fatia 1 introduz quatro formas de alguém ser alguém — participação de
 * convidado, sessão do casal, link do moderador e link do telão — e elas
 * chegaram todas juntas. Nascendo em quatro lugares, viram quatro leituras de
 * cookie, quatro ideias de "está expirado?" e quatro decisões de perfil
 * espalhadas pelas rotas. O `escopo-core.md` §9 já registrava isso como o
 * débito mais provável desta fatia.
 *
 * **Este é o único arquivo do produto que chama `cookies()`.** Não é convenção:
 * `test/sessao-unica.test.ts` varre `app/**` e quebra o CI se aparecer outro.
 *
 * O FILTRO DE INQUILINO MORA AQUI. Toda resolução recebe o `eventoId` já
 * validado pela rota e devolve `anonimo` quando o token pertence a outro
 * casamento. É o que faz `midia.enviar` de um evento não valer no outro sem
 * nenhuma rota precisar lembrar — e é o que a varredura de vazamento observa.
 */

export type Sessao =
  | { tipo: "anonimo" }
  | { tipo: "convidado"; participacao: Participacao }
  | { tipo: "casal"; acesso: Acesso }
  | { tipo: "moderador"; acesso: Acesso }
  | { tipo: "telao"; acesso: Acesso }
  | { tipo: "cron" };

export const ANONIMO: Sessao = { tipo: "anonimo" };

/**
 * O token que veio no cookie de participação deste evento. `null` quando não há
 * cookie, ou quando o que há não tem o formato de token.
 *
 * A validação de formato acontece ANTES da consulta, pelo mesmo motivo de
 * `ehUuid` (dados.md §3): o valor vem do navegador e pode ser qualquer coisa. Um
 * cookie adulterado tem que custar zero ida ao banco.
 */
export async function tokenDeParticipacao(eventoId: string): Promise<string | null> {
  const jarra = await cookies();
  const bruto = jarra.get(nomeDoCookie("p", eventoId))?.value;
  return ehTokenDeAcesso(bruto) ? bruto : null;
}

async function tokenDeAcesso(eventoId: string): Promise<string | null> {
  const jarra = await cookies();
  const bruto = jarra.get(nomeDoCookie("a", eventoId))?.value;
  return ehTokenDeAcesso(bruto) ? bruto : null;
}

/**
 * A sessão desta requisição, para ESTE evento.
 *
 * ORDEM DE RESOLUÇÃO, e ela importa: primeiro o acesso (casal, moderador,
 * telão), depois a participação. Um casal que abre o próprio álbum tem os dois
 * cookies, e é o acesso que descreve o que ele pode fazer no painel. A
 * participação dele continua existindo e continua sendo o que credita as fotos
 * que ele mandar — com `papel = 'casal'`, fora do denominador da North Star
 * (RN-22).
 *
 * `tokenDoTelao` vem da URL (`/telao/[token]`), não de cookie: o telão é um link
 * ao portador aberto num computador que ninguém vai autenticar. Ele está aqui,
 * e não numa quinta implementação na F1.4, porque é o mesmo mecanismo.
 */
export async function sessaoDoEvento(
  eventoId: string,
  opcoes: { tokenDoTelao?: string | null; exec?: Executor } = {}
): Promise<Sessao> {
  const exec = opcoes.exec ?? sql;

  if (opcoes.tokenDoTelao && ehTokenDeAcesso(opcoes.tokenDoTelao)) {
    const acesso = await acessoPorToken(eventoId, opcoes.tokenDoTelao, exec);
    if (acesso && acesso.tipo === "telao") return { tipo: "telao", acesso };
    return ANONIMO;
  }

  const tokenAcesso = await tokenDeAcesso(eventoId);
  if (tokenAcesso) {
    const acesso = await acessoPorToken(eventoId, tokenAcesso, exec);
    if (acesso) {
      if (acesso.tipo === "casal") return { tipo: "casal", acesso };
      if (acesso.tipo === "moderador") return { tipo: "moderador", acesso };
      if (acesso.tipo === "telao") return { tipo: "telao", acesso };
    }
  }

  const tokenParticipacao = await tokenDeParticipacao(eventoId);
  if (tokenParticipacao) {
    const participacao = await participacaoPorToken(eventoId, tokenParticipacao, exec);
    if (participacao) return { tipo: "convidado", participacao };
  }

  return ANONIMO;
}

/**
 * A sessão do cron, que não tem cookie e não tem pessoa.
 *
 * Segredo de cabeçalho, comparado em tempo constante-ish: a comparação por
 * `===` de string vaza tempo em teoria, e num segredo de 64 caracteres
 * hexadecimais isso não é explorável pela rede. O que importa mais é o outro
 * lado: **sem `CRON_SEGREDO` configurado, a resposta é sempre anônima** — nunca
 * "passa porque a variável está vazia", que é como uma rota interna vira
 * pública num ambiente novo.
 */
export function sessaoDeCron(cabecalho: string | null): Sessao {
  const segredo = process.env.CRON_SEGREDO;
  if (!segredo || !cabecalho) return ANONIMO;
  if (cabecalho.length !== segredo.length) return ANONIMO;
  let diferenca = 0;
  for (let i = 0; i < segredo.length; i++) {
    diferenca |= segredo.charCodeAt(i) ^ cabecalho.charCodeAt(i);
  }
  return diferenca === 0 ? { tipo: "cron" } : ANONIMO;
}

/* ------------------------------------------------------------------ *
 * Gravar cookie — também aqui, e pelo mesmo motivo
 * ------------------------------------------------------------------ */

/**
 * Escrita de cookie tem a mesma regra da leitura: mora aqui.
 *
 * A resposta é recebida por parâmetro porque em rota do App Router o cookie sai
 * no objeto de resposta, e não pela jarra global — e porque assim a função é
 * testável sem um servidor. As opções (`httpOnly`, `SameSite`, `Secure`,
 * `Max-Age`) vêm de `lib/segredos.ts`, num lugar só: um cookie de sessão que
 * nasce sem `httpOnly` por descuido é a falha que ninguém vê em revisão.
 */
type RespostaComCookie = {
  cookies: {
    set: (opcoes: {
      name: string;
      value: string;
      httpOnly: boolean;
      sameSite: "lax";
      secure: boolean;
      path: string;
      maxAge: number;
    }) => unknown;
  };
};

export function gravarCookieDeParticipacao(
  resposta: RespostaComCookie,
  eventoId: string,
  token: string
): void {
  resposta.cookies.set({
    name: nomeDoCookie("p", eventoId),
    value: token,
    ...opcoesDeCookie(MAX_AGE_PARTICIPACAO),
  });
}

export function gravarCookieDeAcesso(
  resposta: RespostaComCookie,
  eventoId: string,
  token: string
): void {
  resposta.cookies.set({
    name: nomeDoCookie("a", eventoId),
    value: token,
    ...opcoesDeCookie(MAX_AGE_ACESSO),
  });
}

/**
 * O `user_id` pseudônimo que vai para o `config` do GA4 (`metricas.md` §8).
 *
 * `g:` para convidado, `c:` para casal. É o id interno, que é opaco e não é
 * pessoa — **nunca** o rótulo, nunca o e-mail, nunca o telefone. Enviar PII ao
 * GA4 viola os termos e pode zerar a propriedade, e o rótulo do convidado é PII
 * de terceiro, que é pior: ele nem escolheu estar ali.
 */
export function usuarioPseudonimo(sessao: Sessao): string | null {
  if (sessao.tipo === "convidado") return `g:${sessao.participacao.id}`;
  if (sessao.tipo === "casal") return `c:${sessao.acesso.id}`;
  return null;
}

/**
 * A participação por trás desta sessão, se houver.
 *
 * EXISTE PARA QUE NENHUMA ROTA PRECISE ESCREVER `if (sessao.tipo === ...)`.
 * A regra da casa é que autorização é dado, e a catraca
 * `test/autorizacao-matriz.test.ts` varre `app/api/**` atrás desse `if`. Sem
 * este ajudante, toda rota de mídia teria um — não para decidir permissão (isso
 * é da matriz), mas só para o TypeScript estreitar o tipo. O resultado seria uma
 * catraca cheia de exceções, que é uma catraca desligada.
 *
 * Devolve `null` para casal, moderador, telão e anônimo. Rota que precisa de
 * participação responde 404 nesse caso: o link do moderador não tem álbum
 * pessoal, e dizer "403" sugeriria que existe um que ele não pode ver.
 */
export function participacaoDaSessao(sessao: Sessao): Participacao | null {
  return sessao.tipo === "convidado" ? sessao.participacao : null;
}
