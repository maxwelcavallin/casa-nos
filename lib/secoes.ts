import { sql, type Executor } from "@/lib/db";
import { paraBooleano, paraInteiro, paraTextoObrigatorio } from "@/lib/serializar-linha";

/**
 * AS SEÇÕES DO SITE — o catálogo em código, o estado no banco.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A DECISÃO DO DONO, 18/08/2026: **seções fixas com conteúdo editável.** O casal
 * preenche campos de seções que já existem, liga e desliga cada uma e ordena.
 * **Nunca editor de blocos livre.**
 *
 * A CONSEQUÊNCIA NO MODELO, e ela é o motivo de este arquivo existir:
 *
 *   O CATÁLOGO (quais seções existem, o nome de cada uma, qual não se desliga,
 *   a ordem padrão) vive **em código**, aqui. Ele é conhecido em tempo de
 *   compilação, cada seção tem um componente que a desenha e um editor que a
 *   escreve, e o `tsc` sabe disso. Uma tabela de catálogo daria uma seção que
 *   existe no banco e não tem componente — que renderiza nada e ninguém entende.
 *
 *   O ESTADO (o que **este** casal ligou, desligou e em que ordem pôs) vive no
 *   banco, em `evento_secoes` (migration 0012).
 *
 * **LINHA AUSENTE SIGNIFICA "O PADRÃO DO CATÁLOGO".** Um evento recém-criado não
 * tem nenhuma linha e mesmo assim renderiza certo; a linha nasce no primeiro
 * toque, com `on conflict (evento_id, chave) do update`. É por isso que a `0012`
 * não semeia nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ChaveDeSecao =
  | "capa"
  | "onde"
  | "programacao"
  | "historia"
  | "perguntas"
  | "indicacoes"
  | "rodape";

export type SecaoDoCatalogo = {
  chave: ChaveDeSecao;
  /** Como ela se chama na interface do painel. */
  nome: string;
  /** Uma linha dizendo o que entra ali. Aparece no painel, sob o nome. */
  explicacao: string;
  /**
   * `false` só para `capa` e `rodape`. E o interruptor **não existe** na tela
   * quando isto é `false` — um interruptor desabilitado convida a apertar.
   */
  podeDesligar: boolean;
  /**
   * Posição travada. `capa` é o nome do casal e a data; `rodape` carrega o nome
   * do produto, a única marca da página. As duas não entram na reordenação.
   */
  posicaoFixa: "primeira" | "ultima" | null;
  ordemPadrao: number;
};

/**
 * A ORDEM PADRÃO PÕE `onde` PRIMEIRO, e não a história do casal.
 *
 * O convidado abre o site para descobrir **onde e quando** — não para ler como
 * os noivos se conheceram. A ordem é do casal a partir do primeiro toque; o
 * padrão é o que serve a quem lê.
 */
export const CATALOGO: readonly SecaoDoCatalogo[] = [
  {
    chave: "capa",
    nome: "A capa",
    explicacao: "Os nomes de vocês, a data e o horário.",
    podeDesligar: false,
    posicaoFixa: "primeira",
    ordemPadrao: 0,
  },
  {
    chave: "onde",
    nome: "Onde e quando",
    explicacao: "A cidade, o local e quanto do endereço o site conta.",
    podeDesligar: true,
    posicaoFixa: null,
    ordemPadrao: 1,
  },
  {
    chave: "programacao",
    nome: "A programação do dia",
    explicacao: "Cerimônia, coquetel, festa — os horários do dia.",
    podeDesligar: true,
    posicaoFixa: null,
    ordemPadrao: 2,
  },
  {
    chave: "historia",
    nome: "A nossa história",
    explicacao: "Como vocês se conheceram, em um texto.",
    podeDesligar: true,
    posicaoFixa: null,
    ordemPadrao: 3,
  },
  {
    chave: "perguntas",
    nome: "Perguntas frequentes",
    explicacao: "Traje, estacionamento, criança — o que sempre perguntam.",
    podeDesligar: true,
    posicaoFixa: null,
    ordemPadrao: 4,
  },
  {
    chave: "indicacoes",
    nome: "Onde ficar e dicas",
    explicacao: "Hotéis e dicas da cidade para quem vem de fora.",
    podeDesligar: true,
    posicaoFixa: null,
    ordemPadrao: 5,
  },
  {
    chave: "rodape",
    nome: "O rodapé",
    explicacao: "O fecho da página.",
    podeDesligar: false,
    posicaoFixa: "ultima",
    ordemPadrao: 99,
  },
];

