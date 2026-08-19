import { sql, type Executor } from "@/lib/db";
import { hashDeToken, novoToken } from "@/lib/segredos";
import {
  paraBooleano,
  paraInstante,
  paraTexto,
  paraTextoObrigatorio,
} from "@/lib/serializar-linha";

/**
 * A participação — a identidade do convidado.
 *
 * A IDENTIDADE É O TOKEN, NUNCA O NOME (RN-01). Uma linha por aparelho, por
 * evento. O nome é um rótulo pendurado nela: editável, opcional, e chave de
 * coisa nenhuma. **Nenhuma consulta deste arquivo agrupa por rótulo, filtra por
 * rótulo ou junta por rótulo** — dois "Tio Carlos" existem em toda festa, e um
 * produto que usa o nome como chave junta os álbuns dos dois.
 *
 * Todas as funções aceitam o executor por parâmetro, como em `lib/eventos.ts`:
 * é o que permite a `test/vazamento-inquilinos.test.ts` rodar com dois eventos
 * e sem banco.
 */

export type PapelDeParticipacao = "convidado" | "casal" | "moderador";
export type ModoDeIdentificacao = "lista" | "avulso" | "retomado";

export type Participacao = {
  id: string;
  eventoId: string;
  papel: PapelDeParticipacao;
  convidadoId: string | null;
  rotulo: string | null;
  modoIdentificacao: ModoDeIdentificacao | null;
  faixaLenta: boolean;
  primeiroAcessoEm: Date | null;
};

function paraPapel(valor: unknown): PapelDeParticipacao {
  return valor === "casal" || valor === "moderador" ? valor : "convidado";
}

function paraModo(valor: unknown): ModoDeIdentificacao | null {
  return valor === "lista" || valor === "avulso" || valor === "retomado" ? valor : null;
}

function linhaParaParticipacao(linha: Record<string, unknown>): Participacao {
  return {
    id: paraTextoObrigatorio(linha.id, "participacoes.id"),
    eventoId: paraTextoObrigatorio(linha.evento_id, "participacoes.evento_id"),
    papel: paraPapel(linha.papel),
    convidadoId: paraTexto(linha.convidado_id),
    rotulo: paraTexto(linha.rotulo),
    modoIdentificacao: paraModo(linha.modo_identificacao),
    faixaLenta: paraBooleano(linha.faixa_lenta),
    primeiroAcessoEm: paraInstante(linha.primeiro_acesso_em),
  };
}

/**
 * A participação deste aparelho NESTE evento.
 *
 * O `evento_id` entra na cláusula, e não é redundância com o índice único do
 * token: é o filtro de inquilino (RN-25). Um token de outro casamento tem que
 * devolver nada, não devolver a linha do outro casamento — e é isto que
 * `test/vazamento-inquilinos.test.ts` observa.
 */
export async function participacaoPorToken(
  eventoId: string,
  token: string,
  exec: Executor = sql
): Promise<Participacao | null> {
  const hash = await hashDeToken(token);
  const linhas = await exec`
    select *
      from participacoes
     where token_hash = ${hash}
       and evento_id = ${eventoId}
       and excluido_em is null
     limit 1
  `;
  return linhas.length ? linhaParaParticipacao(linhas[0]) : null;
}

/**
 * Cria a participação, ou reencontra a que já existe, e carimba o acesso.
 *
 * `on conflict` e não "consulta, e se não achar insere": duas abas abertas ao
 * mesmo tempo — que é o caso normal de quem toca no QR duas vezes — mandariam
 * dois `insert` simultâneos, e o segundo estouraria violação de unicidade. O
 * banco decide, e a rota nunca vê o conflito.
 *
 * `ultimo_acesso_em` é atualizado no mesmo comando. Ele é o que permite ao
 * painel do dia dizer quantos aparelhos estão vivos sem uma segunda escrita por
 * abertura de página.
 */
export async function garantirParticipacao(
  eventoId: string,
  token: string,
  papel: PapelDeParticipacao = "convidado",
  exec: Executor = sql
): Promise<Participacao> {
  const hash = await hashDeToken(token);
  const linhas = await exec`
    insert into participacoes (evento_id, token_hash, papel, ultimo_acesso_em)
    values (${eventoId}, ${hash}, ${papel}, now())
    on conflict (token_hash) where excluido_em is null
      do update set ultimo_acesso_em = now(), atualizado_em = now()
    returning *
  `;
  return linhaParaParticipacao(linhas[0]);
}

