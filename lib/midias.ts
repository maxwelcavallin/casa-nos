import { sql, type Executor } from "@/lib/db";
import type { ModoDeModeracao } from "@/lib/eventos";
import {
  paraBooleano,
  paraBytes,
  paraInstante,
  paraTexto,
  paraTextoObrigatorio,
} from "@/lib/serializar-linha";

/**
 * A INTENÇÃO É REGISTRADA ANTES DOS BYTES (H-06, RN-13, decisão P3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA ORDEM É O PROJETO INTEIRO, e não uma preferência de arquitetura:
 *
 * Se a linha nascesse DEPOIS do upload, "nenhuma mídia se perdeu" mediria as
 * mídias que chegaram contra as mídias que chegaram — daria zero perda sempre,
 * inclusive na noite em que metade das fotos ficou no celular de alguém. O
 * critério de término da fatia seria decorativo, e ninguém descobriria isso até
 * o casal reclamar de uma foto que ele viu alguém tirando.
 *
 * Com a intenção primeiro, a perda vira uma consulta: intenções sem
 * `previa_armazenada_em` até D+7 (RN-14). E como a chave do objeto no R2 contém
 * o `midia_id`, que só existe depois desta linha, **não pode haver objeto sem
 * linha** — a reconciliação é um `HEAD` nas chaves esperadas em vez de uma
 * varredura do balde (PRD §3.1, V3).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TRÊS IDAS AO BANCO POR LOTE, independentemente do tamanho do lote. Não é
 * otimização prematura: o `escopo-core.md` §7 aponta o uplink do salão como o
 * ponto de quebra, e uma ida por arquivo transformaria um lote de 30 fotos em 30
 * chances de falhar antes de o primeiro byte de imagem sair.
 */

export type Visibilidade = "feed" | "noivos";
export type OrigemDaFoto = "camera" | "galeria";
export type FaixaDeEnvio = "previa" | "original";

export type ItemDeIntencao = {
  clientMediaId: string;
  loteId: string;
  bytes: number;
  tipoArquivo: string;
  hashConteudo: string | null;
  visibilidade: Visibilidade;
  origem: OrigemDaFoto | null;
  enfileiradaOffline: boolean;
};

export type Midia = {
  id: string;
  eventoId: string;
  participacaoId: string;
  loteId: string;
  clientMediaId: string;
  hashConteudo: string | null;
  estado: string;
  visibilidade: Visibilidade;
  aprovacao: string;
  tipoArquivo: string | null;
  bytes: number;
  previaArmazenadaEm: Date | null;
  originalArmazenadaEm: Date | null;
  criadaEm: Date | null;
  enfileiradaOffline: boolean;
};

function linhaParaMidia(linha: Record<string, unknown>): Midia {
  return {
    id: paraTextoObrigatorio(linha.id, "midias.id"),
    eventoId: paraTextoObrigatorio(linha.evento_id, "midias.evento_id"),
    participacaoId: paraTextoObrigatorio(linha.participacao_id, "midias.participacao_id"),
    loteId: paraTextoObrigatorio(linha.lote_id, "midias.lote_id"),
    clientMediaId: paraTextoObrigatorio(linha.client_media_id, "midias.client_media_id"),
    hashConteudo: paraTexto(linha.hash_conteudo),
    estado: paraTextoObrigatorio(linha.estado, "midias.estado"),
    visibilidade: linha.visibilidade === "noivos" ? "noivos" : "feed",
    aprovacao: paraTextoObrigatorio(linha.aprovacao, "midias.aprovacao"),
    tipoArquivo: paraTexto(linha.tipo_arquivo),
    bytes: paraBytes(linha.bytes),
    previaArmazenadaEm: paraInstante(linha.previa_armazenada_em),
    originalArmazenadaEm: paraInstante(linha.original_armazenada_em),
    criadaEm: paraInstante(linha.criada_em),
    enfileiradaOffline: paraBooleano(linha.enfileirada_offline),
  };
}

