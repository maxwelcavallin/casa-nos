import { sql, type Executor } from "@/lib/db";
import { registrarErro } from "@/lib/observabilidade";
import { chavesDaMidia, type VisibilidadeDaChave } from "@/lib/r2";
import {
  clienteR2,
  varrerPublicoIndevido,
  type ClienteDeObjetos,
  type VarreduraDoPublico,
} from "@/lib/r2-objetos";
import { paraInstante, paraInteiro, paraTextoObrigatorio } from "@/lib/serializar-linha";

/**
 * RECONCILIAÇÃO — a rotina que adota a foto cujos bytes chegaram e cuja
 * confirmação se perdeu (H-15).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ELA É REQUISITO DA FATIA 1 E NÃO MELHORIA (`escopo-core.md` §3.4):
 *
 * O envio deste produto tem dois passos separados por uma rede ruim — o `PUT` no
 * R2 e o `POST` de confirmação. **O segundo é o que falha**, porque acontece
 * depois de o aparelho ter gastado o uplink inteiro subindo o arquivo. Sem esta
 * rotina, uma foto que chegou ao balde e não conseguiu avisar é contada como
 * perdida para sempre — e a promessa central do produto ("nenhuma foto se
 * perde") seria falsa exatamente no caso que ele existe para resolver.
 *
 * ELA É UM `HEAD` NAS CHAVES ESPERADAS, E NÃO UMA VARREDURA DO BALDE (V3). Isso
 * só é possível porque o `midia_id` nasce da linha de intenção: não pode haver
 * objeto sem linha, então a pergunta é sempre "este objeto que eu sei nomear
 * existe?" — nunca "o que há neste balde?".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TODA ADOÇÃO VIRA REGISTRO, com o `client_media_id` (critério da H-15). Uma
 * adoção significa que **uma confirmação se perdeu** — é informação sobre a rede
 * do salão, e não rotina silenciosa. É dela que sai o alerta de "mais de 5
 * adoções numa hora".
 */

export type Adocao = {
  midiaId: string;
  clientMediaId: string;
  faixas: Array<"previa" | "original">;
};

export type ResultadoDaReconciliacao = {
  conferidas: number;
  adocoes: Adocao[];
  /** Mídias com original presente e prévia ausente (B8). O cron marca; ver abaixo. */
  previaPendenteServidor: number;
};

type LinhaDeIntencao = {
  id: string;
  clientMediaId: string;
  tipoArquivo: string | null;
  visibilidade: VisibilidadeDaChave;
  previaEm: Date | null;
  originalEm: Date | null;
};

function lerIntencao(linha: Record<string, unknown>): LinhaDeIntencao {
  return {
    id: paraTextoObrigatorio(linha.id, "midias.id"),
    clientMediaId: paraTextoObrigatorio(linha.client_media_id, "midias.client_media_id"),
    tipoArquivo: linha.tipo_arquivo === null ? null : String(linha.tipo_arquivo),
    visibilidade: linha.visibilidade === "noivos" ? "noivos" : "feed",
    previaEm: paraInstante(linha.previa_armazenada_em),
    originalEm: paraInstante(linha.original_armazenada_em),
  };
}

/** Teto por passada. A rotina é idempotente; o que sobrar vai na próxima. */
export const TETO_POR_PASSADA = 500;

/**
 * O coração: para cada linha sem carimbo, um `HEAD` na chave esperada.
 *
 * A DATA DO OBJETO VIRA O CARIMBO, e não `now()`. Se a foto chegou às 22h14 e a
 * adoção acontece às 12h do dia seguinte, carimbar `now()` jogaria a foto para o
 * topo do feed no dia seguinte à festa (RN-16) — e mataria a curva de chegada
 * por hora, que é como se descobre em que momento a rede do salão caiu.
 *
 * IDEMPOTENTE (critério da H-15): a cláusula exige `previa_armazenada_em is
 * null`, então a segunda passada não muda nada e devolve zero adoções.
 */
