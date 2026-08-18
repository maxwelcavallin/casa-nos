import { sql, type Executor } from "@/lib/db";
import { ehSlug, normalizarDominio } from "@/lib/ids";
import {
  paraBooleano,
  paraInteiro,
  paraNumero,
  paraTexto,
  paraTextoObrigatorio,
} from "@/lib/serializar-linha";

/**
 * O EVENTO É O INQUILINO.
 *
 * Não existe "o casamento da Ana e do Maxwel" no código: existe um evento, que
 * hoje é o deles. Toda tabela de domínio carrega `evento_id`, e **toda consulta
 * filtra por ele no servidor** — nunca por um id que veio do cliente. O segundo
 * casal entra com um `INSERT`, sem migration e sem deploy.
 *
 * Vazamento entre inquilinos é o bug mais caro deste modelo e é invisível em
 * teste com um inquilino só. Por isso as funções daqui aceitam o executor por
 * parâmetro: `test/eventos-escopo.test.ts` roda com dois casamentos e prova que
 * um não lê o outro, sem precisar de banco.
 */

export type Evento = {
  id: string;
  slug: string;
  /** Como o casal quer ser lido no `h1`: "Ana Flávia e Maxwel". */
  nomeCasal: string;
  dataEvento: string; // "2027-08-22" — coluna `date`, string pura
  fuso: string;

  horaEvento: string | null; // "16:00:00"
  horaPublicada: boolean;

  cidade: string;
  uf: string;

  /**
   * O NOME e o LUGAR são publicados separadamente, de propósito.
   *
   * O casal quer o mapa visível e o nome do local escondido: o convidado
   * entende para que lado da cidade vai, e o estabelecimento não é
   * identificável. São duas decisões independentes e por isso são duas flags —
   * revelar o nome depois é mudança de DADO, não de código nem de migration.
   */
  localNome: string | null;
  localNomePublicado: boolean;

  localEndereco: string | null;
  localLatitude: number | null;
  localLongitude: number | null;
  /** Raio de imprecisão em metros. Ver `localRevelacao`. */
  localRaioMetros: number | null;
  localRevelacao: NivelDeRevelacao;

  publicado: boolean;
};

/**
 * Quanto do lugar o site conta hoje.
 *
 * - `oculto`  — nem mapa. A seção mostra a cidade e "em breve".
 * - `regiao`  — mapa afastado com a ÁREA destacada e nenhum marcador. O ponto
 *               guardado é o centro da área, não o endereço; o raio é o quanto
 *               ele está deliberadamente impreciso.
 * - `exato`   — pin no lugar certo, endereço e link de rotas.
 *
 * O caminho `regiao` → `exato` é um `UPDATE`. O mesmo componente desenha os
 * dois, e no dia da revelação ninguém precisa abrir o editor.
 */
export type NivelDeRevelacao = "oculto" | "regiao" | "exato";

function paraNivelDeRevelacao(valor: unknown): NivelDeRevelacao {
  return valor === "regiao" || valor === "exato" ? valor : "oculto";
}

export type TipoIndicacao = "hospedagem" | "dica";

export type Indicacao = {
  id: string;
  eventoId: string;
  tipo: TipoIndicacao;
  titulo: string;
  descricao: string | null;
  /** Distância ou região: "8 min do local", "Leblon". */
  referencia: string | null;
  url: string | null;
  ordem: number;
};

/* ------------------------------------------------------------------ *
 * Fronteira: linha do banco → objeto do domínio
 * ------------------------------------------------------------------ */

function linhaParaEvento(linha: Record<string, unknown>): Evento {
  return {
    id: paraTextoObrigatorio(linha.id, "eventos.id"),
    slug: paraTextoObrigatorio(linha.slug, "eventos.slug"),
    nomeCasal: paraTextoObrigatorio(linha.nome_casal, "eventos.nome_casal"),
    dataEvento: paraTextoObrigatorio(linha.data_evento, "eventos.data_evento"),
    fuso: paraTexto(linha.fuso) ?? "America/Sao_Paulo",

    horaEvento: paraTexto(linha.hora_evento),
    horaPublicada: paraBooleano(linha.hora_publicada),

    cidade: paraTextoObrigatorio(linha.cidade, "eventos.cidade"),
    uf: paraTextoObrigatorio(linha.uf, "eventos.uf"),

    localNome: paraTexto(linha.local_nome),
    localNomePublicado: paraBooleano(linha.local_nome_publicado),

    localEndereco: paraTexto(linha.local_endereco),
    // `numeric` chega como string. Ver lib/serializar-linha.ts.
    localLatitude: paraNumero(linha.local_latitude),
    localLongitude: paraNumero(linha.local_longitude),
    localRaioMetros: paraNumero(linha.local_raio_metros),
    localRevelacao: paraNivelDeRevelacao(linha.local_revelacao),

    publicado: paraBooleano(linha.publicado),
  };
}

function linhaParaIndicacao(linha: Record<string, unknown>): Indicacao {
  const tipo = paraTextoObrigatorio(linha.tipo, "evento_indicacoes.tipo");
  return {
    id: paraTextoObrigatorio(linha.id, "evento_indicacoes.id"),
    eventoId: paraTextoObrigatorio(linha.evento_id, "evento_indicacoes.evento_id"),
    tipo: tipo === "hospedagem" ? "hospedagem" : "dica",
    titulo: paraTextoObrigatorio(linha.titulo, "evento_indicacoes.titulo"),
    descricao: paraTexto(linha.descricao),
    referencia: paraTexto(linha.referencia),
    url: paraTexto(linha.url),
    ordem: paraInteiro(linha.ordem),
  };
}

