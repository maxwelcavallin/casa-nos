/**
 * O QUE O SEED PODE ESCREVER — e o que ele nao encosta (v1.0, V-12).
 *
 * Ate a V1.6b o `pnpm db:seed` era o editor do site: o JSON era a fonte da
 * verdade e ele reescrevia o evento inteiro, apagando todas as indicacoes antes
 * de reinserir as do arquivo. Com o painel no ar desde a V1.3, essa frase virou
 * uma bomba — um comando de rotina desfazia, em silencio, tudo que a noiva
 * escreveu.
 *
 * A REGRA AGORA E UMA SO: **o seed semeia o que esta vazio e nao encosta no que
 * esta preenchido.** Ele nunca apaga, nunca sobrescreve, e diz numa linha por
 * item o que fez com cada campo.
 *
 * ESTE MODULO E PURO DE PROPOSITO. Ele decide, sem banco e sem rede, o que seria
 * escrito; `scripts/seed.mjs` so executa a decisao. E assim porque o critério de
 * V-12 que mais importa — *"rodar o seed duas vezes sobre conteudo editado nao
 * muda nada"* — vira teste de mesa (`test/seed-plano.test.ts`), e nao um teste
 * que precisa de um Postgres para provar uma decisao que nao tem nada de SQL.
 *
 * AS TRES CLASSES DE CAMPO, e por que a terceira existe:
 *
 *   `texto`    — obrigatorio no banco (`not null`). Vazio so acontece em evento
 *                que ainda nao existe. Na pratica: semeado na criacao, mantido
 *                sempre depois.
 *
 *   `nulavel`  — nulo SIGNIFICA "ainda nao definido" (o cabecalho da `0001` diz
 *                isso do `hora_evento`). Nulo e o unico estado vazio de verdade
 *                deste produto, e e o unico que o seed preenche.
 *
 *   `decisao`  — `not null` com default, booleano inclusive. **Nao tem estado
 *                vazio**, e e por isso que o seed nunca os escreve depois da
 *                criacao: `false` nao e "faltando", e `'oculto'` nao e "em
 *                branco" — sao exatamente os valores que o painel grava quando o
 *                casal decide nao divulgar o horario, nao divulgar o nome do
 *                local, ou tirar o site do ar. Um seed que os "corrigisse" pelo
 *                JSON **republicaria um site que o casal tirou do ar**, que e a
 *                pior das sobrescritas possiveis: a que reverte uma decisao
 *                tomada com a consequencia na tela.
 */

/**
 * As cinco tabelas que o seed NAO le, NAO escreve e NAO exclui.
 *
 * As quatro primeiras porque so o painel as escreve. A quinta — `evento_fotos` —
 * por um motivo diferente e mais duro: foto e binario que vive num balde, e um
 * seed que subisse objeto para o R2 seria um **segundo caminho de escrita com um
 * segundo montador de chave**, que e exatamente o que `test/r2-prefixos.test.ts`
 * existe para impedir (RV-20). Por isso o JSON tambem nao ganha campo de foto —
 * nem agora, nem depois.
 */
export const TABELAS_INTOCADAS = [
  "evento_secoes",
  "evento_historia",
  "evento_programacao",
  "evento_perguntas",
  "evento_fotos",
]

export const CAMPOS_DO_EVENTO = [
  { json: "nomeCasal", coluna: "nome_casal", classe: "texto" },
  { json: "dataEvento", coluna: "data_evento", classe: "texto" },
  { json: "cidade", coluna: "cidade", classe: "texto" },
  { json: "uf", coluna: "uf", classe: "texto" },

  { json: "horaEvento", coluna: "hora_evento", classe: "nulavel" },
  { json: "localNome", coluna: "local_nome", classe: "nulavel" },
  { json: "localEndereco", coluna: "local_endereco", classe: "nulavel" },
  { json: "localLatitude", coluna: "local_latitude", classe: "nulavel" },
  { json: "localLongitude", coluna: "local_longitude", classe: "nulavel" },
  { json: "localRaioMetros", coluna: "local_raio_metros", classe: "nulavel" },

  { json: "fuso", coluna: "fuso", classe: "decisao" },
  { json: "localRevelacao", coluna: "local_revelacao", classe: "decisao" },
  { json: "horaPublicada", coluna: "hora_publicada", classe: "decisao" },
  { json: "localNomePublicado", coluna: "local_nome_publicado", classe: "decisao" },
  { json: "publicado", coluna: "publicado", classe: "decisao" },
]

const MOTIVO = {
  criado: "campo do evento recem-criado",
  vazio: "estava vazio no banco",
  preenchido: "ja preenchido no banco — o painel manda",
  vazioNosDois: "vazio no banco e no arquivo",
  decisao: "decisao do painel: false e 'oculto' sao valores, nao vazios",
}

/** Vazio e nulo, ausente, ou texto que so tem espaco. `false` e `0` nao sao. */
export function vazio(valor) {
  if (valor === null || valor === undefined) return true
  if (typeof valor === "string") return valor.trim() === ""
  return false
}

