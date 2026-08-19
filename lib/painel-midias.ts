import { sql, type Executor } from "@/lib/db";
import { escreverCursor, lerCursor, PAGINA_DO_FEED, type EstadoDeChegada } from "@/lib/feed";
import type { Visibilidade } from "@/lib/midias";
import { urlDeLeitura } from "@/lib/r2";
import {
  paraInstante,
  paraInteiro,
  paraTexto,
  paraTextoObrigatorio,
} from "@/lib/serializar-linha";

/**
 * O CASAL VÊ O QUE CHEGOU, COM NÚMEROS HONESTOS (H-14).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUAS REGRAS DESTA TELA SÃO NÚMEROS, E AS DUAS SÃO PROMESSA DO PRODUTO:
 *
 * 1. **`1.842 fotos, 1.611 em alta resolução` — nunca um número só, nunca a
 *    soma.** Prévia faltando é PERDA; original faltando é QUALIDADE DEGRADADA
 *    (RN-14, RN-15). Um número só faria as duas virarem uma, e o casal veria um
 *    número pior que a realidade — que é justamente o que este produto promete
 *    nunca fazer.
 *
 * 2. **O número exibido nunca é maior que a realidade, e falha de leitura não
 *    produz número menor.** Por isso o erro tem lugar próprio na tela (um
 *    travessão, com o motivo) e nunca um zero: *"melhor não mostrar do que
 *    mostrar errado o número de fotos do casamento de alguém."*
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **`aprovacao` NÃO FILTRA NADA AQUI** (H-13). O casal vê tudo o que chegou:
 * pendente, aprovada, recusada e `noivos`. A fila decide feed e telão; ela nunca
 * decide o que o casal tem. É a mesma frase da H-13 escrita como ausência de
 * cláusula — e `test/painel-midias.test.ts` falha se a palavra aparecer na
 * consulta sem ser como filtro **escolhido pelo usuário**.
 */

export type Resumo = {
  /** Mídias com a prévia confirmada. O primeiro número. */
  armazenadas: number;
  /** Com as duas faixas. O segundo número, e ele NUNCA se soma ao primeiro. */
  emAltaResolucao: number;
  /** Prévia sim, original não. Qualidade degradada, em linha separada. */
  originaisPendentes: number;
  /** Intenções ainda sem prévia. É o "chegando", nunca "recebida". */
  chegando: number;
  bytesTotal: number;
  /** Quando o cron recomputou pela última vez. `null` = nunca. */
  recomputadoEm: string | null;
  /** A diferença encontrada no último recomputo. Zero é o valor esperado. */
  divergenciaUltima: number;
};

/**
 * O resumo, do AGREGADO MANTIDO — não de `count(*)` ao vivo (PRD §5.6).
 *
 * `count(*)` a cada sondagem, com 200 clientes, é o ponto 5 de quebra da §7 do
 * `escopo-core.md`. O agregado é escrito na mesma instrução da mudança de estado
 * (`confirmarFaixa`, `excluirMidia`) e **recomputado da verdade pelo cron
 * diário** — agregado sem recomputação vira número errado permanente, e este
 * produto tem regra explícita de nunca mostrar ao casal número menor que a
 * realidade.
 *
 * `emAltaResolucao` é derivado, e não uma quarta coluna: são as armazenadas
 * menos as que ainda têm original pendente. Guardar o mesmo fato em duas colunas
 * é como as duas divergem.
 */
export async function resumoDoEvento(
  eventoId: string,
  exec: Executor = sql
): Promise<Resumo> {
  const linhas = await exec`
    select midias_armazenadas, originais_pendentes, midias_intencao, bytes_total,
           recomputado_em, divergencia_ultima
      from evento_contadores
     where evento_id = ${eventoId}
  `;
  const linha = linhas[0] ?? {};
  const armazenadas = paraInteiro(linha.midias_armazenadas, 0);
  const originaisPendentes = paraInteiro(linha.originais_pendentes, 0);
  return {
    armazenadas,
    // `Math.max` porque o agregado pode ficar momentaneamente à frente da
    // verdade entre a confirmação da prévia e a do original. Um número negativo
    // na tela do casal seria pior que um número aproximado.
    emAltaResolucao: Math.max(0, armazenadas - originaisPendentes),
    originaisPendentes,
    chegando: paraInteiro(linha.midias_intencao, 0),
    bytesTotal: paraInteiro(linha.bytes_total, 0),
    recomputadoEm: paraInstante(linha.recomputado_em)?.toISOString() ?? null,
    divergenciaUltima: paraInteiro(linha.divergencia_ultima, 0),
  };
}