/**
 * O carimbo de aprovação nasce com a INTENÇÃO, e nunca é reprocessado (RN-06).
 *
 * O casal que liga a fila às 22h30, com dez fotos já pendentes, continua com
 * dez pendentes — e as próximas nascem `nao_requer` se ele desligar. Reprocessar
 * o passado significaria que mudar uma configuração muda o que já aconteceu, e
 * numa festa isso aparece como fotos sumindo do telão sem ninguém entender.
 */
export function aprovacaoInicial(modo: ModoDeModeracao): "nao_requer" | "pendente" {
  return modo === "fila" ? "pendente" : "nao_requer";
}

export type ResultadoDaIntencao = {
  midia: Midia;
  /** `true` quando a linha já existia — o cliente não sobe de novo (H-06). */
  jaExistia: boolean;
};

/**
 * Grava a intenção do lote inteiro. **Antes de qualquer URL ser assinada.**
 *
 * IDEMPOTENTE POR `(evento_id, client_media_id)` (RN-27): repetir o lote não
 * cria linha nova, devolve as existentes, e responde 200 — nunca 409. A fila que
 * dormiu a noite acorda e repete o lote para renovar as URLs de 24 h; se isso
 * fosse conflito, a foto viraria erro permanente no produto cujo eixo é
 * exatamente sobreviver a isso.
 *
 * A IDEMPOTÊNCIA DE VERDADE É DO BANCO, não desta função: duas requisições
 * simultâneas com o mesmo `client_media_id` passam as duas pelo `select` inicial
 * e chegam juntas ao `insert` — e é o índice único, com `on conflict do
 * nothing`, que garante uma linha só. O `select` daqui é economia de escrita,
 * não a garantia.
 *
 * DUPLICATA DE CONTEÚDO: `(participacao_id, hash_conteudo)` entre as vivas
 * devolve a mídia existente em vez de criar outra. É o reenvio por precaução —
 * a pessoa manda de novo porque não tem certeza de que foi —, e a atitude certa
 * quando a alternativa é perder.
 */
export async function registrarIntencao(
  eventoId: string,
  participacaoId: string,
  modoModeracao: ModoDeModeracao,
  itens: ItemDeIntencao[],
  exec: Executor = sql
): Promise<ResultadoDaIntencao[]> {
  if (itens.length === 0) return [];

  const clientIds = itens.map(i => i.clientMediaId);
  const hashes = itens.map(i => i.hashConteudo).filter((h): h is string => !!h);

  // 1. O que já existe — por client_media_id (reenvio do mesmo item) ou por hash
  //    (o mesmo arquivo escolhido duas vezes, com id novo).
  const existentes = await exec`
    select * from midias
     where evento_id = ${eventoId}
       and (
         client_media_id = any(${clientIds}::uuid[])
         or (participacao_id = ${participacaoId}
             and hash_conteudo = any(${hashes}::text[])
             and excluida_em is null)
       )
  `;

  const porClientId = new Map<string, Midia>();
  const porHash = new Map<string, Midia>();
  for (const linha of existentes) {
    const midia = linhaParaMidia(linha);
    porClientId.set(midia.clientMediaId, midia);
    if (midia.hashConteudo) porHash.set(midia.hashConteudo, midia);
  }

  const novos = itens.filter(
    i => !porClientId.has(i.clientMediaId) && !(i.hashConteudo && porHash.has(i.hashConteudo))
  );

  if (novos.length > 0) {
    const aprovacao = aprovacaoInicial(modoModeracao);

    /**
     * Uma instrução, com o contador na mesma transação implícita (decisão P13).
     *
     * O `insert ... select from unnest(...)` grava o lote inteiro numa ida; o
     * CTE do contador só roda sobre as linhas que a primeira parte realmente
     * inseriu, então repetir o lote não infla o número. Um `update` separado
     * daria o mesmo resultado no caminho feliz e um número errado permanente no
     * dia em que a segunda instrução não rodasse.
     */
    await exec`
      with inseridas as (
        insert into midias (
          evento_id, participacao_id, lote_id, client_media_id, hash_conteudo,
          visibilidade, aprovacao, origem, tipo_arquivo, bytes, enfileirada_offline
        )
        select ${eventoId}::uuid, ${participacaoId}::uuid, t.lote::uuid, t.cliente::uuid,
               nullif(t.hash, ''), t.visibilidade, ${aprovacao},
               nullif(t.origem, ''), nullif(t.tipo, ''), t.bytes, t.offline
          from unnest(
            ${novos.map(i => i.loteId)}::text[],
            ${novos.map(i => i.clientMediaId)}::text[],
            ${novos.map(i => i.hashConteudo ?? "")}::text[],
            ${novos.map(i => i.visibilidade)}::text[],
            ${novos.map(i => i.origem ?? "")}::text[],
            ${novos.map(i => i.tipoArquivo)}::text[],
            ${novos.map(i => i.bytes)}::bigint[],
            ${novos.map(i => i.enfileiradaOffline)}::boolean[]
          ) as t(lote, cliente, hash, visibilidade, origem, tipo, bytes, offline)
        on conflict do nothing
        returning id
      )
      insert into evento_contadores (evento_id, midias_intencao)
      select ${eventoId}::uuid, count(*)::int from inseridas
       having count(*) > 0
      on conflict (evento_id) do update
        set midias_intencao = evento_contadores.midias_intencao + excluded.midias_intencao,
            atualizado_em = now()
    `;
  }

  // 3. A verdade final vem do banco, e não da nossa contabilidade em memória:
  //    entre o `select` e o `insert` outra requisição pode ter criado a linha.
  const finais = await exec`
    select * from midias
     where evento_id = ${eventoId}
       and client_media_id = any(${clientIds}::uuid[])
  `;

  const porId = new Map<string, Midia>();
  for (const linha of finais) {
    const midia = linhaParaMidia(linha);
    porId.set(midia.clientMediaId, midia);
  }

  const saida: ResultadoDaIntencao[] = [];
  for (const item of itens) {
    const daVez =
      porId.get(item.clientMediaId) ??
      (item.hashConteudo ? porHash.get(item.hashConteudo) : undefined);
    if (!daVez) continue;
    const jaExistia =
      porClientId.has(item.clientMediaId) ||
      (!!item.hashConteudo && porHash.has(item.hashConteudo));
    saida.push({ midia: daVez, jaExistia });
  }
  return saida;
}

