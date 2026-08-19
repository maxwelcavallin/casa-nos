import { sql, type Executor } from "@/lib/db";
import type { Visibilidade } from "@/lib/midias";
import { urlPublica } from "@/lib/r2";
import {
  paraInstante,
  paraInteiro,
  paraTexto,
  paraTextoObrigatorio,
} from "@/lib/serializar-linha";

/**
 * O FEED DA FESTA (H-11) — e ele é infraestrutura, não enfeite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE O FEED IMPORTA MAIS DO QUE PARECE (`escopo-core.md` §3.4): é ele que
 * mantém a aba aberta. No iOS a fila **não drena com a aba em segundo plano** —
 * o convidado que fecha o álbum depois de mandar deixa o original para trás. O
 * feed é o motivo de ele deixar a aba aberta, e por isso ele é caminho crítico
 * da entrega da foto, não uma tela de conteúdo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * OS QUATRO FILTROS, e cada um tem um teste próprio (H-11):
 *
 *   estado     = 'armazenada'                 a prévia confirmou
 *   visibilidade = 'feed'                     `noivos` NUNCA aparece
 *   aprovacao  in ('nao_requer','aprovada')   a fila segura o feed (RN-05)
 *   excluida_em is null                       exclusão é lógica (RN-20)
 *
 * A ORDEM É `armazenada_em desc, id desc` — hora do **servidor** (RN-16). O
 * relógio de aparelho erra, e uma foto com EXIF de 2019 no topo do feed de um
 * casamento é visível para 200 pessoas ao mesmo tempo. `capturada_em` existe na
 * tabela e não ordena nada.
 *
 * O índice parcial `midias_feed_idx` (migration 0006) cobre exatamente esta
 * cláusula. Sem ele a consulta mais quente do produto vira varredura: invisível
 * com 40 fotos, incidente com 4.000.
 */

/** Quantos cartões por página. Um lote conta como um cartão. */
export const PAGINA_DO_FEED = 40;

/** O teto de itens que o telão guarda em memória. Ver `TelaoDoSalao`. */
export const BUFFER_DO_TELAO = 60;

export type ItemDoFeed = {
  id: string;
  loteId: string;
  /** Quantas mídias no mesmo lote. 1 = foto solta; acima disso, cartão de rajada. */
  noLote: number;
  /**
   * O rótulo de quem enviou, ou `null`.
   *
   * ELE NÃO APARECE NA MINIATURA (design system, tela do feed): vive no
   * `aria-label` do card e na foto aberta. Numa grade de 104 px, um nome de 40
   * caracteres sobre a foto obrigaria a truncar — e nome truncado de terceiro é
   * pior que nome ausente.
   */
  rotulo: string | null;
  miniatura: string | null;
  previa: string | null;
  largura: number | null;
  altura: number | null;
  /** ISO, para o cursor. Nunca é exibido. */
  armazenadaEm: string;
};

export type PaginaDoFeed = {
  itens: ItemDoFeed[];
  /** Opaco para o cliente. `null` quando chegou ao começo da festa. */
  cursor: string | null;
};

type Cursor = { armazenadaEm: string; id: string };

/**
 * O cursor viaja como texto e volta validado.
 *
 * PAGINAÇÃO POR CURSOR, NÃO POR `offset` (B16): com 6.000 itens e fotos
 * chegando durante a rolagem, `offset` repete e pula linhas — o convidado rola e
 * vê a mesma foto duas vezes enquanto outra some. O par
 * `(armazenada_em, id)` é estável porque `id` desempata o que caiu no mesmo
 * milissegundo.
 */
export function lerCursor(bruto: string | null | undefined): Cursor | null {
  if (!bruto) return null;
  const partes = bruto.split("|");
  if (partes.length !== 2) return null;
  const instante = new Date(partes[0]);
  if (Number.isNaN(instante.getTime())) return null;
  return { armazenadaEm: instante.toISOString(), id: partes[1] };
}

export function escreverCursor(item: { armazenadaEm: string; id: string }): string {
  return `${item.armazenadaEm}|${item.id}`;
}