async function adotarLinhas(
  eventoId: string,
  linhas: LinhaDeIntencao[],
  cliente: ClienteDeObjetos,
  exec: Executor
): Promise<ResultadoDaReconciliacao> {
  const adocoes: Adocao[] = [];
  let previaPendenteServidor = 0;

  for (const linha of linhas) {
    const chaves = chavesDaMidia(eventoId, linha.id, linha.tipoArquivo, linha.visibilidade);
    const faixas: Array<"previa" | "original"> = [];

    const previaNoBalde = linha.previaEm ? null : await cliente.cabeca(chaves.previa);
    const originalNoBalde = linha.originalEm ? null : await cliente.cabeca(chaves.original);

    if (previaNoBalde) {
      await exec`
        update midias
           set previa_armazenada_em      = ${(previaNoBalde.modificadoEm ?? new Date()).toISOString()}::timestamptz,
               armazenada_em             = ${(previaNoBalde.modificadoEm ?? new Date()).toISOString()}::timestamptz,
               estado                    = 'armazenada',
               adotada_por_reconciliacao = true,
               reconciliada_em           = now()
         where id = ${linha.id} and evento_id = ${eventoId}
           and previa_armazenada_em is null and excluida_em is null
      `;
      faixas.push("previa");
    }

    if (originalNoBalde) {
      await exec`
        update midias
           set original_armazenada_em    = ${(originalNoBalde.modificadoEm ?? new Date()).toISOString()}::timestamptz,
               adotada_por_reconciliacao = true,
               reconciliada_em           = now()
         where id = ${linha.id} and evento_id = ${eventoId}
           and original_armazenada_em is null and excluida_em is null
      `;
      faixas.push("original");
    }

    /**
     * ORIGINAL PRESENTE E PRÉVIA AUSENTE (P12, caso B8): o navegador não
     * conseguiu gerar a miniatura — HEIC exótico, memória de aparelho antigo.
     *
     * **A GERAÇÃO NO SERVIDOR NÃO ESTÁ AQUI, E A AUSÊNCIA É DECLARADA.** Ela
     * exige um decodificador de imagem no servidor (HEIC inclusive), que é uma
     * dependência nova e uma decisão de arquitetura — não algo para entrar de
     * lado dentro de um cron. O que existe agora é a **marca**: a linha fica com
     * `previa_pendente_servidor = true`, aparece no painel como qualidade
     * degradada e não some. Sem a marca, esse caso viraria "perda" no número da
     * H-15, que seria a leitura errada: os bytes estão no balde.
     */
    if (!linha.previaEm && !previaNoBalde && (linha.originalEm || originalNoBalde)) {
      await exec`
        update midias set previa_pendente_servidor = true
         where id = ${linha.id} and evento_id = ${eventoId} and previa_armazenada_em is null
      `;
      previaPendenteServidor += 1;
    }

    if (faixas.length > 0) {
      adocoes.push({ midiaId: linha.id, clientMediaId: linha.clientMediaId, faixas });
      await registrarErro(
        {
          origem: "servidor",
          rota: "interno/reconciliacao",
          sessaoTipo: "cron",
          eventoId,
          midiaId: linha.id,
          tipoErro: "rede",
          classe: "adocao",
          mensagem: `adotada ${faixas.join("+")} de client_media_id ${linha.clientMediaId}`,
        },
        exec
      );
    }
  }

  return { conferidas: linhas.length, adocoes, previaPendenteServidor };
}

/**
 * Gatilho 1 — **a participação reabre o álbum e diz o que julga pendente**.
 *
 * LIMITADO À PRÓPRIA PARTICIPAÇÃO (critério da H-15), e por isso a cláusula
 * carrega `participacao_id`: sem ela, um convidado dispararia `HEAD` no balde
 * inteiro do casamento a cada abertura de tela.
 *
 * É o gatilho que importa mais, e não o cron: quem reabre o álbum é justamente
 * quem tinha foto na fila. A adoção acontece **antes** de a grade responder, e a
 * pessoa vê a própria foto aparecer sem saber que houve conserto.
 */