/** Teto do rótulo digitado. Acima disso não é nome, é texto. */
export const MAXIMO_DO_ROTULO = 120;

export type Identificacao =
  /** Escolheu um nome da lista. `convidado_id` grava o slot. */
  | { modo: "lista"; convidadoId: string; rotulo: string }
  /** Digitou. `rotulo` grava o que ele escreveu, e nada mais. */
  | { modo: "avulso"; rotulo: string }
  /** Chegou pelo link guardado (H-22). O rótulo vem da participação anterior. */
  | { modo: "retomado"; rotulo: string | null };

/**
 * O NOME É RÓTULO, E ELE É PERGUNTADO DEPOIS (H-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRO COISAS QUE ESTA FUNÇÃO **NÃO** FAZ, e cada ausência é um critério de
 * aceite:
 *
 * 1. **Não bloqueia nada.** Ela roda com o envio já correndo. Se falhar, as
 *    fotos continuam subindo e a folha diz *"Guardamos as suas fotos. O nome a
 *    gente tenta de novo."* — nunca desfaz o envio (RN-02).
 * 2. **Não impede repetição.** Uma entrada da lista pode ser reivindicada
 *    quantas vezes for (RN-23). Não existe "alguém já é você", não existe
 *    numeração automática, não existe "Ana 2". Em casamento, duas Anas Silva
 *    acontecem — e bloquear cria um beco sem saída no meio da festa.
 * 3. **Não move mídia.** Trocar o nome depois muda o rótulo da participação, e
 *    as fotos continuam onde estão. A identidade é o TOKEN (RN-01); o nome
 *    pendura nela.
 * 4. **Não agrupa por nome.** Duas participações com o mesmo rótulo continuam
 *    sendo duas participações, e nenhuma consulta deste produto as junta.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O `convidado_id` é validado contra o EVENTO antes de gravar: um id de slot de
 * outro casamento, mandado à mão, criaria uma junção entre inquilinos que a
 * medição leria como participação real (RN-25).
 */
export async function identificarParticipacao(
  eventoId: string,
  participacaoId: string,
  identificacao: Identificacao,
  exec: Executor = sql
): Promise<Participacao | null> {
  let convidadoId: string | null = null;

  if (identificacao.modo === "lista") {
    const slot = await exec`
      select id from convidados
       where id = ${identificacao.convidadoId}
         and evento_id = ${eventoId}
         and excluido_em is null
       limit 1
    `;
    // Slot de outro evento, ou excluído: NÃO vira erro. O rótulo digitado
    // continua valendo e o modo cai para `avulso` — o produto não devolve uma
    // tela de erro por causa de um dado secundário, e a foto já está subindo.
    if (slot.length) convidadoId = identificacao.convidadoId;
  }

  const modo: ModoDeIdentificacao =
    identificacao.modo === "lista" && convidadoId === null ? "avulso" : identificacao.modo;

  const rotulo = (identificacao.rotulo ?? "").trim().slice(0, MAXIMO_DO_ROTULO) || null;

  const linhas = await exec`
    update participacoes
       set convidado_id       = ${convidadoId},
           rotulo             = ${rotulo},
           modo_identificacao = ${modo},
           atualizado_em      = now()
     where id = ${participacaoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning *
  `;
  return linhas.length ? linhaParaParticipacao(linhas[0]) : null;
}

/**
 * Quantos arquivos esta participação registrou nos últimos N minutos.
 *
 * Serve à decisão da faixa lenta (P11 / RN-11): acima de 50 arquivos em 10
 * minutos a participação é **despriorizada, nunca recusada**. A conta é sobre a
 * intenção (`criada_em`), e não sobre o que chegou — quem manda 200 fotos num
 * uplink ruim tem zero mídia armazenada e é exatamente quem precisa cair de
 * faixa.
 */
export async function arquivosRecentes(
  participacaoId: string,
  minutos: number,
  exec: Executor = sql
): Promise<number> {
  const linhas = await exec`
    select count(*)::int as total
      from midias
     where participacao_id = ${participacaoId}
       and criada_em > now() - (${minutos} * interval '1 minute')
  `;
  const total = linhas[0]?.total;
  return typeof total === "number" ? total : Number(total ?? 0);
}

export async function marcarFaixaLenta(
  participacaoId: string,
  exec: Executor = sql
): Promise<void> {
  await exec`
    update participacoes
       set faixa_lenta = true, atualizado_em = now()
     where id = ${participacaoId}
       and faixa_lenta = false
  `;
}

