import { sql, type Executor } from "@/lib/db";
import { escreverCursor, lerCursor, PAGINA_DO_FEED, type PaginaDoFeed } from "@/lib/feed";
import { urlPublicaDeFeed } from "@/lib/r2";
import { paraInstante, paraInteiro, paraTexto, paraTextoObrigatorio } from "@/lib/serializar-linha";

/**
 * A FILA DE APROVAÇÃO SEGURA O FEED, NUNCA O CASAL (H-13).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A FRASE DA HISTÓRIA É LITERAL E É O DESENHO INTEIRO: *"nada me obrigue a olhar
 * o celular durante a minha festa, e tudo que meus convidados mandaram já esteja
 * comigo mesmo sem aprovação."*
 *
 * Traduzido em SQL: `aprovacao` **não entra em nenhuma consulta do painel de
 * mídias** (H-14) e entra em **três** — a do feed, a do telão e esta. A fila
 * decide o que aparece na parede e na grade pública; ela não decide o que o
 * casal tem.
 *
 * O CARIMBO NASCE COM A INTENÇÃO E NUNCA É REPROCESSADO (RN-06,
 * `aprovacaoInicial` em `lib/midias.ts`). Ligar o interruptor às 22h30 não
 * aprova as dez que já esperavam, e desligá-lo não segura as próximas — mudar
 * uma configuração não pode mudar o que já aconteceu. É por isso que o
 * interruptor **oferece**, na mesma ação, aprovar o que está pendente: a
 * segunda ação é separada porque a decisão é outra.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O QUE O CONVIDADO VÊ DISSO TUDO: nada (RN-07). Nem selo, nem "em análise", nem
 * contador. Para ele, enviado é enviado — e `test/minhas-e-visibilidade.test.ts`
 * varre a resposta de `/minhas` atrás da palavra.
 */

export type AcaoDeModeracao = "aprovada" | "recusada";

export type ItemDaFila = {
  id: string;
  loteId: string;
  rotulo: string | null;
  miniatura: string | null;
  previa: string | null;
  /** ISO. Vira "A mais antiga chegou às 22h14." no rodapé da tela. */
  armazenadaEm: string;
};

export type PaginaDaFila = {
  itens: ItemDaFila[];
  cursor: string | null;
  /** Quantas pendentes no evento inteiro — o número do botão "Aprovar as 400". */
  total: number;
  /** A mais antiga. `null` com a fila vazia. ISO. */
  maisAntigaEm: string | null;
};

/**
 * Uma página da fila. **Sem agrupamento de lote** — ao contrário do feed.
 *
 * Aprovar é uma decisão por foto: agrupar uma rajada de 30 num cartão só
 * esconderia 29 fotos atrás de uma capa, e quem modera precisa ver o que está
 * liberando. A grade do feed agrupa porque lá o objetivo é rolar menos; aqui o
 * objetivo é olhar.
 *
 * A ordem é `armazenada_em asc`: a fila é uma fila, e a mais velha é a que está
 * esperando há mais tempo. É a **única** grade do produto que não é a mais nova
 * primeiro, e é de propósito.
 */
export async function paginaDaFila(
  eventoId: string,
  cursorBruto: string | null,
  limite: number = PAGINA_DO_FEED,
  exec: Executor = sql
): Promise<PaginaDaFila> {
  const cursor = lerCursor(cursorBruto);

  const linhas = await exec`
    select m.id, m.lote_id, m.armazenada_em, p.rotulo
      from midias m
      join participacoes p on p.id = m.participacao_id
     where m.evento_id = ${eventoId}
       and m.estado = 'armazenada'
       and m.visibilidade = 'feed'
       and m.aprovacao = 'pendente'
       and m.excluida_em is null
       and (${cursor === null}
            or (m.armazenada_em, m.id) > (${cursor?.armazenadaEm ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
     order by m.armazenada_em asc, m.id asc
     limit ${limite + 1}
  `;

  const totais = await exec`
    select count(*)::int as total, min(armazenada_em) as mais_antiga
      from midias
     where evento_id = ${eventoId}
       and estado = 'armazenada'
       and visibilidade = 'feed'
       and aprovacao = 'pendente'
       and excluida_em is null
  `;

  const cheia = linhas.length > limite;
  const itens: ItemDaFila[] = linhas.slice(0, limite).map(linha => {
    const id = paraTextoObrigatorio(linha.id, "midias.id");
    return {
      id,
      loteId: paraTextoObrigatorio(linha.lote_id, "midias.lote_id"),
      rotulo: paraTexto(linha.rotulo),
      // Só há `feed` aqui (ver o filtro da cláusula): o endereço é o público.
      miniatura: urlPublicaDeFeed(eventoId, id, "miniatura"),
      previa: urlPublicaDeFeed(eventoId, id, "previa"),
      armazenadaEm: (paraInstante(linha.armazenada_em) ?? new Date(0)).toISOString(),
    };
  });

  const ultimo = itens[itens.length - 1];
  return {
    itens,
    cursor: cheia && ultimo ? escreverCursor(ultimo) : null,
    total: paraInteiro(totais[0]?.total, 0),
    maisAntigaEm: (paraInstante(totais[0]?.mais_antiga) ?? null)?.toISOString() ?? null,
  };
}

