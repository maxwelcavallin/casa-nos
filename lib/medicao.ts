import { sql, type Executor } from "@/lib/db";
import type { Evento } from "@/lib/eventos";
import { paraInteiro, paraNumero } from "@/lib/serializar-linha";

/**
 * O PAINEL DO DIA — sete números, e nenhum a mais (H-19, `metricas.md` §11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A FONTE É SQL, E ISSO É DECISÃO, NÃO PREFERÊNCIA. O Tempo Real do GA4 tem
 * janela de 30 minutos, não deduplica convidado, e **ignora exatamente os envios
 * offline que este produto existe para salvar**. Num salão com portal cativo ele
 * ignora também os próprios erros que descrevem o portal — o pacote que conta o
 * problema é o que o problema engole. A contagem que vale é esta.
 *
 * SETE, E NÃO QUATORZE: cada número a mais reduz a chance de alguém olhar os
 * sete que importam. Ficaram de fora, de propósito, aberturas de página,
 * sessões, usuários em tempo real e mídias por convidado — nenhum deles muda uma
 * decisão naquela noite.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `numeric` CHEGA COMO STRING (`dados.md` §6), e é aqui que ele para de ser.
 * Toda divisão desta tela produz fração, e uma participação de 40% vira 4000%
 * pelo mesmo motivo que um total de R$ 177 já virou R$ 12.200.000.055. A
 * conversão acontece nesta fronteira, uma vez, com `paraNumero`.
 */

/**
 * Cada linha responde separadamente. **A linha que falhou mostra erro; as outras
 * seis continuam** (H-19) — por isso o resultado é uma união, e não um objeto
 * com campos possivelmente nulos.
 */
export type Linha<T> = { ok: true; valor: T } | { ok: false };

const falhou = { ok: false } as const;

async function tentar<T>(consulta: () => Promise<T>): Promise<Linha<T>> {
  try {
    return { ok: true, valor: await consulta() };
  } catch {
    /**
     * O erro é engolido AQUI e vira `ok: false` — e a tela desenha o travessão
     * com o motivo. Deixá-lo subir derrubaria as outras seis linhas junto, que é
     * exatamente o que a H-19 proíbe: às 23h, seis números certos e um erro
     * valem infinitamente mais que uma tela de erro.
     */
    return falhou;
  }
}

/* ------------------------------------------------------------------ *
 * 1. Participação agora
 * ------------------------------------------------------------------ */

export type Participacao = {
  slotsPublicaram: number;
  slotsPresentes: number;
  /** `null` quando o casal ainda não digitou a contagem do buffet. */
  presentesContagem: number | null;
  pessoasTeto: number;
  /** Fração de slots. `null` sem denominador. */
  participacaoSlots: number | null;
  /** Piso por pessoa: slots que publicaram sobre presentes. `null` sem denominador. */
  pisoPessoas: number | null;
  /** Teto por pessoa: soma dos `pessoas_no_slot` sobre presentes. */
  tetoPessoas: number | null;
};

/**
 * A consulta canônica de `metricas.md` §1.4, lendo a view da migration 0008.
 *
 * TRÊS NÚMEROS, E NÃO UM (a §1.1 é explícita): P em slots, piso por pessoa e
 * teto por pessoa. A lista de convidados é de **slots** — "Família Silva, 4
 * pessoas" é uma linha —, e um slot que publicou pode significar uma pessoa ou
 * quatro. Reportar só a fração de slots como "participação" seria escolher, sem
 * dizer, uma das duas leituras.
 *
 * **SEM CONTAGEM DE PRESENTES DIGITADA, O NÚMERO NÃO EXISTE** (critério da
 * H-19): `presentesContagem` nulo devolve `null` nas duas frações, e a tela
 * escreve "Denominador ainda não informado". Nunca um número calculado sobre
 * denominador inventado — porque o número inventado seria bonito e seria usado.
 */
export async function participacaoAgora(
  eventoId: string,
  exec: Executor = sql
): Promise<Participacao> {
  const [linha] = await exec`
    select slots_presentes, slots_publicaram, pessoas_teto, presentes_contagem
      from vw_participacao_evento
     where evento_id = ${eventoId}
  `;

  const slotsPresentes = paraInteiro(linha?.slots_presentes, 0);
  const slotsPublicaram = paraInteiro(linha?.slots_publicaram, 0);
  const pessoasTeto = paraInteiro(linha?.pessoas_teto, 0);
  const presentesContagem = paraNumero(linha?.presentes_contagem);

  const dividir = (numerador: number, denominador: number | null) =>
    denominador && denominador > 0 ? numerador / denominador : null;

  return {
    slotsPublicaram,
    slotsPresentes,
    presentesContagem: presentesContagem === null ? null : Math.trunc(presentesContagem),
    pessoasTeto,
    participacaoSlots: dividir(slotsPublicaram, slotsPresentes || null),
    pisoPessoas: dividir(slotsPublicaram, presentesContagem),
    tetoPessoas: dividir(pessoasTeto, presentesContagem),
  };
}

