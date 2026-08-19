import { sql, type Executor } from "@/lib/db";
import type { Indicacao, TipoIndicacao } from "@/lib/eventos";
import { paraInteiro, paraTexto, paraTextoObrigatorio } from "@/lib/serializar-linha";

/**
 * ONDE FICAR E DICAS — a escrita (v1.0, V-06).
 *
 * A tabela `evento_indicacoes` existe desde a `0001` e a seção já renderiza em
 * produção: o que faltava era o editor. Ela nasceu com `ordem`, `publicado` e
 * exclusão lógica justamente para que o dia do editor não exigisse migrar dado
 * que já está no ar — e não exigiu.
 *
 * **TODA CONSULTA FILTRA `evento_id` NO SERVIDOR** (RV-14), a partir do evento já
 * resolvido por `autorizar()`. Nunca de id vindo do corpo ou da URL.
 */

/**
 * Os tetos. Eles são conferidos **no servidor** (RV-09); o `maxLength` da tela é
 * conveniência, não segurança — um `POST` montado à mão passa por cima dele.
 *
 * Cada número foi medido contra a coluna de 640 px do site e o viewport de
 * 360 px, na tipografia do sistema.
 */
export const TETOS = {
  titulo: 60,
  referencia: 40,
  descricao: 200,
  url: 500,
} as const;

/**
 * **20 indicações por evento.**
 *
 * Acima disso a seção deixa de ser "onde ficar" e vira um guia de hotéis — e uma
 * lista de 40 cartões num celular é a mesma informação ausente. Estourar
 * responde **409 com o teto no corpo**, nunca um 400 genérico que a tela
 * traduziria como "erro".
 */
export const MAXIMO_DE_INDICACOES = 20;

export type CampoInvalido = { campo: string; mensagem: string };

export type DadosDaIndicacao = {
  tipo: TipoIndicacao;
  titulo: string;
  referencia: string | null;
  descricao: string | null;
  url: string | null;
  ordem: number;
};

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

/**
 * `http` e `https`, e mais nada (RV-08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ISTO IMPEDE: `javascript:` num link que 150 convidados vão tocar. O
 * campo é preenchido por quem cola o endereço do hotel de outra aba, e um link
 * colado de um lugar errado vira XSS armazenado no site do casamento.
 *
 * `mailto:`, `tel:` e caminho relativo também caem aqui, e a recusa é
 * deliberada: o rótulo do link no site é "Abrir o site de <titulo>", e ele já
 * abre em aba nova com `rel="noopener noreferrer"`. Um `tel:` ali não faria o
 * que a frase promete.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function ehUrlDeLink(valor: string): boolean {
  try {
    const url = new URL(valor);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function textoOuNulo(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  return limpo === "" ? null : limpo;
}

/**
 * Confere o que chegou do painel. **Pura**, e é o que a rota usa.
 *
 * `parcial` distingue o `POST` do `PATCH`: na criação o título é obrigatório; na
 * edição, campo ausente **não mexe** no que está gravado. Sem essa distinção,
 * salvar só o link apagaria a descrição — e o casal não saberia por quê.
 */
export function conferirIndicacao(
  bruto: unknown,
  opcoes: { parcial: boolean }
): { dados: Partial<DadosDaIndicacao>; erros: CampoInvalido[] } {
  const erros: CampoInvalido[] = [];
  const dados: Partial<DadosDaIndicacao> = {};

  if (!bruto || typeof bruto !== "object") {
    return { dados, erros: [{ campo: "corpo", mensagem: "Mande os campos da indicação." }] };
  }
  const campos = bruto as Record<string, unknown>;

  if (campos.tipo !== undefined || !opcoes.parcial) {
    const tipo = campos.tipo;
    if (tipo === "hospedagem" || tipo === "dica") {
      dados.tipo = tipo;
    } else {
      erros.push({ campo: "tipo", mensagem: "Escolha entre hospedagem e dica." });
    }
  }

  if (campos.titulo !== undefined || !opcoes.parcial) {
    const titulo = textoOuNulo(campos.titulo);
    if (!titulo) {
      erros.push({ campo: "titulo", mensagem: "Escreva o nome do hotel ou da dica." });
    } else if (titulo.length > TETOS.titulo) {
      erros.push({
        campo: "titulo",
        // O número no corpo, e não "longo demais": quem escreveu 74 caracteres
        // precisa saber quantos cortar.
        mensagem: `O nome cabe em ${TETOS.titulo} caracteres, e você escreveu ${titulo.length}.`,
      });
    } else {
      dados.titulo = titulo;
    }
  }

  for (const [campo, teto, rotulo] of [
    ["referencia", TETOS.referencia, "A referência"],
    ["descricao", TETOS.descricao, "A descrição"],
  ] as const) {
    if (campos[campo] === undefined) continue;
    const valor = textoOuNulo(campos[campo]);
    if (valor && valor.length > teto) {
      erros.push({
        campo,
        mensagem: `${rotulo} cabe em ${teto} caracteres, e você escreveu ${valor.length}.`,
      });
    } else {
      dados[campo] = valor;
    }
  }

  if (campos.url !== undefined) {
    const url = textoOuNulo(campos.url);
    if (url === null) {
      dados.url = null;
    } else if (url.length > TETOS.url) {
      mensagemDeUrlLonga(erros, url.length);
    } else if (!ehUrlDeLink(url)) {
      erros.push({
        campo: "url",
        mensagem: "O link precisa começar com http:// ou https://.",
      });
    } else {
      dados.url = url;
    }
  }

  if (campos.ordem !== undefined) {
    const ordem = Number(campos.ordem);
    if (!Number.isSafeInteger(ordem)) {
      erros.push({ campo: "ordem", mensagem: "A ordem precisa ser um número inteiro." });
    } else {
      dados.ordem = ordem;
    }
  }

  return { dados, erros };
}