export async function reconciliarParticipacao(
  eventoId: string,
  participacaoId: string,
  clientMediaIds: string[],
  opcoes: { cliente?: ClienteDeObjetos | null; exec?: Executor } = {}
): Promise<ResultadoDaReconciliacao> {
  const exec = opcoes.exec ?? sql;
  const cliente = opcoes.cliente === undefined ? clienteR2() : opcoes.cliente;
  const vazio: ResultadoDaReconciliacao = {
    conferidas: 0,
    adocoes: [],
    previaPendenteServidor: 0,
  };
  if (!cliente) return vazio;

  const linhas = await exec`
    select id, client_media_id, tipo_arquivo, visibilidade,
           previa_armazenada_em, original_armazenada_em
      from midias
     where evento_id = ${eventoId}
       and participacao_id = ${participacaoId}
       and excluida_em is null
       and (previa_armazenada_em is null or original_armazenada_em is null)
       and (${clientMediaIds.length === 0} or client_media_id = any(${clientMediaIds}::uuid[]))
     order by criada_em asc
     limit ${TETO_POR_PASSADA}
  `;
  if (linhas.length === 0) return vazio;

  return adotarLinhas(eventoId, linhas.map(lerIntencao), cliente, exec);
}

/** Gatilho 2 — o cron diário, sobre o evento inteiro. */
export async function reconciliarEvento(
  eventoId: string,
  opcoes: { cliente?: ClienteDeObjetos | null; exec?: Executor } = {}
): Promise<ResultadoDaReconciliacao> {
  const exec = opcoes.exec ?? sql;
  const cliente = opcoes.cliente === undefined ? clienteR2() : opcoes.cliente;
  const vazio: ResultadoDaReconciliacao = {
    conferidas: 0,
    adocoes: [],
    previaPendenteServidor: 0,
  };
  if (!cliente) return vazio;

  const linhas = await exec`
    select id, client_media_id, tipo_arquivo, visibilidade,
           previa_armazenada_em, original_armazenada_em
      from midias
     where evento_id = ${eventoId}
       and excluida_em is null
       and (previa_armazenada_em is null or original_armazenada_em is null)
     order by criada_em asc
     limit ${TETO_POR_PASSADA}
  `;
  if (linhas.length === 0) return vazio;

  return adotarLinhas(eventoId, linhas.map(lerIntencao), cliente, exec);
}

/* ------------------------------------------------------------------ *
 * O agregado, recomputado da verdade
 * ------------------------------------------------------------------ */

export type Recomputo = {
  armazenadas: number;
  originaisPendentes: number;
  intencao: number;
  bytesTotal: number;
  /** |agregado − verdade| em `midias_armazenadas`. O valor esperado é ZERO. */
  divergencia: number;
};

/**
 * Recomputa `evento_contadores` **da verdade** e registra a diferença.
 *
 * AGREGADO SEM RECOMPUTAÇÃO VIRA NÚMERO ERRADO PERMANENTE (PRD §5.6). O
 * incremento roda na mesma instrução da mudança de estado, o que resolve o caso
 * comum — mas basta uma linha excluída por caminho novo, ou um `update` manual,
 * para o número descolar. E o número descolado que ninguém recomputa é pior que
 * `count(*)`: ele é rápido, é errado e ninguém desconfia.
 *
 * `divergencia_ultima` fica gravada de propósito. Se ela deixar de ser zero
 * numa terça-feira qualquer, existe um caminho de escrita que não mantém o
 * contador — e o valor guardado é a única evidência de quando isso começou.
 */