/** Os três filtros da H-14. **Três é o teto**, e a quarta informação vira legenda. */
export type FiltroDoPainel =
  | { tipo: "todas" }
  | { tipo: "noivos" }
  | { tipo: "pendentes" }
  | { tipo: "participacao"; participacaoId: string };

export function lerFiltro(
  tipo: string | null,
  participacaoId: string | null
): FiltroDoPainel {
  if (tipo === "noivos") return { tipo: "noivos" };
  if (tipo === "pendentes") return { tipo: "pendentes" };
  if (tipo === "participacao" && participacaoId) {
    return { tipo: "participacao", participacaoId };
  }
  // Lista fechada: qualquer outra coisa é `todas`. O parâmetro vem da URL e é
  // entrada de usuário; um valor livre chegando à cláusula é varredura barata.
  return { tipo: "todas" };
}

/** A aprovação, e ela existe **só nesta tela** (H-14). */
export type Aprovacao = "nao_requer" | "pendente" | "aprovada" | "recusada";

export type MidiaDoPainel = {
  id: string;
  participacaoId: string;
  /** O nome de quem enviou, ou `null` → a tela escreve `Convidado`. */
  rotulo: string | null;
  /** Pergunta 1: quem vê? */
  visibilidade: Visibilidade;
  /** Pergunta 2: já chegou? — o MESMO vocabulário da H-08 (RN-32). */
  chegada: EstadoDeChegada;
  /** Pergunta 3: aprovação. **Só o casal tem esta terceira.** */
  aprovacao: Aprovacao;
  miniatura: string | null;
  previa: string | null;
  /** `true` quando o original já chegou — decide o texto do botão de baixar (H-20). */
  temOriginal: boolean;
  criadaEm: string;
};

export type PaginaDoPainel = {
  itens: MidiaDoPainel[];
  cursor: string | null;
};

function aprovacaoDaLinha(valor: unknown): Aprovacao {
  const texto = String(valor ?? "");
  return texto === "pendente" || texto === "aprovada" || texto === "recusada"
    ? texto
    : "nao_requer";
}

/**
 * Uma página da grade do painel. **Todas as mídias do evento**, inclusive
 * `noivos` e inclusive pendentes.
 *
 * A ORDEM É `criada_em desc` — a hora da INTENÇÃO —, e não `armazenada_em`: o
 * casal também precisa ver o que ainda está chegando, e essas são justamente as
 * que não têm hora de chegada. Ordenar por `armazenada_em` jogaria as fotos em
 * trânsito para o fim, que é o oposto do que ele quer saber.
 */