function mensagemDeUrlLonga(erros: CampoInvalido[], tamanho: number): void {
  erros.push({
    campo: "url",
    mensagem: `O link cabe em ${TETOS.url} caracteres, e você colou ${tamanho}.`,
  });
}

/* ------------------------------------------------------------------ *
 * Leitura do painel — inclui o que não está publicado
 * ------------------------------------------------------------------ */

/**
 * As indicações que o CASAL vê no painel.
 *
 * Diferente de `listarIndicacoes` (`lib/eventos.ts`), que serve o site e exige
 * `publicado = true`. A diferença é a mesma de `buscarEventoPorId` e
 * `buscarEventoPorSlug`: o painel precisa ver o que ainda não foi ao ar.
 */
export async function listarIndicacoesDoPainel(
  eventoId: string,
  exec: Executor = sql
): Promise<Indicacao[]> {
  const linhas = await exec`
    select *
      from evento_indicacoes
     where evento_id = ${eventoId}
       and excluido_em is null
     order by ordem asc, titulo asc
  `;
  return linhas.map(linhaParaIndicacao);
}

export async function contarIndicacoes(
  eventoId: string,
  exec: Executor = sql
): Promise<number> {
  const linhas = await exec`
    select count(*)::int as quantas
      from evento_indicacoes
     where evento_id = ${eventoId}
       and excluido_em is null
  `;
  return linhas.length ? paraInteiro(linhas[0].quantas) : 0;
}

/* ------------------------------------------------------------------ *
 * Escrita
 * ------------------------------------------------------------------ */

export async function criarIndicacao(
  eventoId: string,
  dados: DadosDaIndicacao,
  exec: Executor = sql
): Promise<Indicacao> {
  const linhas = await exec`
    insert into evento_indicacoes
      (evento_id, tipo, titulo, referencia, descricao, url, ordem, publicado)
    values
      (${eventoId}, ${dados.tipo}, ${dados.titulo}, ${dados.referencia},
       ${dados.descricao}, ${dados.url}, ${dados.ordem}, true)
    returning *
  `;
  return linhaParaIndicacao(linhas[0]);
}

/**
 * `coalesce(${valor}, coluna)` em cada campo: o que não foi mandado fica como
 * está. Escrever `null` no que o formulário não enviou apagaria a descrição toda
 * vez que o casal salvasse só o link.
 *
 * As três colunas que aceitam nulo de verdade (`referencia`, `descricao`, `url`)
 * usam `case when`, porque para elas **o nulo é um valor**: limpar o link é uma
 * edição legítima, e com `coalesce` seria impossível.
 */
export async function atualizarIndicacao(
  eventoId: string,
  indicacaoId: string,
  dados: Partial<DadosDaIndicacao>,
  exec: Executor = sql
): Promise<Indicacao | null> {
  const linhas = await exec`
    update evento_indicacoes set
      tipo          = coalesce(${dados.tipo ?? null}, tipo),
      titulo        = coalesce(${dados.titulo ?? null}, titulo),
      referencia    = case when ${dados.referencia !== undefined}
                           then ${dados.referencia ?? null}::text else referencia end,
      descricao     = case when ${dados.descricao !== undefined}
                           then ${dados.descricao ?? null}::text else descricao end,
      url           = case when ${dados.url !== undefined}
                           then ${dados.url ?? null}::text else url end,
      ordem         = coalesce(${dados.ordem ?? null}::integer, ordem),
      atualizado_em = now()
     where id = ${indicacaoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning *
  `;
  // Indicação de OUTRO evento devolve nada e vira 404, nunca 403: 403
  // confirmaria que ela existe.
  return linhas.length ? linhaParaIndicacao(linhas[0]) : null;
}

/**
 * Exclusão **lógica** (`dados.md` §7): é conteúdo que o casal criou e pode
 * querer de volta. Uma linha apagada de verdade some sem que ninguém consiga
 * responder "o que era o hotel que eu tirei?".
 */
export async function excluirIndicacao(
  eventoId: string,
  indicacaoId: string,
  exec: Executor = sql
): Promise<boolean> {
  const linhas = await exec`
    update evento_indicacoes
       set excluido_em = now(), atualizado_em = now()
     where id = ${indicacaoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning id
  `;
  return linhas.length > 0;
}