function linhaParaItem(linha: Record<string, unknown>, eventoId: string): ItemDoFeed {
  const id = paraTextoObrigatorio(linha.id, "midias.id");
  const armazenada = paraInstante(linha.armazenada_em);
  return {
    id,
    loteId: paraTextoObrigatorio(linha.lote_id, "midias.lote_id"),
    noLote: Math.max(1, paraInteiro(linha.no_lote, 1)),
    rotulo: paraTexto(linha.rotulo),
    miniatura: urlPublica(eventoId, id, "miniatura"),
    previa: urlPublica(eventoId, id, "previa"),
    largura: paraInteiro(linha.largura, 0) || null,
    altura: paraInteiro(linha.altura, 0) || null,
    armazenadaEm: (armazenada ?? new Date(0)).toISOString(),
  };
}

/**
 * Uma página do feed, com a rajada já agrupada (RN-17, B11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O AGRUPAMENTO É FEITO NO BANCO, e não no cliente, e isso é o que faz a
 * paginação funcionar. Agrupando no cliente, uma página de 40 mídias em que 30
 * são do mesmo lote entregaria **11 cartões** — o convidado rolaria três vezes
 * para encher a tela, e a página seguinte poderia trazer o resto do mesmo lote e
 * duplicar o cartão. Aqui a página tem 40 **cartões**, e a contagem de cada
 * lote é a contagem inteira dele, não a fração que caiu na página.
 *
 * `distinct on (lote_id)` escolhe UMA capa por lote: a mais recente, que é a
 * mesma regra da ordem geral. O `count(*) over (partition by lote_id)` conta o
 * lote inteiro antes do recorte.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function paginaDoFeed(
  eventoId: string,
  cursor: Cursor | null,
  limite: number = PAGINA_DO_FEED,
  exec: Executor = sql
): Promise<PaginaDoFeed> {
  const linhas = await exec`
    with visiveis as (
      select m.id, m.lote_id, m.armazenada_em, m.largura, m.altura,
             p.rotulo,
             count(*) over (partition by m.lote_id) as no_lote
        from midias m
        join participacoes p on p.id = m.participacao_id
       where m.evento_id = ${eventoId}
         and m.estado = 'armazenada'
         and m.visibilidade = 'feed'
         and m.aprovacao in ('nao_requer', 'aprovada')
         and m.excluida_em is null
    ), capas as (
      select distinct on (lote_id) *
        from visiveis
       order by lote_id, armazenada_em desc, id desc
    )
    select * from capas
     where ${cursor === null}
        or (armazenada_em, id) < (${cursor?.armazenadaEm ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
     order by armazenada_em desc, id desc
     limit ${limite + 1}
  `;

  const cheia = linhas.length > limite;
  const itens = linhas.slice(0, limite).map(linha => linhaParaItem(linha, eventoId));
  return {
    itens,
    // O cursor só existe quando há **mais** — pedir a próxima página e receber
    // vazio faria a tela mostrar um esqueleto que nunca preenche.
    cursor: cheia && itens.length > 0 ? escreverCursor(itens[itens.length - 1]) : null,
  };
}

export type Novidades = {
  /** Quantas mídias novas desde a marca. É o número do botão "12 fotos novas". */
  quantas: number;
  /** A marca de tempo mais recente, para a próxima sondagem. ISO. */
  ate: string;
};