/* ------------------------------------------------------------------ *
 * H-22 — o link guardado, e o que ele custa
 * ------------------------------------------------------------------ */

/**
 * Gera o link guardado desta participação. **O novo invalida o anterior.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE LINK É, DITO SEM EUFEMISMO (e a tela diz a mesma coisa): quem tiver
 * ele **age como aquela participação** — vê as próprias fotos, muda
 * visibilidade, apaga. Nada de casal, nada de moderador. É a mitigação do risco
 * R8 ("o convidado troca de celular e perde o álbum"), não uma conta.
 *
 * Por isso a linha de risco fica ACIMA dos botões na folha, e não em letra
 * miúda: ela é a informação que decide se a pessoa manda o link para um grupo de
 * WhatsApp. Ela precisa ser lida antes da decisão.
 *
 * **NENHUM TELEFONE É ARMAZENADO** (critério da H-22). O `wa.me` é um link que o
 * navegador abre; o número que a pessoa escolhe para mandar para si mesma nunca
 * passa por este servidor.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Só o HASH é guardado, como em todo token do produto. O token em claro existe
 * uma vez, no retorno desta função, e vai direto para a tela.
 */
export async function gerarLinkGuardado(
  eventoId: string,
  participacaoId: string,
  exec: Executor = sql
): Promise<string | null> {
  const token = novoToken();
  const hash = await hashDeToken(token);
  const linhas = await exec`
    update participacoes
       set recuperacao_hash = ${hash},
           recuperacao_criada_em = now(),
           atualizado_em = now()
     where id = ${participacaoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning id
  `;
  // Falha ao gerar NÃO invalida o anterior: o `update` é um só, e ou ele
  // acontece inteiro ou não acontece. É o que torna verdadeira a mensagem de
  // erro da tela — "O seu link anterior continua valendo."
  return linhas.length ? token : null;
}

/**
 * A participação por trás de um link guardado. **Descobre o inquilino**, como a
 * sessão do telão — o `/r/[token]` não tem evento na URL.
 *
 * Ao abrir, o `modo_identificacao` vira `retomado` (H-22): é o terceiro valor da
 * dimensão, e ele existe para que P saiba distinguir "esta é uma pessoa nova" de
 * "esta é a mesma pessoa noutro aparelho". Sem ele, uma troca de celular
 * apareceria como um convidado a mais no numerador.
 */
export async function participacaoPorLinkGuardado(
  token: string,
  exec: Executor = sql
): Promise<Participacao | null> {
  const hash = await hashDeToken(token);
  const linhas = await exec`
    update participacoes
       set modo_identificacao = 'retomado',
           ultimo_acesso_em = now(),
           atualizado_em = now()
     where recuperacao_hash = ${hash}
       and excluido_em is null
    returning *
  `;
  return linhas.length ? linhaParaParticipacao(linhas[0]) : null;
}

/**
 * O token de sessão desta participação, para o aparelho novo.
 *
 * A retomada **cunha um token de participação novo** em vez de devolver o
 * antigo: o antigo é o cookie do celular velho, e o produto não o conhece em
 * claro (só o hash). Os dois passam a valer, e é o certo — a pessoa que achou o
 * celular antigo continua com o álbum dela.
 */
export async function tokenDeRetomada(
  participacaoId: string,
  exec: Executor = sql
): Promise<string> {
  const token = novoToken();
  const hash = await hashDeToken(token);
  await exec`
    update participacoes
       set token_hash = ${hash}, atualizado_em = now()
     where id = ${participacaoId}
  `;
  return token;
}

/**
 * O casal renomeia uma participação (H-23). **Nunca junta, nunca numera.**
 *
 * O alcance da matriz aqui é `todas` para o casal — é o álbum dele —, e a
 * cláusula carrega o `evento_id` pelo mesmo motivo de sempre: um id de
 * participação de outro casamento não pode ser renomeado a partir deste painel.
 */
export async function renomearParticipacao(
  eventoId: string,
  participacaoId: string,
  rotulo: string,
  exec: Executor = sql
): Promise<Participacao | null> {
  const limpo = rotulo.trim().slice(0, MAXIMO_DO_ROTULO);
  if (!limpo) return null;
  const linhas = await exec`
    update participacoes
       set rotulo = ${limpo}, atualizado_em = now()
     where id = ${participacaoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning *
  `;
  return linhas.length ? linhaParaParticipacao(linhas[0]) : null;
}