/* ------------------------------------------------------------------ *
 * 3. Fila pendente e idade do item mais velho
 * ------------------------------------------------------------------ */

export type Fila = { pendentes: number; idadeDoMaisVelhoMinutos: number | null };

export async function filaAgora(eventoId: string, exec: Executor = sql): Promise<Fila> {
  const [linha] = await exec`
    select count(*)::int as pendentes,
           extract(epoch from (now() - min(armazenada_em))) / 60 as idade_minutos
      from midias
     where evento_id = ${eventoId}
       and estado = 'armazenada'
       and visibilidade = 'feed'
       and aprovacao = 'pendente'
       and excluida_em is null
  `;
  const idade = paraNumero(linha?.idade_minutos);
  return {
    pendentes: paraInteiro(linha?.pendentes, 0),
    // `extract(epoch ...)` volta como `numeric`, ou seja, como STRING. Sem
    // `paraNumero` a comparação "acima de 15 minutos" viraria comparação de
    // texto, e `"9" > "15"` é verdadeiro.
    idadeDoMaisVelhoMinutos: idade === null ? null : Math.floor(idade),
  };
}

/* ------------------------------------------------------------------ *
 * 4. Erros por tipo — e o quarto valor é o que decide a ação
 * ------------------------------------------------------------------ */

export type ErrosPorTipo = {
  rede: number;
  portal: number;
  servidor: number;
  arquivo: number;
};

/**
 * Erros das últimas horas, por tipo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **`rede` E `portal` PEDEM AÇÕES OPOSTAS, E É POR ISSO QUE SÃO DOIS VALORES.**
 *
 *   `rede`   — a internet CAIU. A resposta certa é **não fazer nada**: a fila
 *              existe exatamente para isso, e mexer só piora.
 *   `portal` — a internet MENTIU. O wifi do salão responde HTML com status 200
 *              a qualquer requisição; o envio parece ter completado e a foto não
 *              existe. É o único erro que produz **perda silenciosa**, e o único
 *              em que agir é obrigatório: trocar de rede ou passar para o QR do
 *              plano B.
 *
 * Colapsados num valor só, o painel recomendaria "não faça nada" no único caso
 * em que agir é obrigatório.
 *
 * **E É POR ISSO QUE ESTE NÚMERO SAI DO POSTGRES, E NÃO DO GA4.** Num portal
 * cativo, a requisição para o `/g/collect` também é interceptada: o evento que
 * descreve o portal é justamente o que o portal engole. Lá o valor é
 * subnotificado por construção — quando aparece já é diagnóstico, quando não
 * aparece não prova nada. Aqui ele é contado no servidor, que é o lado da rede
 * que funciona.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function errosPorTipo(
  eventoId: string,
  desde: Date,
  exec: Executor = sql
): Promise<ErrosPorTipo> {
  const [linha] = await exec`
    select
      count(*) filter (where tipo_erro = 'rede')::int     as rede,
      count(*) filter (where tipo_erro = 'portal')::int   as portal,
      count(*) filter (where tipo_erro = 'servidor')::int as servidor,
      count(*) filter (where tipo_erro = 'arquivo')::int  as arquivo
      from eventos_de_erro
     where evento_id = ${eventoId}
       and criado_em >= ${desde.toISOString()}::timestamptz
  `;
  return {
    rede: paraInteiro(linha?.rede, 0),
    portal: paraInteiro(linha?.portal, 0),
    servidor: paraInteiro(linha?.servidor, 0),
    arquivo: paraInteiro(linha?.arquivo, 0),
  };
}

/* ------------------------------------------------------------------ *
 * 5. Como estão mandando — a hipótese central
 * ------------------------------------------------------------------ */

export type Distribuicao = {
  total: number;
  paraFesta: number;
  paraNoivos: number;
  mexeram: number;
  fracaoFesta: number | null;
  fracaoNoivos: number | null;
  fracaoMexeram: number | null;
};

/**
 * A distribuição de visibilidade e a fração com o seletor mexido.
 *
 * É A LINHA QUE MEDE A HIPÓTESE S1, e ela mora no painel do dono e em nenhuma
 * tela que o casal ou o convidado abram — mostrar a distribuição a quem está
 * escolhendo contaminaria a escolha, e a razão entre os dois botões é o
 * instrumento inteiro.
 *
 * `visibilidade_alterada` é o sinal forte: a distribuição diz o que as pessoas
 * apertaram; ela diz que alguém **voltou e decidiu de novo**.
 */