export async function recomputarContadores(
  eventoId: string,
  exec: Executor = sql
): Promise<Recomputo> {
  const [verdade] = await exec`
    select
      count(*) filter (where previa_armazenada_em is not null and excluida_em is null)::int as armazenadas,
      count(*) filter (where previa_armazenada_em is not null
                         and original_armazenada_em is null
                         and excluida_em is null)::int as originais_pendentes,
      count(*) filter (where previa_armazenada_em is null and excluida_em is null)::int as intencao,
      coalesce(sum(bytes) filter (where previa_armazenada_em is not null and excluida_em is null), 0)::bigint as bytes_total
      from midias
     where evento_id = ${eventoId}
  `;

  const armazenadas = paraInteiro(verdade?.armazenadas, 0);
  const originaisPendentes = paraInteiro(verdade?.originais_pendentes, 0);
  const intencao = paraInteiro(verdade?.intencao, 0);
  const bytesTotal = paraInteiro(verdade?.bytes_total, 0);

  const [antes] = await exec`
    select midias_armazenadas from evento_contadores where evento_id = ${eventoId}
  `;
  const divergencia = Math.abs(paraInteiro(antes?.midias_armazenadas, 0) - armazenadas);

  await exec`
    insert into evento_contadores
      (evento_id, midias_armazenadas, midias_intencao, originais_pendentes, bytes_total,
       recomputado_em, divergencia_ultima, atualizado_em)
    values (${eventoId}::uuid, ${armazenadas}, ${intencao}, ${originaisPendentes},
            ${bytesTotal}, now(), ${divergencia}, now())
    on conflict (evento_id) do update set
      midias_armazenadas  = excluded.midias_armazenadas,
      midias_intencao     = excluded.midias_intencao,
      originais_pendentes = excluded.originais_pendentes,
      bytes_total         = excluded.bytes_total,
      recomputado_em      = now(),
      divergencia_ultima  = excluded.divergencia_ultima,
      atualizado_em       = now()
  `;

  return { armazenadas, originaisPendentes, intencao, bytesTotal, divergencia };
}

/* ------------------------------------------------------------------ *
 * O expurgo dos 30 dias
 * ------------------------------------------------------------------ */

/** RN-20. A exclusão é lógica; o objeto some 30 dias depois. */
export const CARENCIA_DE_EXPURGO_DIAS = 30;

/**
 * Apaga do R2 os objetos de mídias excluídas há mais de 30 dias.
 *
 * A LINHA NÃO É APAGADA, e é de propósito: ela continua carregando
 * `client_media_id`, `criada_em` e `excluida_por`, que é o que impede a mesma
 * foto de ser reenviada e recontada, e o que deixa a consulta de perda continuar
 * fazendo sentido depois do expurgo. O que some é o arquivo.
 *
 * `objeto_expurgado_em` é o carimbo que torna isto idempotente: a segunda
 * passada não tenta apagar de novo o que já foi.
 */
export async function expurgarExcluidas(
  eventoId: string,
  opcoes: { cliente?: ClienteDeObjetos | null; exec?: Executor } = {}
): Promise<{ expurgadas: number; objetos: number }> {
  const exec = opcoes.exec ?? sql;
  const cliente = opcoes.cliente === undefined ? clienteR2() : opcoes.cliente;
  if (!cliente) return { expurgadas: 0, objetos: 0 };

  const linhas = await exec`
    select id, tipo_arquivo, visibilidade
      from midias
     where evento_id = ${eventoId}
       and excluida_em is not null
       and excluida_em < now() - (${CARENCIA_DE_EXPURGO_DIAS} * interval '1 day')
       and objeto_expurgado_em is null
     limit ${TETO_POR_PASSADA}
  `;

  let objetos = 0;
  for (const linha of linhas) {
    const id = paraTextoObrigatorio(linha.id, "midias.id");
    const tipo = linha.tipo_arquivo === null ? null : String(linha.tipo_arquivo);
    /**
     * As DUAS visibilidades são apagadas, e não só a atual. Uma foto que já foi
     * `feed` e virou `noivos` pode ter deixado resto no outro prefixo — e o dia
     * do expurgo é o último em que alguém olha para ela.
     */
    for (const visibilidade of ["feed", "noivos"] as const) {
      const chaves = chavesDaMidia(eventoId, id, tipo, visibilidade);
      for (const chave of Object.values(chaves)) {
        if (await cliente.apagar(chave)) objetos += 1;
      }
    }
    await exec`
      update midias set objeto_expurgado_em = now()
       where id = ${id} and evento_id = ${eventoId}
    `;
  }

  return { expurgadas: linhas.length, objetos };
}