export type ResultadoDaConfirmacao = {
  midia: Midia;
  /**
   * `false` quando esta faixa já estava confirmada. O cliente usa isto para não
   * disparar `media_upload_succeeded` duas vezes (RN-28) — e o servidor devolve
   * 200 nos dois casos, porque repetir a confirmação **não é erro**.
   */
  mudou: boolean;
};

/**
 * Confirma UMA faixa. Idempotente por `(midia_id, faixa)`.
 *
 * DUAS FAIXAS, DOIS CARIMBOS, E ELES NÃO SÃO A MESMA COISA (RN-14, RN-15):
 * prévia faltando é **perda**; original faltando é **qualidade degradada**. Um
 * carimbo só faria os dois números virarem um, e o painel mostraria ao casal um
 * número pior que a realidade — que é justamente o que este produto promete
 * nunca fazer.
 *
 * `armazenada_em = previa_armazenada_em` de propósito: a ordem do feed é a hora
 * do SERVIDOR na faixa que conta. Se o original carimbasse `armazenada_em`, uma
 * foto de 40 MB que terminou de subir no dia seguinte pularia para o topo do
 * feed do casamento (RN-16).
 */
export async function confirmarFaixa(
  eventoId: string,
  midiaId: string,
  participacaoId: string,
  faixa: FaixaDeEnvio,
  dados: { bytesPrevia?: number | null; largura?: number | null; altura?: number | null },
  exec: Executor = sql
): Promise<ResultadoDaConfirmacao | null> {
  /**
   * O RESULTADO SAI DO `returning` DO PRÓPRIO `update`, e não de um `select`
   * depois dele. Não é estilo: um `select` na mesma instrução enxerga o
   * instantâneo ANTERIOR à escrita do CTE — a linha voltaria com
   * `previa_armazenada_em` nulo logo depois de ter sido carimbada, e o cliente
   * concluiria que a faixa não subiu e mandaria de novo. Para sempre.
   */
  const alterada =
    faixa === "previa"
      ? await exec`
          with alvo as (
            update midias
               set previa_armazenada_em = now(),
                   armazenada_em        = now(),
                   estado               = 'armazenada',
                   bytes_previa         = coalesce(${dados.bytesPrevia ?? null}, bytes_previa),
                   largura              = coalesce(${dados.largura ?? null}, largura),
                   altura               = coalesce(${dados.altura ?? null}, altura)
             where id = ${midiaId}
               and evento_id = ${eventoId}
               and participacao_id = ${participacaoId}
               and previa_armazenada_em is null
               and excluida_em is null
            returning *
          ), contador as (
            insert into evento_contadores
              (evento_id, midias_armazenadas, midias_intencao, originais_pendentes, bytes_total)
            select ${eventoId}::uuid, 1, 0, 1, coalesce(bytes, 0) from alvo
            on conflict (evento_id) do update set
              midias_armazenadas  = evento_contadores.midias_armazenadas + 1,
              midias_intencao     = greatest(evento_contadores.midias_intencao - 1, 0),
              originais_pendentes = evento_contadores.originais_pendentes + 1,
              bytes_total         = evento_contadores.bytes_total + excluded.bytes_total,
              atualizado_em       = now()
            returning evento_id
          )
          select * from alvo
        `
      : await exec`
          with alvo as (
            update midias
               set original_armazenada_em = now()
             where id = ${midiaId}
               and evento_id = ${eventoId}
               and participacao_id = ${participacaoId}
               and original_armazenada_em is null
               and excluida_em is null
            returning *
          ), contador as (
            insert into evento_contadores (evento_id, originais_pendentes)
            select ${eventoId}::uuid, 0 from alvo
            on conflict (evento_id) do update set
              originais_pendentes = greatest(evento_contadores.originais_pendentes - 1, 0),
              atualizado_em       = now()
            returning evento_id
          )
          select * from alvo
        `;

  if (alterada.length) return { midia: linhaParaMidia(alterada[0]), mudou: true };

  /**
   * Nada mudou. São dois casos MUITO diferentes, e a segunda consulta existe só
   * para separá-los: a faixa já estava confirmada (200, idempotente — repetir
   * confirmação não é erro) ou a mídia não é desta participação/evento (404).
   * Ela só roda no caminho da repetição, que é raro.
   */
  const existente = await exec`
    select * from midias
     where id = ${midiaId}
       and evento_id = ${eventoId}
       and participacao_id = ${participacaoId}
     limit 1
  `;
  if (!existente.length) return null;
  return { midia: linhaParaMidia(existente[0]), mudou: false };
}