/**
 * A SONDAGEM BARATA (H-11) — só quantidade e marca de tempo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE SONDAGEM E NÃO WEBSOCKET: está decidido em `escopo-core.md` §7 e não
 * se reabre aqui. O que vale registrar é o desenho desta rota, porque ele é o
 * que torna a decisão barata: ela devolve **um número e um instante**, o
 * suficiente para o cliente decidir se pergunta o resto. Com 200 convidados
 * perguntando a cada 5 s, são 40 requisições por segundo de uma consulta que o
 * índice parcial resolve por contagem — e a resposta é idêntica para todo mundo,
 * então a borda cacheia por 5 a 10 s e o banco vê uma consulta, não duzentas.
 *
 * A sondagem só roda **com a aba visível**. Uma aba de fundo perguntando a noite
 * inteira gasta bateria do convidado num aparelho que ele precisa que dure.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function novidadesDoFeed(
  eventoId: string,
  desde: Date | null,
  exec: Executor = sql
): Promise<Novidades> {
  const linhas = await exec`
    select count(*)::int as quantas, max(armazenada_em) as ate
      from midias
     where evento_id = ${eventoId}
       and estado = 'armazenada'
       and visibilidade = 'feed'
       and aprovacao in ('nao_requer', 'aprovada')
       and excluida_em is null
       and (${desde === null} or armazenada_em > ${desde?.toISOString() ?? null}::timestamptz)
  `;
  const linha = linhas[0] ?? {};
  const ate = paraInstante(linha.ate);
  return {
    quantas: paraInteiro(linha.quantas, 0),
    // Sem nada novo, a marca não anda: devolver "agora" faria a próxima
    // sondagem pular as fotos que chegaram entre a consulta e a resposta.
    ate: (ate ?? desde ?? new Date(0)).toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * O telão — o mesmo recorte, sem agrupamento e sem cursor
 * ------------------------------------------------------------------ */

export type FotoDoTelao = {
  id: string;
  /** A prévia de 1600 px. A miniatura de 400 px não sobrevive a 3 metros. */
  previa: string | null;
  rotulo: string | null;
  largura: number | null;
  altura: number | null;
  armazenadaEm: string;
};

/**
 * As fotos que o telão pode mostrar.
 *
 * **O MESMO RECORTE DO FEED, e não um parecido.** Se as duas consultas
 * divergirem, uma foto que o convidado tirou do feed continuaria na parede — e
 * a promessa da H-10 ("uma foto tirada do feed some do feed **e do telão**")
 * dependeria de alguém lembrar de mudar dois lugares. As duas filtram por
 * `armazenada`, `feed`, aprovação e `excluida_em is null`.
 *
 * SEM AGRUPAMENTO DE LOTE: na parede cada foto aparece sozinha, uma de cada vez.
 * O cartão de rajada é uma economia de rolagem numa grade, e não existe grade
 * aqui.
 *
 * A PRÉVIA E NÃO A MINIATURA: 400 px numa parede de 3 metros são 7 px por
 * centímetro. É a única superfície do produto que pede a faixa maior.
 */
export async function fotosDoTelao(
  eventoId: string,
  desde: Date | null,
  limite: number = BUFFER_DO_TELAO,
  exec: Executor = sql
): Promise<FotoDoTelao[]> {
  const linhas = await exec`
    select m.id, m.largura, m.altura, m.armazenada_em, p.rotulo
      from midias m
      join participacoes p on p.id = m.participacao_id
     where m.evento_id = ${eventoId}
       and m.estado = 'armazenada'
       and m.visibilidade = 'feed'
       and m.aprovacao in ('nao_requer', 'aprovada')
       and m.excluida_em is null
       and (${desde === null} or m.armazenada_em > ${desde?.toISOString() ?? null}::timestamptz)
     order by m.armazenada_em desc, m.id desc
     limit ${limite}
  `;
  return linhas.map(linha => {
    const id = paraTextoObrigatorio(linha.id, "midias.id");
    return {
      id,
      previa: urlPublica(eventoId, id, "previa"),
      rotulo: paraTexto(linha.rotulo),
      largura: paraInteiro(linha.largura, 0) || null,
      altura: paraInteiro(linha.altura, 0) || null,
      armazenadaEm: (paraInstante(linha.armazenada_em) ?? new Date(0)).toISOString(),
    };
  });
}

/* ------------------------------------------------------------------ *
 * "As minhas fotos" — duas perguntas, dois campos (H-08, RN-32)
 * ------------------------------------------------------------------ */

/**
 * "Já chegou?" — três valores, e **só o último é terminal** (RN-32c).
 *
 * `chegando`      nem a prévia confirmou
 * `ainda_subindo` a prévia confirmou, o original não. **Comunica continuidade.**
 * `completa`      as duas faixas. O único terminal.
 */
export type EstadoDeChegada = "chegando" | "ainda_subindo" | "completa";