/* ------------------------------------------------------------------ *
 * A varredura de `pub/` — a guarda da RN-33
 * ------------------------------------------------------------------ */

/**
 * Diz, para um punhado de ids, se a mídia é `feed`, `noivos` ou excluída.
 *
 * É a ponte entre a listagem do balde e o banco. Fica aqui, e não em
 * `lib/r2-objetos.ts`, porque aquele arquivo não conhece SQL de propósito — é o
 * que deixa a coreografia da RN-33 ser testada sem banco.
 */
export function situacaoDasMidias(eventoId: string, exec: Executor = sql) {
  return async (ids: string[]): Promise<Map<string, VisibilidadeDaChave | "excluida">> => {
    const mapa = new Map<string, VisibilidadeDaChave | "excluida">();
    if (ids.length === 0) return mapa;
    const linhas = await exec`
      select id, visibilidade, excluida_em
        from midias
       where evento_id = ${eventoId} and id = any(${ids}::uuid[])
    `;
    for (const linha of linhas) {
      const id = paraTextoObrigatorio(linha.id, "midias.id");
      if (paraInstante(linha.excluida_em)) mapa.set(id, "excluida");
      else mapa.set(id, linha.visibilidade === "noivos" ? "noivos" : "feed");
    }
    return mapa;
  };
}

export async function varrerPublicoDoEvento(
  eventoId: string,
  opcoes: { cliente?: ClienteDeObjetos | null; exec?: Executor } = {}
): Promise<VarreduraDoPublico> {
  const exec = opcoes.exec ?? sql;
  const cliente = opcoes.cliente === undefined ? clienteR2() : opcoes.cliente;
  const varredura = await varrerPublicoIndevido(eventoId, situacaoDasMidias(eventoId, exec), cliente);

  if (varredura.indevidos.length > 0) {
    /**
     * Objeto indevido em `pub/` significa que uma troca de visibilidade **não
     * terminou** — o processo morreu entre o balde e o banco. Enquanto ele
     * existiu, a promessa "só os noivos veem esta foto" estava falsa. Isso é
     * incidente, e vai para a tabela que uma pessoa lê.
     */
    await registrarErro(
      {
        origem: "alerta",
        rota: "interno/reconciliacao",
        sessaoTipo: "cron",
        eventoId,
        tipoErro: "servidor",
        classe: "publico-indevido",
        mensagem:
          `${varredura.indevidos.length} objeto(s) em pub/ de midia noivos ou excluida; ` +
          `${varredura.removidos} removido(s)`,
      },
      exec
    );
  }

  return varredura;
}

/* ------------------------------------------------------------------ *
 * O veredito
 * ------------------------------------------------------------------ */

export type Perda = {
  /** Intenção que nunca virou prévia, passados 7 dias. **O valor esperado é 0.** */
  previasPerdidas: number;
  /** Qualidade degradada, e NUNCA somada com a de cima. */
  originaisPendentes: number;
};

/**
 * A consulta de perda — o **bloqueio 1** do verde.
 *
 * Lê as duas views da migration 0008 numa instrução. As duas em linhas separadas
 * de propósito: somá-las produziria um número que não significa nada, e mostrar
 * só a segunda esconderia a única que importa.
 */
export async function perdaDoEvento(eventoId: string, exec: Executor = sql): Promise<Perda> {
  const [linha] = await exec`
    select
      coalesce((select previas_perdidas from vw_perda_evento where evento_id = ${eventoId}), 0)::int
        as previas_perdidas,
      coalesce((select originais_pendentes from vw_originais_pendentes where evento_id = ${eventoId}), 0)::int
        as originais_pendentes
  `;
  return {
    previasPerdidas: paraInteiro(linha?.previas_perdidas, 0),
    originaisPendentes: paraInteiro(linha?.originais_pendentes, 0),
  };
}
