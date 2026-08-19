import { ehHoraPura } from "@/lib/datas";
import { sql, type Executor } from "@/lib/db";
import { paraInteiro, paraTexto, paraTextoObrigatorio } from "@/lib/serializar-linha";

/**
 * AS TRÊS SEÇÕES NOVAS DA v1.0: história, programação e perguntas (V-07 a V-09).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **TRÊS TABELAS TIPADAS, E NÃO UM BLOB DE BLOCOS** (migration 0013). É a
 * consequência que a decisão do dono de 18/08/2026 já tinha escrito: com seções
 * fixas, o conteúdo tem forma conhecida, e forma conhecida se consulta, se
 * indexa, se valida com `CHECK` e aparece no `tsc`. Um `jsonb` daria o editor de
 * blocos que a decisão recusou, pela porta dos fundos.
 *
 * **TUDO É TEXTO PURO** (RV-07). A renderização escapa; parágrafo é linha em
 * branco. Não existe HTML do casal em nenhum ponto deste produto, e por isso não
 * existe sanitização — o que não é interpretado não precisa ser limpo.
 *
 * **DOIS NULOS SIGNIFICAM COISAS**, e os dois mudam o site:
 *   `evento_programacao.hora`     "momento sem horário anunciado"
 *   `evento_perguntas.resposta`   "sugerida, ainda não respondida" — e **não
 *                                 renderiza**, que é o que torna a sugestão das
 *                                 cinco perguntas segura (V-16)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Medidos contra a coluna de 640 px do site e o viewport de 360 px. */
export const TETOS_DE_CONTEUDO = {
  historiaTitulo: 60,
  /**
   * 1.200 caracteres são cerca de 20 linhas no celular — o que uma pessoa lê
   * antes de rolar para o mapa. Se o casal precisar de mais, a resposta não é
   * aumentar o teto: é a seção estar errada.
   */
  historiaTexto: 1200,
  momentoTitulo: 40,
  momentoDescricao: 120,
  pergunta: 80,
  resposta: 300,
} as const;

/**
 * Acima de 12 momentos a seção deixa de ser programação e vira agenda; acima de
 * 15 perguntas ela deixa de ser "as cinco que sempre perguntam". E uma lista de
 * 40 linhas num celular é a mesma informação ausente.
 */
export const MAXIMO_DE_MOMENTOS = 12;
export const MAXIMO_DE_PERGUNTAS = 15;

export type CampoInvalido = { campo: string; mensagem: string };

function textoOuNulo(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  return limpo === "" ? null : limpo;
}

function conferirTeto(
  erros: CampoInvalido[],
  campo: string,
  rotulo: string,
  valor: string,
  teto: number
): boolean {
  if (valor.length <= teto) return true;
  // O número no corpo, e não "longo demais": quem escreveu 1.340 caracteres
  // precisa saber quantos cortar.
  erros.push({
    campo,
    mensagem: `${rotulo} cabe em ${teto} caracteres, e você escreveu ${valor.length}.`,
  });
  return false;
}

/* ================================================================== *
 * V-07 — A nossa história
 * ================================================================== */

export type Historia = { titulo: string | null; texto: string };

function linhaParaHistoria(linha: Record<string, unknown>): Historia {
  return {
    titulo: paraTexto(linha.titulo),
    texto: paraTextoObrigatorio(linha.texto, "evento_historia.texto"),
  };
}

export function conferirHistoria(bruto: unknown): {
  dados: { titulo: string | null; texto: string } | null;
  erros: CampoInvalido[];
} {
  const erros: CampoInvalido[] = [];
  if (!bruto || typeof bruto !== "object") {
    return { dados: null, erros: [{ campo: "corpo", mensagem: "Mande o texto." }] };
  }
  const campos = bruto as Record<string, unknown>;

  const titulo = textoOuNulo(campos.titulo);
  if (titulo) conferirTeto(erros, "titulo", "O título", titulo, TETOS_DE_CONTEUDO.historiaTitulo);

  /**
   * Texto vazio é **apagar a história**, não erro. O casal que escreveu e se
   * arrependeu precisa poder voltar ao estado anterior — e o estado anterior é
   * "a seção não renderiza" (RV-02), não "a seção mostra uma caixa vazia".
   */
  const texto = typeof campos.texto === "string" ? campos.texto.trim() : "";
  conferirTeto(erros, "texto", "O texto", texto, TETOS_DE_CONTEUDO.historiaTexto);

  if (erros.length > 0) return { dados: null, erros };
  return { dados: { titulo, texto }, erros: [] };
}