/* ------------------------------------------------------------------ *
 * H-10 — a visibilidade, e ela volta atrás para sempre
 * ------------------------------------------------------------------ */

export type TrocaDeVisibilidade = {
  midia: Midia;
  /** O valor ANTERIOR. Vira `media_visibility_from` no GA4 (`metricas.md` §6). */
  de: Visibilidade;
  /** `false` quando o valor já era esse. A tela não dispara evento nem toast. */
  mudou: boolean;
};

/**
 * Troca a visibilidade de UMA mídia. **Só a participação que enviou.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA É A ÚNICA FUNÇÃO DO PRODUTO QUE ESCREVE `midias.visibilidade`, e isso é a
 * decisão de modelagem mais importante do PRD (§3.2, P2).
 *
 * O casal nunca escreve nesta coluna. Quando ele tira algo do feed, escreve
 * `midias.aprovacao = 'recusada'` — outra coluna, outro caminho. É o que
 * transforma "o casal nunca promove `noivos` para o feed" numa
 * **impossibilidade estrutural** em vez de um `if` que alguém remove daqui a um
 * ano sem entender o que estava segurando.
 *
 * A matriz (`lib/autorizacao.ts`) é a SEGUNDA tranca, não a primeira. As duas
 * existem porque a primeira depende de ninguém escrever um
 * `update midias set visibilidade` novo, e a segunda depende de ninguém mexer na
 * matriz. `test/autorizacao-matriz.test.ts` e `test/visibilidade.test.ts`
 * guardam uma cada.
 *
 * `participacao_id` ENTRA NA CLÁUSULA, e não é redundância com a matriz: a
 * matriz diz que o alcance é `proprias`, e é aqui que `proprias` vira SQL. Sem
 * esta linha, um convidado trocaria a visibilidade da foto de outro — e o outro
 * descobriria pelo telão.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function trocarVisibilidade(
  eventoId: string,
  midiaId: string,
  participacaoId: string,
  novaVisibilidade: Visibilidade,
  exec: Executor = sql
): Promise<TrocaDeVisibilidade | null> {
  const antes = await exec`
    select * from midias
     where id = ${midiaId}
       and evento_id = ${eventoId}
       and participacao_id = ${participacaoId}
       and excluida_em is null
     limit 1
  `;
  if (!antes.length) return null;

  const anterior = linhaParaMidia(antes[0]);
  if (anterior.visibilidade === novaVisibilidade) {
    return { midia: anterior, de: anterior.visibilidade, mudou: false };
  }

  const depois = await exec`
    update midias
       set visibilidade = ${novaVisibilidade},
           -- visibilidade_alterada e o instrumento da hipotese S1: ela mede a
           -- fracao de midias em que o convidado MEXEU, que e o sinal de
           -- demanda (metricas.md §3). Ela nunca volta a false: mexer e
           -- desmexer continua sendo ter mexido.
           visibilidade_alterada = true
     where id = ${midiaId}
       and evento_id = ${eventoId}
       and participacao_id = ${participacaoId}
       and excluida_em is null
    returning *
  `;
  if (!depois.length) return null;

  return {
    midia: linhaParaMidia(depois[0]),
    de: anterior.visibilidade,
    mudou: true,
  };
}

export type QuemExcluiu = "convidado" | "casal";

/**
 * Apaga uma mídia. **Exclusão lógica**, com 30 dias de carência para o objeto
 * no R2 (RN-20).
 *
 * DOIS CAMINHOS, E ELES NÃO SÃO O MESMO (PRD §7): quem enviou apaga a própria
 * (`escopo` = `proprias`, e `participacaoId` entra na cláusula); o casal apaga
 * qualquer uma (`escopo` = `todas`, e a cláusula é só o evento). O moderador
 * **não** apaga — ele foi designado para decidir o que aparece na parede, não o
 * que o casal guarda.
 *
 * O CONTADOR CAI NA MESMA INSTRUÇÃO (decisão P13). Um `update` separado daria o
 * mesmo resultado no caminho feliz e um número errado permanente no dia em que a
 * segunda instrução não rodasse — e o painel mostraria ao casal um número maior
 * que a realidade, que é o lado errado de errar aqui.
 */