/**
 * Uma mídia de "as minhas fotos".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AS DUAS PERGUNTAS VIAJAM EM **CAMPOS SEPARADOS** — é contrato da H-08, não
 * detalhe de serialização:
 *
 *   visibilidade → "quem vê isso?"   (`feed` · `noivos`)
 *   chegada      → "já chegou?"      (`chegando` · `ainda_subindo` · `completa`)
 *
 * Juntar as duas num campo único de "estado" obriga a interface a desjuntar, e é
 * assim que uma das duas some. A que some é sempre a mesma — "quem vê isso?" —,
 * porque o progresso do envio é o que parece urgente. E ela é justamente a
 * única pergunta que o convidado de fato faz (`pesquisa.md` §6.2).
 *
 * E **`aprovacao` não está aqui** (RN-07): o convidado não vê a fila de
 * moderação, em resposta nenhuma. Para ele, enviado é enviado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type MinhaMidia = {
  id: string;
  loteId: string;
  visibilidade: Visibilidade;
  chegada: EstadoDeChegada;
  miniatura: string | null;
  previa: string | null;
  criadaEm: string;
};

export type PaginaDeMinhas = {
  itens: MinhaMidia[];
  cursor: string | null;
  /** Total de mídias vivas desta participação. Vira `Você mandou N fotos.` */
  total: number;
  /** Quantas ainda têm versão maior pendente. Zero → o resumo do topo não existe. */
  originaisPendentes: number;
};

function chegadaDaLinha(linha: Record<string, unknown>): EstadoDeChegada {
  const previa = paraInstante(linha.previa_armazenada_em);
  const original = paraInstante(linha.original_armazenada_em);
  if (!previa) return "chegando";
  return original ? "completa" : "ainda_subindo";
}

/**
 * As fotos desta participação. **Só as dela** — o alcance `proprias` da matriz
 * vira um `participacao_id = ...` na cláusula, e é a rota que o acrescenta.
 *
 * A ORDEM É `criada_em desc` (a INTENÇÃO), e não `armazenada_em`: aqui a pessoa
 * procura a foto que ela acabou de mandar, e a que ela acabou de mandar é
 * justamente a que ainda não tem `armazenada_em`. Ordenar pela hora de chegada
 * jogaria as fotos que ainda sobem para o fim da lista — as únicas sobre as
 * quais ela tem alguma dúvida.
 */
export async function paginaDeMinhas(
  eventoId: string,
  participacaoId: string,
  cursor: Cursor | null,
  limite = PAGINA_DO_FEED,
  exec: Executor = sql
): Promise<PaginaDeMinhas> {
  const linhas = await exec`
    select id, lote_id, visibilidade, previa_armazenada_em, original_armazenada_em,
           criada_em
      from midias
     where evento_id = ${eventoId}
       and participacao_id = ${participacaoId}
       and excluida_em is null
       and (${cursor === null}
            or (criada_em, id) < (${cursor?.armazenadaEm ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
     order by criada_em desc, id desc
     limit ${limite + 1}
  `;

  const totais = await exec`
    select count(*)::int as total,
           count(*) filter (
             where previa_armazenada_em is not null and original_armazenada_em is null
           )::int as pendentes
      from midias
     where evento_id = ${eventoId}
       and participacao_id = ${participacaoId}
       and excluida_em is null
  `;

  const cheia = linhas.length > limite;
  const itens: MinhaMidia[] = linhas.slice(0, limite).map(linha => {
    const id = paraTextoObrigatorio(linha.id, "midias.id");
    return {
      id,
      loteId: paraTextoObrigatorio(linha.lote_id, "midias.lote_id"),
      visibilidade: linha.visibilidade === "noivos" ? "noivos" : "feed",
      chegada: chegadaDaLinha(linha),
      miniatura: urlPublica(eventoId, id, "miniatura"),
      previa: urlPublica(eventoId, id, "previa"),
      criadaEm: (paraInstante(linha.criada_em) ?? new Date(0)).toISOString(),
    };
  });

  const ultimo = itens[itens.length - 1];
  return {
    itens,
    cursor:
      cheia && ultimo ? escreverCursor({ armazenadaEm: ultimo.criadaEm, id: ultimo.id }) : null,
    total: paraInteiro(totais[0]?.total, 0),
    originaisPendentes: paraInteiro(totais[0]?.pendentes, 0),
  };
}