export async function buscarHistoria(
  eventoId: string,
  exec: Executor = sql
): Promise<Historia | null> {
  const linhas = await exec`
    select titulo, texto
      from evento_historia
     where evento_id = ${eventoId}
       and excluido_em is null
     limit 1
  `;
  return linhas.length ? linhaParaHistoria(linhas[0]) : null;
}

/**
 * Grava a história — uma linha por evento, com `on conflict`.
 *
 * Texto vazio **apaga** (exclusão lógica) em vez de gravar uma linha em branco:
 * uma linha com `texto = ''` faria a seção "existir e não mostrar nada", que é o
 * estado que ninguém sabe consertar.
 */
export async function salvarHistoria(
  eventoId: string,
  dados: { titulo: string | null; texto: string },
  exec: Executor = sql
): Promise<Historia | null> {
  if (dados.texto === "") {
    await exec`
      update evento_historia
         set excluido_em = now(), atualizado_em = now()
       where evento_id = ${eventoId}
         and excluido_em is null
    `;
    return null;
  }

  const linhas = await exec`
    insert into evento_historia (evento_id, titulo, texto)
    values (${eventoId}, ${dados.titulo}, ${dados.texto})
        on conflict (evento_id) where excluido_em is null
        do update set titulo = excluded.titulo,
                      texto = excluded.texto,
                      atualizado_em = now()
    returning titulo, texto
  `;
  return linhas.length ? linhaParaHistoria(linhas[0]) : null;
}

/* ================================================================== *
 * V-08 — A programação do dia
 * ================================================================== */

export type Momento = {
  id: string;
  /** `"16:00"`. Nulo SIGNIFICA "momento sem horário anunciado". */
  hora: string | null;
  titulo: string;
  descricao: string | null;
  ordem: number;
};

function linhaParaMomento(linha: Record<string, unknown>): Momento {
  const hora = paraTexto(linha.hora);
  return {
    id: paraTextoObrigatorio(linha.id, "evento_programacao.id"),
    // `time` chega como `"16:00:00"`; o site e o `<input type="time">` falam
    // `"16:00"`. O corte é aqui, na fronteira, e não em cada tela.
    hora: hora ? hora.slice(0, 5) : null,
    titulo: paraTextoObrigatorio(linha.titulo, "evento_programacao.titulo"),
    descricao: paraTexto(linha.descricao),
    ordem: paraInteiro(linha.ordem),
  };
}

export type DadosDoMomento = {
  hora: string | null;
  titulo: string;
  descricao: string | null;
  ordem: number;
};

