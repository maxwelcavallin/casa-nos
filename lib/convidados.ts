import { sql, type Executor } from "@/lib/db";
import {
  paraBooleano,
  paraInteiro,
  paraTexto,
  paraTextoObrigatorio,
} from "@/lib/serializar-linha";

/**
 * A LISTA DE CONVIDADOS — o denominador da North Star (H-03).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UM SLOT, NÃO UMA PESSOA. "Família Silva" é **um** slot com
 * `pessoas_no_slot = 4` (`metricas.md` §1.1). A North Star conta slots que
 * publicaram sobre slots presentes; a banda por pessoa sai do segundo número.
 * Somar as duas grandezas produz um percentual que não significa nada, e o erro
 * não aparece em lugar nenhum — por isso as duas viajam separadas até a tela.
 *
 * O NOME NÃO É CHAVE, EM LUGAR NENHUM (RN-01, RN-23). Dois "Tio Carlos"
 * acontecem em toda festa. O banco não tem índice único por nome de propósito
 * (migration 0004), esta camada não agrupa por nome, e a tela avisa sem impedir.
 * A única coisa que compara nome é a **reimportação** — e ali a comparação é
 * exata e serve para não duplicar o que a pessoa já colou, não para identificar
 * ninguém.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Convidado = {
  id: string;
  eventoId: string;
  nome: string;
  pessoasNoSlot: number;
  /** `null` significa "não informado", e é DIFERENTE de `false` (migration 0004). */
  ausente: boolean | null;
  ordem: number;
};

/** O recorte que sai para o álbum: id e nome, e nada mais (H-03, H-09). */
export type ConvidadoPublico = { id: string; nome: string };

function linhaParaConvidado(linha: Record<string, unknown>): Convidado {
  return {
    id: paraTextoObrigatorio(linha.id, "convidados.id"),
    eventoId: paraTextoObrigatorio(linha.evento_id, "convidados.evento_id"),
    nome: paraTextoObrigatorio(linha.nome, "convidados.nome"),
    pessoasNoSlot: Math.max(1, paraInteiro(linha.pessoas_no_slot, 1)),
    // `paraBooleano` colapsaria `null` em `false`, e aí "não informado" viraria
    // "esteve presente" — o denominador de P mudaria em silêncio.
    ausente: linha.ausente === null || linha.ausente === undefined
      ? null
      : paraBooleano(linha.ausente),
    ordem: paraInteiro(linha.ordem, 0),
  };
}

/* ------------------------------------------------------------------ *
 * 1. A caixa de colar — texto → slots
 * ------------------------------------------------------------------ */

/** Teto por importação. É o número do critério de aceite da H-03. */
export const MAXIMO_DE_LINHAS = 300;

/** Teto de caracteres por nome. Acima disso a lista vira outra coisa. */
export const MAXIMO_DO_NOME = 120;

export type LinhaLida = { nome: string; pessoasNoSlot: number };

export type LinhaRecusada = {
  /** A linha exatamente como veio, para voltar à caixa de colar. */
  original: string;
  /** O motivo, na palavra do `gtm.md` §5.11. Nunca "linha inválida". */
  motivo: string;
};

export type LeituraDaLista = {
  aceitas: LinhaLida[];
  recusadas: LinhaRecusada[];
  /** Nomes que aparecem mais de uma vez no que foi colado. Avisa, não bloqueia. */
  repetidos: string[];
  /** `true` quando o texto colado passou do teto e foi cortado. */
  excedeu: boolean;
};

const MOTIVO_SEM_NOME = "Sem nome antes da vírgula";
const MOTIVO_NUMERO = "O número depois da vírgula não é um número";
const MOTIVO_LONGO = `O nome passa de ${MAXIMO_DO_NOME} caracteres`;