export async function distribuicaoDeVisibilidade(
  eventoId: string,
  exec: Executor = sql
): Promise<Distribuicao> {
  const [linha] = await exec`
    select count(*)::int as total,
           count(*) filter (where visibilidade = 'feed')::int   as para_festa,
           count(*) filter (where visibilidade = 'noivos')::int as para_noivos,
           count(*) filter (where visibilidade_alterada)::int   as mexeram
      from midias
     where evento_id = ${eventoId}
       and estado = 'armazenada'
       and excluida_em is null
  `;
  const total = paraInteiro(linha?.total, 0);
  const fracao = (parte: number) => (total > 0 ? parte / total : null);
  const paraFesta = paraInteiro(linha?.para_festa, 0);
  const paraNoivos = paraInteiro(linha?.para_noivos, 0);
  const mexeram = paraInteiro(linha?.mexeram, 0);
  return {
    total,
    paraFesta,
    paraNoivos,
    mexeram,
    fracaoFesta: fracao(paraFesta),
    fracaoNoivos: fracao(paraNoivos),
    fracaoMexeram: fracao(mexeram),
  };
}

/* ------------------------------------------------------------------ *
 * 7. Alcance do loop
 * ------------------------------------------------------------------ */

export type Loop = {
  /**
   * Participações que **alcançaram o CTA**: têm ao menos uma mídia armazenada.
   *
   * É a condição exata em que o CTA é desenhado (H-16), então este número é o
   * denominador de verdade — e é melhor que o `growth_cta_viewed` do GA4, que
   * perde toda sessão que ficou sem rede num salão. O GA4 continua sendo a fonte
   * do funil; este é o número que se olha às 23h.
   */
  alcancaram: number;
  leads: number;
  leadsComData: number;
};

/**
 * O alcance do loop, e **por que "clicaram" não está aqui**.
 *
 * `metricas.md` §11 pede "viram · clicaram · leads com data". `viram` e
 * `clicaram` são eventos de GA4 (`growth_cta_viewed`, `growth_cta_clicked`) e
 * **não existem no Postgres**: o clique abre uma folha local, sem ida ao
 * servidor — de propósito, porque uma ida à rede a mais no salão é uma chance a
 * mais de falhar, e este produto já gasta a rede que tem com foto.
 *
 * Escrever um "clicaram" aqui exigiria uma requisição por toque só para
 * alimentar um painel. Em vez disso, esta linha mostra o que o servidor sabe: a
 * quantas pessoas o CTA **foi oferecido** e quantas deixaram contato. É uma
 * divergência de conteúdo com o `gtm.md` §5.15, declarada, e o motivo é que o
 * número inventado seria bonito e seria usado.
 */
export async function alcanceDoLoop(eventoId: string, exec: Executor = sql): Promise<Loop> {
  const [linha] = await exec`
    select
      (select count(distinct m.participacao_id) from midias m
        join participacoes p on p.id = m.participacao_id
       where m.evento_id = ${eventoId}
         and m.estado = 'armazenada'
         and m.excluida_em is null
         and p.papel = 'convidado')::int as alcancaram,
      (select count(*) from leads
        where evento_id_origem = ${eventoId} and excluido_em is null)::int as leads,
      (select count(*) from leads
        where evento_id_origem = ${eventoId} and excluido_em is null and tem_data)::int as com_data
  `;
  return {
    alcancaram: paraInteiro(linha?.alcancaram, 0),
    leads: paraInteiro(linha?.leads, 0),
    leadsComData: paraInteiro(linha?.com_data, 0),
  };
}

/* ------------------------------------------------------------------ *
 * O telão — não é um oitavo número, e é por isso que ele fica no cabeçalho
 * ------------------------------------------------------------------ */

export type SinalDoTelao = {
  /** Quantos links de telão vivos. Zero = ninguém abriu a parede ainda. */
  links: number;
  /** Minutos desde a última sondagem bem-sucedida. `null` = nunca falou. */
  ultimoUsoMinutos: number | null;
};