/**
 * O valor do JSON, ja no formato da coluna. Ausente vira nulo — o arquivo pode
 * simplesmente nao ter a chave, e isso nao e erro: e "nao sei ainda".
 */
function doArquivo(dados, campo) {
  const bruto = dados[campo.json]
  if (bruto === undefined) return null
  if (campo.classe === "decisao") {
    if (campo.json === "fuso") return bruto ?? "America/Sao_Paulo"
    if (campo.json === "localRevelacao") return bruto
    return Boolean(bruto)
  }
  return bruto ?? null
}

/**
 * O plano do evento.
 *
 * `atual` e a linha de `eventos` como o banco a devolve (colunas em snake_case),
 * ou `null` quando o evento ainda nao existe.
 *
 * Devolve `{ criar, valores, linhas }`. `valores` traz **so** as colunas que
 * seriam escritas — quando ele vem vazio, o seed nao manda UPDATE nenhum, e e
 * isso que faz a segunda rodada ser um no-op de verdade, e nao um UPDATE que
 * grava os mesmos bytes e mexe no `atualizado_em`.
 */
export function planejarEvento(dados, atual) {
  const criar = !atual
  const valores = {}
  const linhas = []

  for (const campo of CAMPOS_DO_EVENTO) {
    const valor = doArquivo(dados, campo)

    if (criar) {
      valores[campo.coluna] = valor
      linhas.push({ coluna: campo.coluna, acao: "semeado", motivo: MOTIVO.criado })
      continue
    }

    if (campo.classe === "decisao") {
      linhas.push({ coluna: campo.coluna, acao: "mantido", motivo: MOTIVO.decisao })
      continue
    }

    if (!vazio(atual[campo.coluna])) {
      linhas.push({ coluna: campo.coluna, acao: "mantido", motivo: MOTIVO.preenchido })
      continue
    }

    if (vazio(valor)) {
      linhas.push({ coluna: campo.coluna, acao: "mantido", motivo: MOTIVO.vazioNosDois })
      continue
    }

    valores[campo.coluna] = valor
    linhas.push({ coluna: campo.coluna, acao: "semeado", motivo: MOTIVO.vazio })
  }

  return { criar, valores, linhas }
}

/** Chave de comparacao de indicacao e de dominio: sem espaco nas pontas, sem caixa. */
function chave(texto) {
  return String(texto ?? "").trim().toLowerCase()
}

/**
 * O plano das indicacoes — **insere o que falta, e nunca exclui**.
 *
 * A chave e `evento_id` + `titulo`, comparada sem caixa e sem espaco nas pontas:
 * "Hotel X" e "hotel x " sao o mesmo hotel, e inserir os dois deixaria o site com
 * a mesma hospedagem duas vezes.
 *
 * O QUE SE PERDE COM ISSO, escrito para nao ser redescoberto: tirar um hotel do
 * JSON **nao tira mais o hotel do site**. Era o comportamento antigo, e ele
 * custava a exclusao em bloco de tudo que o casal tivesse acrescentado pelo
 * painel. Quem tira hotel agora e o painel, que e onde ele foi parar.
 */
export function planejarIndicacoes(dados, titulosExistentes) {
  const existentes = new Set((titulosExistentes ?? []).map(chave))
  const inserir = []
  const linhas = []

  for (const [i, ind] of (dados.indicacoes ?? []).entries()) {
    const k = chave(ind.titulo)
    if (existentes.has(k)) {
      linhas.push({ titulo: ind.titulo, acao: "mantido", motivo: "ja existe neste evento" })
      continue
    }
    existentes.add(k)
    inserir.push({ ...ind, ordem: ind.ordem ?? i + 1 })
    linhas.push({ titulo: ind.titulo, acao: "inserido", motivo: "nao existia" })
  }

  return { inserir, linhas }
}

/** O plano dos dominios — mesma regra: insere o que falta, mantem o que existe. */
export function planejarDominios(dados, dominiosExistentes) {
  const existentes = new Set((dominiosExistentes ?? []).map(chave))
  const inserir = []
  const linhas = []

  for (const d of dados.dominios ?? []) {
    const dominio = chave(d.dominio).replace(/^www\./, "")
    if (existentes.has(dominio)) {
      linhas.push({ dominio, acao: "mantido", motivo: "ja cadastrado" })
      continue
    }
    existentes.add(dominio)
    inserir.push({ dominio, principal: Boolean(d.principal) })
    linhas.push({ dominio, acao: "inserido", motivo: "nao existia" })
  }

  return { inserir, linhas }
}

/** Quantos itens de cada lado, para a ultima linha da saida. */
export function contar(...conjuntos) {
  let semeados = 0
  let mantidos = 0
  for (const linhas of conjuntos) {
    for (const linha of linhas ?? []) {
      if (linha.acao === "mantido") mantidos++
      else semeados++
    }
  }
  return { semeados, mantidos }
}