export type ResultadoDaModeracao = {
  /** Quantas mudaram de fato. É o número do toast: "Aprovamos 380 fotos." */
  alteradas: number;
  /** Ids que continuam na lista. A tela mostra os dois números, nunca só este. */
  naoAlteradas: string[];
};

/** Acima disto o lote é recusado: 400 ids num corpo é o caso real, 50.000 não é. */
export const TETO_DO_LOTE = 1000;

/**
 * Modera um LOTE. **"Aprovar as 84" é um toque e uma requisição** (H-13).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UMA INSTRUÇÃO, NÃO UM LAÇO. Com 400 pendentes às 23h, um `update` por foto
 * seriam 400 idas ao banco pelo wifi de um salão — e a metade que falhasse
 * deixaria a tela sem saber o que aconteceu. Aqui a instrução é uma, o
 * `returning` diz exatamente o que mudou, e o que não voltou é o que continua na
 * lista.
 *
 * **O ÚLTIMO A ESCREVER VENCE, SEM ERRO E SEM CONFLITO VISÍVEL** (critério da
 * H-13): dois moderadores agindo ao mesmo tempo sobre a mesma foto produzem duas
 * escritas, e a segunda simplesmente sobrepõe. Não há verificação de versão, não
 * há 409, e não há diálogo de conflito — numa festa, um aviso de conflito é uma
 * pergunta que ninguém tem contexto para responder.
 *
 * `aprovacao = 'pendente'` na cláusula é o que torna a repetição inofensiva:
 * mandar o mesmo lote duas vezes muda zero na segunda, e a tela mostra "0
 * alteradas" em vez de contar duas vezes.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O QUE `recusada` **NÃO** FAZ: apagar. A mídia continua com o casal, no painel,
 * com o original e com a exportação (H-13). É a diferença entre "tirar do álbum"
 * e "excluir", e é por isso que o botão diz `Tirar do álbum`.
 */
export async function moderarEmLote(
  eventoId: string,
  ids: string[],
  acao: AcaoDeModeracao,
  acessoId: string | null,
  exec: Executor = sql
): Promise<ResultadoDaModeracao> {
  if (ids.length === 0) return { alteradas: 0, naoAlteradas: [] };

  const linhas = await exec`
    update midias
       set aprovacao    = ${acao},
           moderada_em  = now(),
           moderada_por = ${acessoId ?? null}::uuid
     where evento_id = ${eventoId}
       and id = any(${ids}::uuid[])
       and visibilidade = 'feed'
       and aprovacao = 'pendente'
       and excluida_em is null
    returning id
  `;

  const alteradas = new Set(linhas.map(l => paraTextoObrigatorio(l.id, "midias.id")));
  return {
    alteradas: alteradas.size,
    naoAlteradas: ids.filter(id => !alteradas.has(id)),
  };
}

/**
 * Aprova **tudo** que está pendente. É o "Aprovar as 400" quando a tela não tem
 * os 400 ids na mão — e é o que o interruptor oferece ao ser ligado.
 *
 * Sem lista de ids de propósito: mandar 400 uuid num corpo de requisição pelo
 * wifi do salão é 15 KB que podem não chegar, e a tela nem sempre carregou a
 * página inteira. O que a pessoa pediu foi "libera tudo", não "libera estas".
 */
export async function aprovarTodasAsPendentes(
  eventoId: string,
  acessoId: string | null,
  exec: Executor = sql
): Promise<number> {
  const linhas = await exec`
    update midias
       set aprovacao = 'aprovada', moderada_em = now(), moderada_por = ${acessoId ?? null}::uuid
     where evento_id = ${eventoId}
       and visibilidade = 'feed'
       and aprovacao = 'pendente'
       and excluida_em is null
    returning id
  `;
  return linhas.length;
}

/**
 * Quantas moderações aconteceram **durante a festa** — a linha 6 do painel do
 * dia (H-19) e o bloqueio 2 do verde (`metricas.md` §4).
 *
 * Maior que zero significa que alguém ficou no celular durante o casamento, que
 * é exatamente o que este produto promete evitar. O número existe para que a
 * promessa seja verificável, e não para ser bonito.
 */
export async function moderacoesDuranteAFesta(
  eventoId: string,
  inicio: Date,
  fim: Date,
  exec: Executor = sql
): Promise<number> {
  const linhas = await exec`
    select count(*)::int as quantas
      from midias
     where evento_id = ${eventoId}
       and moderada_em is not null
       and moderada_em >= ${inicio.toISOString()}::timestamptz
       and moderada_em <  ${fim.toISOString()}::timestamptz
  `;
  return paraInteiro(linhas[0]?.quantas, 0);
}

/** O tipo é reexportado para a tela não precisar importar de dois lugares. */
export type { PaginaDoFeed };