export const CHAVES_DE_SECAO: readonly ChaveDeSecao[] = CATALOGO.map(s => s.chave);

/**
 * `[secao]` da URL → chave conhecida.
 *
 * **LISTA DE PERMITIDOS DERIVADA DO CATÁLOGO, e não expressão regular** (PRD
 * §7.1). Uma expressão regular aceitaria `programacaozinha` e a consulta seguinte
 * voltaria vazia — o casal veria uma tela em branco em vez de 404. Chave
 * desconhecida é 404, e a validação acontece antes de qualquer consulta
 * (`dados.md` §3).
 */
export function ehChaveDeSecao(valor: unknown): valor is ChaveDeSecao {
  return (
    typeof valor === "string" &&
    (CHAVES_DE_SECAO as readonly string[]).includes(valor)
  );
}

export function secaoDoCatalogo(chave: ChaveDeSecao): SecaoDoCatalogo {
  const achada = CATALOGO.find(s => s.chave === chave);
  // Impossível pelo tipo; o `throw` existe para o dia em que alguém acrescentar
  // uma chave no union e esquecer o catálogo — falhar alto é melhor que
  // renderizar uma seção sem nome.
  if (!achada) throw new Error(`Seção fora do catálogo: ${chave}`);
  return achada;
}

/* ------------------------------------------------------------------ *
 * O estado: catálogo + o que este casal decidiu
 * ------------------------------------------------------------------ */

export type EstadoDaSecao = SecaoDoCatalogo & {
  ativa: boolean;
  ordem: number;
};

/**
 * Ordena as seções para exibição — **pura, e por isso testável sem banco**.
 *
 * `capa` primeiro, `rodape` último, e as cinco do meio por `ordem` crescente.
 * **O empate é desfeito pela CHAVE, nunca pelo `id`** (RV-04): `id` é uuid
 * aleatório, e a ordem do site mudaria a cada inserção — o casal veria as
 * seções trocando de lugar sozinhas, sem ter mexido em nada.
 */
export function ordenarSecoes(secoes: EstadoDaSecao[]): EstadoDaSecao[] {
  const peso = (s: EstadoDaSecao) =>
    s.posicaoFixa === "primeira" ? -1 : s.posicaoFixa === "ultima" ? 1 : 0;

  return [...secoes].sort((a, b) => {
    if (peso(a) !== peso(b)) return peso(a) - peso(b);
    if (a.ordem !== b.ordem) return a.ordem - b.ordem;
    return a.chave.localeCompare(b.chave);
  });
}

/**
 * O estado das sete seções deste evento, na ordem em que elas aparecem.
 *
 * O `evento_id` vem do evento já resolvido pelo servidor, nunca de parâmetro de
 * URL ou de corpo de requisição (`dados.md` §8). O executor entra por parâmetro
 * para o teste de vazamento entre inquilinos rodar sem banco.
 */
export async function listarSecoes(
  eventoId: string,
  exec: Executor = sql
): Promise<EstadoDaSecao[]> {
  const linhas = await exec`
    select chave, ativa, ordem
      from evento_secoes
     where evento_id = ${eventoId}
  `;

  const porChave = new Map<string, { ativa: boolean; ordem: number }>();
  for (const linha of linhas) {
    const chave = paraTextoObrigatorio(linha.chave, "evento_secoes.chave");
    // Chave gravada que o catálogo não conhece mais é IGNORADA, não quebra: uma
    // seção removida do produto deixaria linhas antigas no banco, e derrubar a
    // página do casal por causa delas seria o pior desfecho possível.
    if (!ehChaveDeSecao(chave)) continue;
    porChave.set(chave, {
      ativa: paraBooleano(linha.ativa),
      ordem: paraInteiro(linha.ordem),
    });
  }

  return ordenarSecoes(
    CATALOGO.map(secao => {
      const guardado = porChave.get(secao.chave);
      return {
        ...secao,
        // Linha ausente = o padrão do catálogo. Toda seção nasce LIGADA.
        ativa: guardado ? guardado.ativa : true,
        ordem: guardado ? guardado.ordem : secao.ordemPadrao,
      };
    })
  );
}

/* ------------------------------------------------------------------ *
 * A escrita — uma requisição, com a lista inteira
 * ------------------------------------------------------------------ */

export type MudancaDeSecao = { chave: ChaveDeSecao; ativa: boolean; ordem: number };

export type RecusaDeSecao = { chave: string; motivo: string };