/**
 * "O telão ainda está falando com a gente?"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE É O CONSUMIDOR DE `evento_acessos.ultimo_uso_em`, o carimbo que a F1.4
 * escreveu sem ter tela que o lesse.
 *
 * O motivo está no topo de `components/telao/TelaoDoSalao.tsx`: **telão parado e
 * telão rodando são visualmente idênticos da pista de dança.** A parede não pode
 * contar que perdeu a rede — erro projetado num casamento é incidente, não
 * estado —, então ela fica muda e a evidência mora no banco. A distância entre
 * este carimbo e agora é a única forma de alguém descobrir que a parede
 * congelou.
 *
 * **NÃO É O OITAVO NÚMERO.** A H-19 diz sete, e sete é o teto — "cada número a
 * mais reduz a chance de alguém olhar os sete que importam". Este sinal vive no
 * cabeçalho, ao lado de "Atualiza a cada minuto", que é onde mora o estado do
 * próprio instrumento e não o estado da festa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function sinalDoTelao(
  eventoId: string,
  exec: Executor = sql
): Promise<SinalDoTelao> {
  const [linha] = await exec`
    select count(*)::int as links,
           extract(epoch from (now() - max(ultimo_uso_em))) / 60 as minutos
      from evento_acessos
     where evento_id = ${eventoId}
       and tipo = 'telao'
       and revogado_em is null
  `;
  const minutos = paraNumero(linha?.minutos);
  return {
    links: paraInteiro(linha?.links, 0),
    ultimoUsoMinutos: minutos === null ? null : Math.floor(minutos),
  };
}

/* ------------------------------------------------------------------ *
 * As sete linhas, juntas
 * ------------------------------------------------------------------ */

export type Medicao = {
  participacao: Linha<Participacao>;
  midias: Linha<{ armazenadas: number; emAltaResolucao: number }>;
  fila: Linha<Fila>;
  erros: Linha<ErrosPorTipo>;
  distribuicao: Linha<Distribuicao>;
  moderacoes: Linha<number>;
  loop: Linha<Loop>;
  telao: Linha<SinalDoTelao>;
  /** `false` antes de `inicio_festa_em`: as sete linhas dizem "ainda não começou". */
  comecou: boolean;
};

/** Quantas horas para trás o painel olha os erros. A festa cabe aqui. */
const JANELA_DE_ERROS_HORAS = 12;

/**
 * As sete linhas, **uma consulta por linha e nenhuma dependência entre elas**.
 *
 * Poderiam ser uma consulta só, com sete subselects, e seria mais rápido. Não
 * são, e o motivo é o critério de aceite: *"a linha que falhou mostra erro; as
 * outras seis continuam"*. Numa consulta única, um erro em qualquer subselect
 * derruba as sete — e a tela do dono, às 23h, mostraria uma tela de erro no
 * lugar de seis números certos.
 *
 * `Promise.all` porque as sete são independentes: sequenciais, seriam sete idas
 * ao banco em série a cada 60 s.
 */
export async function medicaoDoDia(
  evento: Evento,
  agora: Date,
  exec: Executor = sql
): Promise<Medicao> {
  const desde = new Date(agora.getTime() - JANELA_DE_ERROS_HORAS * 3600_000);
  const inicio = evento.inicioFestaEm;
  const fim = evento.fimFestaEm;

  const [participacao, midias, fila, erros, distribuicao, moderacoes, loop, telao] =
    await Promise.all([
      tentar(() => participacaoAgora(evento.id, exec)),
      tentar(async () => {
        const [linha] = await exec`
          select midias_armazenadas, originais_pendentes
            from evento_contadores where evento_id = ${evento.id}
        `;
        const armazenadas = paraInteiro(linha?.midias_armazenadas, 0);
        return {
          armazenadas,
          emAltaResolucao: Math.max(0, armazenadas - paraInteiro(linha?.originais_pendentes, 0)),
        };
      }),
      tentar(() => filaAgora(evento.id, exec)),
      tentar(() => errosPorTipo(evento.id, desde, exec)),
      tentar(() => distribuicaoDeVisibilidade(evento.id, exec)),
      tentar(async () => {
        // Sem os dois carimbos, "durante a festa" é indefinível (RN-10) — e
        // chutar aqui produziria o número que anula o verde por engano.
        if (!inicio || !fim) return 0;
        const [linha] = await exec`
          select count(*)::int as quantas
            from midias
           where evento_id = ${evento.id}
             and moderada_em is not null
             and moderada_em >= ${inicio.toISOString()}::timestamptz
             and moderada_em <  ${fim.toISOString()}::timestamptz
        `;
        return paraInteiro(linha?.quantas, 0);
      }),
      tentar(() => alcanceDoLoop(evento.id, exec)),
      tentar(() => sinalDoTelao(evento.id, exec)),
    ]);

  return {
    participacao,
    midias,
    fila,
    erros,
    distribuicao,
    moderacoes,
    loop,
    telao,
    // "Ainda não começou" é verdade; zero seria mentira (H-19, estado vazio).
    comecou: inicio ? agora >= inicio : false,
  };
}