export async function paginaDoPainel(
  eventoId: string,
  filtro: FiltroDoPainel,
  cursorBruto: string | null,
  limite: number = PAGINA_DO_FEED,
  exec: Executor = sql
): Promise<PaginaDoPainel> {
  const cursor = lerCursor(cursorBruto);
  const soNoivos = filtro.tipo === "noivos";
  const soPendentes = filtro.tipo === "pendentes";
  const daParticipacao = filtro.tipo === "participacao" ? filtro.participacaoId : null;

  const linhas = await exec`
    select m.id, m.participacao_id, m.visibilidade, m.aprovacao, m.criada_em,
           m.previa_armazenada_em, m.original_armazenada_em, p.rotulo
      from midias m
      join participacoes p on p.id = m.participacao_id
     where m.evento_id = ${eventoId}
       and m.excluida_em is null
       and (${!soNoivos} or m.visibilidade = 'noivos')
       and (${!soPendentes} or m.aprovacao = 'pendente')
       and (${daParticipacao === null} or m.participacao_id = ${daParticipacao}::uuid)
       and (${cursor === null}
            or (m.criada_em, m.id) < (${cursor?.armazenadaEm ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
     order by m.criada_em desc, m.id desc
     limit ${limite + 1}
  `;

  const cheia = linhas.length > limite;
  const itens = await Promise.all(
    linhas.slice(0, limite).map(async linha => {
      const id = paraTextoObrigatorio(linha.id, "midias.id");
      const visibilidade: Visibilidade = linha.visibilidade === "noivos" ? "noivos" : "feed";
      const previaEm = paraInstante(linha.previa_armazenada_em);
      const originalEm = paraInstante(linha.original_armazenada_em);
      /**
       * O endereço é decidido item a item (RN-33). Esta grade mistura as duas
       * visibilidades — é a tela do casal, ela vê tudo —, e uma foto `noivos`
       * sai daqui com URL assinada de 15 minutos, dentro de uma resposta que já
       * exigiu `midia.ver.todas`.
       */
      const [miniatura, previa] = await Promise.all([
        urlDeLeitura(eventoId, id, "miniatura", visibilidade),
        urlDeLeitura(eventoId, id, "previa", visibilidade),
      ]);
      const item: MidiaDoPainel = {
        id,
        participacaoId: paraTextoObrigatorio(linha.participacao_id, "midias.participacao_id"),
        rotulo: paraTexto(linha.rotulo),
        visibilidade,
        chegada: !previaEm ? "chegando" : originalEm ? "completa" : "ainda_subindo",
        aprovacao: aprovacaoDaLinha(linha.aprovacao),
        miniatura,
        previa,
        temOriginal: originalEm !== null,
        criadaEm: (paraInstante(linha.criada_em) ?? new Date(0)).toISOString(),
      };
      return item;
    })
  );

  const ultimo = itens[itens.length - 1];
  return {
    itens,
    cursor:
      cheia && ultimo
        ? escreverCursor({ armazenadaEm: ultimo.criadaEm, id: ultimo.id })
        : null,
  };
}

/* ------------------------------------------------------------------ *
 * H-23 — o aviso de rótulos repetidos, e só depois da festa
 * ------------------------------------------------------------------ */

export type RotuloRepetido = {
  rotulo: string;
  participacoes: Array<{ id: string; midias: number }>;
};

/**
 * Rótulos com mais de uma participação. **Nunca durante a festa** — quem decide
 * isso é a tela, comparando com `fim_festa_em`, e o motivo está lá.
 *
 * O QUE ESTA FUNÇÃO NÃO FAZ, e é metade da história (H-23): não junta
 * participações e não numera nada automaticamente. "Ana Silva (2)" seria o
 * produto batizando um convidado, e juntar álbuns seria mover mídia entre
 * participações — o que quebraria o alcance `proprias` de quem enviou. A única
 * ação oferecida é renomear **uma** delas.
 */
export async function rotulosRepetidos(
  eventoId: string,
  exec: Executor = sql
): Promise<RotuloRepetido[]> {
  const linhas = await exec`
    select p.rotulo,
           p.id,
           count(m.id)::int as midias
      from participacoes p
      left join midias m on m.participacao_id = p.id and m.excluida_em is null
     where p.evento_id = ${eventoId}
       and p.excluido_em is null
       and p.rotulo is not null
       and p.papel = 'convidado'
     group by p.rotulo, p.id
     having true
     order by p.rotulo asc, count(m.id) desc
  `;

  const porRotulo = new Map<string, RotuloRepetido>();
  for (const linha of linhas) {
    const rotulo = paraTexto(linha.rotulo);
    if (!rotulo) continue;
    const atual = porRotulo.get(rotulo) ?? { rotulo, participacoes: [] };
    atual.participacoes.push({
      id: paraTextoObrigatorio(linha.id, "participacoes.id"),
      midias: paraInteiro(linha.midias, 0),
    });
    porRotulo.set(rotulo, atual);
  }

  return [...porRotulo.values()].filter(r => r.participacoes.length > 1);
}