/**
 * O texto colado → slots, com as linhas que não viraram nome separadas.
 *
 * ELA NUNCA LANÇA E NUNCA DESCARTA EM SILÊNCIO. Quem colou 300 linhas de uma
 * planilha não vai reencontrar quatro no meio dela: as recusadas voltam
 * **inteiras**, com o motivo, e as outras 296 entram. Um erro que aborta a
 * importação toda obrigaria a pessoa a caçar a linha ruim sem nenhuma pista.
 *
 * A VÍRGULA É A ÚLTIMA, e não a primeira: "Silva, João, 2" é o slot
 * "Silva, João" com 2 pessoas. Cortar na primeira vírgula transformaria o
 * sobrenome no separador e produziria um slot chamado "Silva" com o resto
 * recusado — silenciosamente errado, que é o pior tipo.
 */
export function lerListaColada(texto: string): LeituraDaLista {
  const linhas = texto.split(/\r?\n/);
  const aceitas: LinhaLida[] = [];
  const recusadas: LinhaRecusada[] = [];
  let excedeu = false;

  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (linha === "") continue; // linha vazia não é erro: é como planilha cola

    if (aceitas.length >= MAXIMO_DE_LINHAS) {
      excedeu = true;
      break;
    }

    const virgula = linha.lastIndexOf(",");
    if (virgula === -1) {
      if (linha.length > MAXIMO_DO_NOME) {
        recusadas.push({ original: bruta, motivo: MOTIVO_LONGO });
        continue;
      }
      aceitas.push({ nome: linha, pessoasNoSlot: 1 });
      continue;
    }

    const nome = linha.slice(0, virgula).trim();
    const depois = linha.slice(virgula + 1).trim();

    if (nome === "") {
      recusadas.push({ original: bruta, motivo: MOTIVO_SEM_NOME });
      continue;
    }
    if (nome.length > MAXIMO_DO_NOME) {
      recusadas.push({ original: bruta, motivo: MOTIVO_LONGO });
      continue;
    }

    /**
     * O que vem depois da vírgula precisa ser um número inteiro e nada além.
     * `"quatro"` e `"2 pessoas"` são os dois casos do `gtm.md`, e os dois voltam
     * com a mesma frase — porque para quem colou os dois são o mesmo engano.
     */
    if (!/^\d+$/.test(depois)) {
      recusadas.push({ original: bruta, motivo: MOTIVO_NUMERO });
      continue;
    }
    const pessoas = Number(depois);
    if (pessoas < 1 || !Number.isSafeInteger(pessoas)) {
      recusadas.push({ original: bruta, motivo: MOTIVO_NUMERO });
      continue;
    }

    aceitas.push({ nome, pessoasNoSlot: pessoas });
  }

  return { aceitas, recusadas, repetidos: nomesRepetidos(aceitas.map(a => a.nome)), excedeu };
}

/**
 * Os nomes que aparecem mais de uma vez, na ordem em que apareceram.
 *
 * A COMPARAÇÃO É EXATA — sem dobrar acento, sem ignorar caixa. "Ana Silva" e
 * "ana silva" são duas pessoas até prova em contrário, e o produto não tem prova
 * nenhuma. Um aviso falso ("dois nomes iguais") sobre duas pessoas diferentes
 * ensina a noiva a ignorar o aviso, e aí o aviso verdadeiro também some.
 */
export function nomesRepetidos(nomes: string[]): string[] {
  const contagem = new Map<string, number>();
  for (const nome of nomes) contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
  const saida: string[] = [];
  const vistos = new Set<string>();
  for (const nome of nomes) {
    if ((contagem.get(nome) ?? 0) > 1 && !vistos.has(nome)) {
      vistos.add(nome);
      saida.push(nome);
    }
  }
  return saida;
}

/* ------------------------------------------------------------------ *
 * 2. Busca no cliente — sem acento, sem caixa, sem rede (H-09, decisão P7)
 * ------------------------------------------------------------------ */