/**
 * Confere a lista que chegou do painel. **Pura**, e é o que a rota usa.
 *
 * O QUE ELA RECUSA, e por quê:
 *   chave desconhecida  → 404 vestido de 400 seria pior; a rota devolve o motivo
 *   chave repetida      → duas ordens para a mesma seção, e a última venceria em
 *                         silêncio
 *   `capa`/`rodape` desligadas → RV-06. Um site de casamento sem a capa não é um
 *                         site de casamento, e o rodapé carrega a única marca da
 *                         página. O interruptor **não existe** na tela; isto é a
 *                         segunda tranca, para quem mandar um PATCH direto
 */
export function conferirSecoes(bruto: unknown): {
  mudancas: MudancaDeSecao[];
  recusas: RecusaDeSecao[];
} {
  const recusas: RecusaDeSecao[] = [];
  const mudancas: MudancaDeSecao[] = [];

  if (!Array.isArray(bruto)) {
    return { mudancas: [], recusas: [{ chave: "secoes", motivo: "Mande a lista inteira." }] };
  }

  const vistas = new Set<string>();

  for (const item of bruto) {
    if (!item || typeof item !== "object") {
      recusas.push({ chave: "secoes", motivo: "Item da lista sem forma de seção." });
      continue;
    }
    const linha = item as Record<string, unknown>;
    const chave = linha.chave;

    if (!ehChaveDeSecao(chave)) {
      recusas.push({ chave: String(chave), motivo: "Esta seção não existe." });
      continue;
    }
    if (vistas.has(chave)) {
      recusas.push({ chave, motivo: "Esta seção veio duas vezes na lista." });
      continue;
    }
    vistas.add(chave);

    const catalogo = secaoDoCatalogo(chave);
    const ativa = linha.ativa === undefined ? true : linha.ativa === true;

    if (!catalogo.podeDesligar && !ativa) {
      recusas.push({
        chave,
        motivo:
          chave === "capa"
            ? "A capa não pode ser desligada: é o nome de vocês e a data."
            : "O rodapé não pode ser desligado.",
      });
      continue;
    }

    const ordem = Number(linha.ordem);
    if (!Number.isSafeInteger(ordem)) {
      recusas.push({ chave, motivo: "A ordem precisa ser um número inteiro." });
      continue;
    }

    mudancas.push({ chave, ativa, ordem });
  }

  return { mudancas, recusas };
}

/**
 * Grava a lista inteira — **uma instrução, nunca N requisições** (RV-05).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE `unnest` E NÃO UM LAÇO: o driver HTTP do Neon executa **uma instrução
 * por requisição, sem transação abraçando o arquivo**. Sete `update` em sequência
 * numa conexão de celular à noite — que é onde este painel é usado — deixam a
 * ordem inconsistente no meio se a terceira falhar: duas seções na posição nova,
 * cinco na antiga, e nada avisando. Com `unnest`, ou as sete mudam, ou nenhuma.
 *
 * `on conflict (evento_id, chave) do update` é o que faz a linha nascer no
 * primeiro toque e não duplicar no segundo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function salvarSecoes(
  eventoId: string,
  mudancas: MudancaDeSecao[],
  exec: Executor = sql
): Promise<void> {
  if (mudancas.length === 0) return;

  const chaves = mudancas.map(m => m.chave);
  const ativas = mudancas.map(m => m.ativa);
  const ordens = mudancas.map(m => m.ordem);

  await exec`
    insert into evento_secoes (evento_id, chave, ativa, ordem)
    select ${eventoId}::uuid, t.chave, t.ativa, t.ordem
      from unnest(${chaves}::text[], ${ativas}::boolean[], ${ordens}::int[])
        as t(chave, ativa, ordem)
        on conflict (evento_id, chave) do update
           set ativa = excluded.ativa,
               ordem = excluded.ordem,
               atualizado_em = now()
  `;
}

/**
 * As seções ligadas, em ordem — o que a página pública renderiza.
 *
 * **RV-01: o conteúdo de seção desligada NÃO VIAJA NO HTML.** Quem chama isto
 * decide o que buscar a partir daqui: uma seção desligada não tem consulta, e
 * portanto não tem como o texto dela aparecer no código-fonte da página. "Não
 * renderizar" não esconde nada de quem abre o fonte, e é a mesma regra que
 * `recortePublico` já aplica ao nome do local.
 */
export function chavesLigadas(secoes: EstadoDaSecao[]): ChaveDeSecao[] {
  return ordenarSecoes(secoes)
    .filter(s => s.ativa)
    .map(s => s.chave);
}