export async function excluirMidia(
  eventoId: string,
  midiaId: string,
  por: QuemExcluiu,
  participacaoId: string | null,
  exec: Executor = sql
): Promise<Midia | null> {
  const linhas = await exec`
    with alvo as (
      update midias
         set excluida_em = now(), excluida_por = ${por}
       where id = ${midiaId}
         and evento_id = ${eventoId}
         and (${participacaoId === null} or participacao_id = ${participacaoId ?? null}::uuid)
         and excluida_em is null
      returning *
    ), contador as (
      update evento_contadores c
         set midias_armazenadas  = greatest(
               c.midias_armazenadas - (select count(*) from alvo where estado = 'armazenada'), 0),
             originais_pendentes = greatest(
               c.originais_pendentes - (
                 select count(*) from alvo
                  where previa_armazenada_em is not null
                    and original_armazenada_em is null), 0),
             atualizado_em = now()
       where c.evento_id = ${eventoId}
         and exists (select 1 from alvo)
      returning c.evento_id
    )
    select * from alvo
  `;
  return linhas.length ? linhaParaMidia(linhas[0]) : null;
}

/** Uma tentativa a mais neste item — o que a fila relata ao retentar (H-07). */
export async function contarTentativa(
  eventoId: string,
  midiaId: string,
  exec: Executor = sql
): Promise<void> {
  await exec`
    update midias set tentativas = tentativas + 1
     where id = ${midiaId} and evento_id = ${eventoId}
  `;
}