/**
 * Dobra de acento em JavaScript, e não no Postgres.
 *
 * A DECISÃO É A P7 DO PRD, e ela tem três consequências que valem escritas:
 * evita a extensão `unaccent` (o ADR 0001 é explícito sobre não pedir extensão
 * ao Neon), evita índice de busca, e — o que vale mais — **a lista inteira é
 * servida uma vez e cabe no cache do service worker**, então a identificação
 * funciona offline. No salão, sem rede, é a diferença entre o nome ser escolhido
 * e o nome ser digitado.
 */
export function dobrar(texto: string): string {
  return texto
    .normalize("NFD")
    /**
     * `\p{Diacritic}` e não a faixa `[̀-ͯ]` escrita à mão: a faixa
     * cobre o latim e deixa passar o resto, e — o que pesa mais aqui — ela é um
     * intervalo de caracteres invisíveis dentro do código-fonte. Um arquivo
     * salvo noutra codificação, um copiar-e-colar por um editor distraído, e a
     * faixa vira lixo **sem nada estourar**: a busca simplesmente para de dobrar
     * acento, e "João" deixa de achar "joao" no meio da festa.
     */
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Filtra a lista pelo que foi digitado. A partir de 1 caractere, sempre local. */
export function filtrarPorNome<T extends { nome: string }>(
  lista: T[],
  busca: string
): T[] {
  const alvo = dobrar(busca);
  if (alvo === "") return lista;
  return lista.filter(item => dobrar(item.nome).includes(alvo));
}

/* ------------------------------------------------------------------ *
 * 3. Acesso a dados — sempre com `evento_id` na cláusula (RN-25)
 * ------------------------------------------------------------------ */

export async function listarConvidados(
  eventoId: string,
  exec: Executor = sql
): Promise<Convidado[]> {
  const linhas = await exec`
    select *
      from convidados
     where evento_id = ${eventoId}
       and excluido_em is null
     order by ordem, nome
  `;
  return linhas.map(linhaParaConvidado);
}

/**
 * A lista que vai para o álbum: **só `id` e `nome`** (H-03).
 *
 * O recorte é da consulta, não da serialização, e a diferença importa: um
 * `select *` com o recorte feito depois deixaria `pessoas_no_slot` e `ausente`
 * viajarem até a memória do processo, e a próxima pessoa a mexer aqui teria os
 * dois à mão para "aproveitar". O convidado não precisa saber quantas pessoas o
 * casal contou na mesa dele, nem quem faltou.
 */
export async function listarConvidadosPublicos(
  eventoId: string,
  exec: Executor = sql
): Promise<ConvidadoPublico[]> {
  const linhas = await exec`
    select id, nome
      from convidados
     where evento_id = ${eventoId}
       and excluido_em is null
     order by ordem, nome
  `;
  return linhas.map(linha => ({
    id: paraTextoObrigatorio(linha.id, "convidados.id"),
    nome: paraTextoObrigatorio(linha.nome, "convidados.nome"),
  }));
}

export type ResultadoDaImportacao = {
  criados: number;
  jaExistiam: number;
  total: number;
};

/**
 * Importa os slots. **Reimportar não duplica** (H-03).
 *
 * A comparação é por nome exato entre os que já existem — e ela é feita no
 * servidor, sobre a lista viva do evento, não sobre o que o cliente mandou. O
 * caso real: a noiva cola a planilha, acrescenta 18 nomes na planilha e cola
 * tudo de novo. Sem isto ela teria 618 slots e um denominador destruído.
 *
 * O QUE ESTA REGRA CUSTA, e é aceito: dois "Tio Carlos" colados na **mesma**
 * importação viram dois slots (é o critério de aceite), mas colar "Tio Carlos"
 * de novo numa importação **seguinte** não cria um terceiro. A assimetria é
 * proposital — a segunda colagem é quase sempre a mesma planilha de novo, e a
 * tela diz quantos entraram e quantos já estavam.
 */
export async function importarConvidados(
  eventoId: string,
  linhas: LinhaLida[],
  exec: Executor = sql
): Promise<ResultadoDaImportacao> {
  const existentes = await exec`
    select nome, ordem from convidados
     where evento_id = ${eventoId} and excluido_em is null
  `;
  const jaTem = new Set(existentes.map(l => paraTexto(l.nome) ?? ""));
  let maiorOrdem = 0;
  for (const linha of existentes) maiorOrdem = Math.max(maiorOrdem, paraInteiro(linha.ordem, 0));

  const novos: LinhaLida[] = [];
  // O conjunto local existe para o caso "colou 'Ana Silva' duas vezes numa
  // importação em que ela ainda não existia": as duas entram, e é o que a H-03
  // manda. Sem ele, a segunda seria comparada contra um banco que ainda não
  // tinha a primeira.
  for (const linha of linhas) {
    if (jaTem.has(linha.nome)) continue;
    novos.push(linha);
  }

  if (novos.length > 0) {
    await exec`
      insert into convidados (evento_id, nome, pessoas_no_slot, ordem)
      select ${eventoId}::uuid, t.nome, t.pessoas, ${maiorOrdem} + t.posicao
        from unnest(
          ${novos.map(n => n.nome)}::text[],
          ${novos.map(n => n.pessoasNoSlot)}::int[],
          ${novos.map((_, i) => i + 1)}::int[]
        ) as t(nome, pessoas, posicao)
    `;
  }

  return {
    criados: novos.length,
    jaExistiam: linhas.length - novos.length,
    total: linhas.length,
  };
}

export type AtualizacaoDeConvidado = {
  nome?: string;
  pessoasNoSlot?: number;
  ausente?: boolean | null;
};

/**
 * Edita um slot. Devolve `null` quando ele não é deste evento — que vira 404,
 * nunca 403 (RN-25, e o comentário de `lib/api.ts`).
 */
export async function atualizarConvidado(
  eventoId: string,
  convidadoId: string,
  mudanca: AtualizacaoDeConvidado,
  exec: Executor = sql
): Promise<Convidado | null> {
  const linhas = await exec`
    update convidados
       set nome            = coalesce(${mudanca.nome ?? null}, nome),
           pessoas_no_slot = coalesce(${mudanca.pessoasNoSlot ?? null}, pessoas_no_slot),
           -- ausente é tri-estado: undefined nao mexe, null limpa, booleano
           -- grava. Um coalesce sozinho nao conseguiria LIMPAR o campo, e
           -- desmarcar "nao foi" e uma correcao que a noiva vai fazer.
           ausente         = case when ${mudanca.ausente === undefined}
                                  then ausente else ${mudanca.ausente ?? null} end,
           atualizado_em   = now()
     where id = ${convidadoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning *
  `;
  return linhas.length ? linhaParaConvidado(linhas[0]) : null;
}

/**
 * Exclusão **lógica** (padrão da casa, `dados.md` §7).
 *
 * E o slot excluído **continua contando na medição da janela do evento** se já
 * tiver mídia associada — é o critério de aceite da H-03, e é por isso que a
 * tela avisa antes: *"Se ela já mandou fotos, elas continuam no álbum e
 * continuam contando."* Uma exclusão física apagaria o denominador de uma
 * medição já feita, e nenhum número voltaria a bater.
 */
export async function excluirConvidado(
  eventoId: string,
  convidadoId: string,
  exec: Executor = sql
): Promise<boolean> {
  const linhas = await exec`
    update convidados
       set excluido_em = now(), atualizado_em = now()
     where id = ${convidadoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning id
  `;
  return linhas.length > 0;
}

export type ResumoDaLista = { slots: number; pessoas: number };

/** `300 nomes na lista` · `412 pessoas ao todo` — as duas grandezas, nunca somadas. */
export function resumoDaLista(convidados: Convidado[]): ResumoDaLista {
  return {
    slots: convidados.length,
    pessoas: convidados.reduce((total, c) => total + c.pessoasNoSlot, 0),
  };
}