/* ------------------------------------------------------------------ *
 * Consultas — sempre com o filtro de inquilino no servidor
 * ------------------------------------------------------------------ */

/**
 * `excluido_em is null` e `publicado = true` estão em TODAS as consultas
 * públicas. Um evento em rascunho não pode aparecer só porque alguém acertou o
 * slug: o casal cadastra o site semanas antes de divulgar.
 */
export async function buscarEventoPorSlug(
  slug: string,
  exec: Executor = sql
): Promise<Evento | null> {
  if (!ehSlug(slug)) return null;
  const linhas = await exec`
    select *
      from eventos
     where slug = ${slug}
       and publicado = true
       and excluido_em is null
     limit 1
  `;
  return linhas.length ? linhaParaEvento(linhas[0]) : null;
}

/**
 * Resolução por domínio: `anaemax.com.br` → o evento daquele casal.
 *
 * É este caminho que faz o multi-tenant existir de verdade. O segundo casal
 * ganha uma linha em `evento_dominios` e passa a ter site, sem tocar em código.
 */
export async function buscarEventoPorDominio(
  host: string | null | undefined,
  exec: Executor = sql
): Promise<Evento | null> {
  const dominio = normalizarDominio(host);
  if (!dominio) return null;
  const linhas = await exec`
    select e.*
      from evento_dominios d
      join eventos e on e.id = d.evento_id
     where d.dominio = ${dominio}
       and d.excluido_em is null
       and e.publicado = true
       and e.excluido_em is null
     limit 1
  `;
  return linhas.length ? linhaParaEvento(linhas[0]) : null;
}

/**
 * Indicações de hospedagem e dicas de UM evento.
 *
 * O `evento_id` vem sempre do evento já resolvido pelo servidor, nunca de
 * parâmetro de URL ou de corpo de requisição. É a regra §8 de `dados.md`, e é o
 * que `test/eventos-escopo.test.ts` verifica.
 */
export async function listarIndicacoes(
  eventoId: string,
  exec: Executor = sql
): Promise<Indicacao[]> {
  const linhas = await exec`
    select *
      from evento_indicacoes
     where evento_id = ${eventoId}
       and publicado = true
       and excluido_em is null
     order by ordem asc, titulo asc
  `;
  return linhas.map(linhaParaIndicacao);
}

/* ------------------------------------------------------------------ *
 * O que o visitante pode ver
 * ------------------------------------------------------------------ */

/**
 * Recorte público do evento.
 *
 * PONTO IMPORTANTE: o corte acontece **no servidor**, e o campo escondido não
 * existe neste objeto. O nome do local que o casal ainda não quer divulgar não
 * pode viajar no HTML — "não renderizar" não esconde nada de quem abre o código
 * fonte da página, e o primeiro convidado curioso descobriria a Mansão antes do
 * anúncio.
 */
export type EventoPublico = {
  id: string;
  slug: string;
  nomeCasal: string;
  dataEvento: string;
  dataPorExtensoFuso: string;
  horaEvento: string | null;
  cidade: string;
  uf: string;
  localNome: string | null;
  localEndereco: string | null;
  /** Só existe quando há coordenada cadastrada E a revelação não é `oculto`. */
  mapa: MapaPublico | null;
};

export type MapaPublico = {
  latitude: number;
  longitude: number;
  /**
   * `regiao` desenha a área e NÃO desenha marcador; `exato` desenha o pin.
   * O componente lê isto — não lê o nome do local, nem tenta adivinhar.
   */
  precisao: "regiao" | "exato";
  /** Raio da área destacada, em metros. Só faz sentido com `precisao: "regiao"`. */
  raioMetros: number;
};

/** Raio usado quando a revelação é por região e ninguém cadastrou um raio. */
export const RAIO_PADRAO_METROS = 4000;

export function recortePublico(evento: Evento): EventoPublico {
  const temCoordenada =
    evento.localLatitude !== null && evento.localLongitude !== null;
  const mapaLiberado = evento.localRevelacao !== "oculto" && temCoordenada;

  return {
    id: evento.id,
    slug: evento.slug,
    nomeCasal: evento.nomeCasal,
    dataEvento: evento.dataEvento,
    dataPorExtensoFuso: evento.fuso,
    horaEvento: evento.horaPublicada ? evento.horaEvento : null,
    cidade: evento.cidade,
    uf: evento.uf,
    localNome: evento.localNomePublicado ? evento.localNome : null,
    // O endereço só sai em `exato`. Endereço junto de mapa de região seria a
    // contradição inteira: a área é vaga justamente para o lugar não ser
    // identificável, e a rua entregaria o que o zoom esconde.
    localEndereco: evento.localRevelacao === "exato" ? evento.localEndereco : null,
    mapa: mapaLiberado
      ? {
          latitude: evento.localLatitude as number,
          longitude: evento.localLongitude as number,
          precisao: evento.localRevelacao === "exato" ? "exato" : "regiao",
          raioMetros: evento.localRaioMetros ?? RAIO_PADRAO_METROS,
        }
      : null,
  };
}