export function conferirMomento(
  bruto: unknown,
  opcoes: { parcial: boolean }
): { dados: Partial<DadosDoMomento>; erros: CampoInvalido[] } {
  const erros: CampoInvalido[] = [];
  const dados: Partial<DadosDoMomento> = {};

  if (!bruto || typeof bruto !== "object") {
    return { dados, erros: [{ campo: "corpo", mensagem: "Mande os campos do momento." }] };
  }
  const campos = bruto as Record<string, unknown>;

  if (campos.titulo !== undefined || !opcoes.parcial) {
    const titulo = textoOuNulo(campos.titulo);
    if (!titulo) {
      erros.push({ campo: "titulo", mensagem: "Escreva o que acontece nesse momento." });
    } else if (conferirTeto(erros, "titulo", "O título", titulo, TETOS_DE_CONTEUDO.momentoTitulo)) {
      dados.titulo = titulo;
    }
  }

  if (campos.hora !== undefined) {
    const hora = textoOuNulo(campos.hora);
    if (hora === null) {
      // Nulo é um valor: "a festa vai até o fim" não tem horário, e o casal
      // precisa poder dizer isso.
      dados.hora = null;
    } else if (!ehHoraPura(hora)) {
      erros.push({ campo: "hora", mensagem: "O horário vai no formato 16:00." });
    } else {
      dados.hora = hora;
    }
  }

  if (campos.descricao !== undefined) {
    const descricao = textoOuNulo(campos.descricao);
    if (
      descricao === null ||
      conferirTeto(
        erros,
        "descricao",
        "A descrição",
        descricao,
        TETOS_DE_CONTEUDO.momentoDescricao
      )
    ) {
      dados.descricao = descricao;
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

/**
 * A programação, na ordem do casal.
 *
 * **`order by ordem, hora, titulo` — e nunca `id`** (RV-04). O empate é real:
 * momentos criados em sequência nascem com a ordem que a rota atribuiu, e um
 * evento cujo casal nunca reordenou pode ter empates. Desempatar por uuid faria
 * a programação mudar de ordem a cada inserção, sem ninguém ter mexido.
 *
 * `nulls last` no horário: o momento sem hora anunciada vai para o fim do grupo,
 * porque ele é quase sempre "a festa vai até o fim".
 */
export async function listarProgramacao(
  eventoId: string,
  exec: Executor = sql
): Promise<Momento[]> {
  const linhas = await exec`
    select id, hora, titulo, descricao, ordem
      from evento_programacao
     where evento_id = ${eventoId}
       and excluido_em is null
     order by ordem asc, hora asc nulls last, titulo asc
  `;
  return linhas.map(linhaParaMomento);
}

export async function contarMomentos(
  eventoId: string,
  exec: Executor = sql
): Promise<number> {
  const linhas = await exec`
    select count(*)::int as quantas
      from evento_programacao
     where evento_id = ${eventoId}
       and excluido_em is null
  `;
  return linhas.length ? paraInteiro(linhas[0].quantas) : 0;
}

export async function criarMomento(
  eventoId: string,
  dados: DadosDoMomento,
  exec: Executor = sql
): Promise<Momento> {
  const linhas = await exec`
    insert into evento_programacao (evento_id, hora, titulo, descricao, ordem)
    values (${eventoId}, ${dados.hora}::time, ${dados.titulo}, ${dados.descricao}, ${dados.ordem})
    returning id, hora, titulo, descricao, ordem
  `;
  return linhaParaMomento(linhas[0]);
}

export async function atualizarMomento(
  eventoId: string,
  momentoId: string,
  dados: Partial<DadosDoMomento>,
  exec: Executor = sql
): Promise<Momento | null> {
  const linhas = await exec`
    update evento_programacao set
      hora          = case when ${dados.hora !== undefined}
                           then ${dados.hora ?? null}::time else hora end,
      titulo        = coalesce(${dados.titulo ?? null}, titulo),
      descricao     = case when ${dados.descricao !== undefined}
                           then ${dados.descricao ?? null}::text else descricao end,
      ordem         = coalesce(${dados.ordem ?? null}::integer, ordem),
      atualizado_em = now()
     where id = ${momentoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning id, hora, titulo, descricao, ordem
  `;
  return linhas.length ? linhaParaMomento(linhas[0]) : null;
}

export async function excluirMomento(
  eventoId: string,
  momentoId: string,
  exec: Executor = sql
): Promise<boolean> {
  const linhas = await exec`
    update evento_programacao
       set excluido_em = now(), atualizado_em = now()
     where id = ${momentoId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning id
  `;
  return linhas.length > 0;
}

/* ================================================================== *
 * V-09 — As perguntas
 * ================================================================== */

export type Pergunta = {
  id: string;
  pergunta: string;
  /** Nulo SIGNIFICA "sugerida, ainda não respondida" — e não renderiza no site. */
  resposta: string | null;
  ordem: number;
};

function linhaParaPergunta(linha: Record<string, unknown>): Pergunta {
  return {
    id: paraTextoObrigatorio(linha.id, "evento_perguntas.id"),
    pergunta: paraTextoObrigatorio(linha.pergunta, "evento_perguntas.pergunta"),
    resposta: paraTexto(linha.resposta),
    ordem: paraInteiro(linha.ordem),
  };
}

export type DadosDaPergunta = {
  pergunta: string;
  resposta: string | null;
  ordem: number;
};

export function conferirPergunta(
  bruto: unknown,
  opcoes: { parcial: boolean }
): { dados: Partial<DadosDaPergunta>; erros: CampoInvalido[] } {
  const erros: CampoInvalido[] = [];
  const dados: Partial<DadosDaPergunta> = {};

  if (!bruto || typeof bruto !== "object") {
    return { dados, erros: [{ campo: "corpo", mensagem: "Mande a pergunta." }] };
  }
  const campos = bruto as Record<string, unknown>;

  if (campos.pergunta !== undefined || !opcoes.parcial) {
    const pergunta = textoOuNulo(campos.pergunta);
    if (!pergunta) {
      erros.push({ campo: "pergunta", mensagem: "Escreva a pergunta." });
    } else if (
      conferirTeto(erros, "pergunta", "A pergunta", pergunta, TETOS_DE_CONTEUDO.pergunta)
    ) {
      dados.pergunta = pergunta;
    }
  }

  if (campos.resposta !== undefined) {
    const resposta = textoOuNulo(campos.resposta);
    if (
      resposta === null ||
      conferirTeto(erros, "resposta", "A resposta", resposta, TETOS_DE_CONTEUDO.resposta)
    ) {
      // Resposta vazia é um estado legítimo, e é o que faz a pergunta ficar
      // invisível no site. Apagar a resposta é diferente de apagar a pergunta.
      dados.resposta = resposta;
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

export async function listarPerguntas(
  eventoId: string,
  exec: Executor = sql
): Promise<Pergunta[]> {
  const linhas = await exec`
    select id, pergunta, resposta, ordem
      from evento_perguntas
     where evento_id = ${eventoId}
       and excluido_em is null
     order by ordem asc, pergunta asc
  `;
  return linhas.map(linhaParaPergunta);
}

/**
 * As que o SITE mostra: só as respondidas (RV-02).
 *
 * A função existe separada de `listarPerguntas` de propósito, e é ela que torna
 * a sugestão das cinco perguntas segura: elas nascem sem resposta e ficam
 * invisíveis até o casal responder. Filtrar no componente deixaria o texto da
 * pergunta não respondida viajando no HTML.
 */
export function perguntasRespondidas(perguntas: Pergunta[]): Pergunta[] {
  return perguntas.filter(p => p.resposta !== null && p.resposta !== "");
}

export async function contarPerguntas(
  eventoId: string,
  exec: Executor = sql
): Promise<number> {
  const linhas = await exec`
    select count(*)::int as quantas
      from evento_perguntas
     where evento_id = ${eventoId}
       and excluido_em is null
  `;
  return linhas.length ? paraInteiro(linhas[0].quantas) : 0;
}

export async function criarPergunta(
  eventoId: string,
  dados: DadosDaPergunta,
  exec: Executor = sql
): Promise<Pergunta> {
  const linhas = await exec`
    insert into evento_perguntas (evento_id, pergunta, resposta, ordem)
    values (${eventoId}, ${dados.pergunta}, ${dados.resposta}, ${dados.ordem})
    returning id, pergunta, resposta, ordem
  `;
  return linhaParaPergunta(linhas[0]);
}

export async function atualizarPergunta(
  eventoId: string,
  perguntaId: string,
  dados: Partial<DadosDaPergunta>,
  exec: Executor = sql
): Promise<Pergunta | null> {
  const linhas = await exec`
    update evento_perguntas set
      pergunta      = coalesce(${dados.pergunta ?? null}, pergunta),
      resposta      = case when ${dados.resposta !== undefined}
                           then ${dados.resposta ?? null}::text else resposta end,
      ordem         = coalesce(${dados.ordem ?? null}::integer, ordem),
      atualizado_em = now()
     where id = ${perguntaId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning id, pergunta, resposta, ordem
  `;
  return linhas.length ? linhaParaPergunta(linhas[0]) : null;
}

export async function excluirPergunta(
  eventoId: string,
  perguntaId: string,
  exec: Executor = sql
): Promise<boolean> {
  const linhas = await exec`
    update evento_perguntas
       set excluido_em = now(), atualizado_em = now()
     where id = ${perguntaId}
       and evento_id = ${eventoId}
       and excluido_em is null
    returning id
  `;
  return linhas.length > 0;
}
