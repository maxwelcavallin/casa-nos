/**
 * Escreve no banco o conteudo de `db/seed/*.json`.
 *
 * Uso:  pnpm db:seed                                (todos os arquivos da pasta)
 *       pnpm db:seed db/seed/casamento-ana-e-max.json  (um so)
 *
 * ELE NAO E MAIS O EDITOR DO SITE. Quem edita o site e o painel, em
 * `/painel/<id>/site`, desde a V1.3. Este comando existe para o evento **nascer
 * com conteudo inicial** — e, desde a V-12, para poder ser rodado por engano num
 * evento ja editado sem desfazer nada.
 *
 * A REGRA, e ela vale para tudo aqui dentro: **semeia o que esta vazio, mantem o
 * que esta preenchido, nunca apaga.** Quem decide campo a campo e
 * `scripts/seed-plano.mjs`, que e puro e tem teste proprio; este arquivo so
 * executa a decisao e imprime o que fez.
 *
 * IDEMPOTENTE: a chave e o `slug`. Rodar dez vezes deixa o banco no mesmo estado
 * que rodar uma — e a partir da segunda rodada ele nao manda UPDATE nenhum, nem
 * para gravar os mesmos bytes.
 */
import fs from "node:fs"
import path from "node:path"
import { neon } from "@neondatabase/serverless"

import {
  TABELAS_INTOCADAS,
  contar,
  planejarDominios,
  planejarEvento,
  planejarIndicacoes,
} from "./seed-plano.mjs"

const RAIZ = process.cwd()
const PASTA = path.join(RAIZ, "db", "seed")

carregarEnvLocal()

const url = process.env.DATABASE_URL
if (!url) {
  console.error(
    "DATABASE_URL nao configurada. Veja .env.example e o README (secao 'Banco')."
  )
  process.exit(1)
}

const sql = neon(url)

function carregarEnvLocal() {
  for (const nome of [".env.local", ".env"]) {
    const arquivo = path.join(RAIZ, nome)
    if (!fs.existsSync(arquivo)) continue
    for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const valor = m[2].replace(/^["']|["']$/g, "")
      if (valor && !process.env[m[1]]) process.env[m[1]] = valor
    }
  }
}

const DIA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^\d{2}:\d{2}(:\d{2})?$/
const REVELACAO = new Set(["oculto", "regiao", "exato"])

/**
 * Confere o JSON ANTES de tocar no banco.
 *
 * Sem isto, `dataEvento: "22/08/2027"` viraria erro do Postgres no meio da
 * escrita, com metade do evento gravada. E `localRevelacao: "exata"` (com A)
 * passaria pelo CHECK? Nao — mas o erro chegaria como violacao de constraint,
 * que nao diz a quem edita o arquivo o que fazer.
 */
function conferir(dados, arquivo) {
  const erros = []
  const exigir = (condicao, mensagem) => { if (!condicao) erros.push(mensagem) }

  exigir(typeof dados.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(dados.slug),
    "slug: minusculas, numeros e hifen (ex.: ana-e-max)")
  exigir(typeof dados.nomeCasal === "string" && dados.nomeCasal.trim() !== "",
    "nomeCasal: obrigatorio")
  exigir(DIA.test(String(dados.dataEvento)),
    "dataEvento: formato AAAA-MM-DD (ex.: 2027-08-22)")
  exigir(dados.horaEvento == null || HORA.test(String(dados.horaEvento)),
    "horaEvento: formato HH:MM, ou null enquanto nao houver horario")
  exigir(typeof dados.cidade === "string" && dados.cidade.trim() !== "", "cidade: obrigatoria")
  exigir(typeof dados.uf === "string" && dados.uf.length === 2, "uf: duas letras (ex.: RJ)")
  exigir(REVELACAO.has(dados.localRevelacao),
    "localRevelacao: 'oculto', 'regiao' ou 'exato'")

  if (dados.localRevelacao !== "oculto") {
    exigir(typeof dados.localLatitude === "number" && typeof dados.localLongitude === "number",
      "localLatitude/localLongitude: obrigatorias quando localRevelacao nao e 'oculto' — " +
      "sem coordenada o mapa nao aparece e a secao cai em 'em breve'")
  }
  if (dados.horaPublicada) {
    exigir(dados.horaEvento != null,
      "horaPublicada: true sem horaEvento anunciaria um horario que nao existe")
  }
  if (dados.localNomePublicado) {
    exigir(typeof dados.localNome === "string" && dados.localNome.trim() !== "",
      "localNomePublicado: true sem localNome preenchido")
  }

  for (const [i, ind] of (dados.indicacoes ?? []).entries()) {
    const onde = `indicacoes[${i}]`
    exigir(ind.tipo === "hospedagem" || ind.tipo === "dica",
      `${onde}.tipo: 'hospedagem' ou 'dica'`)
    exigir(typeof ind.titulo === "string" && ind.titulo.trim() !== "",
      `${onde}.titulo: obrigatorio`)
    exigir(ind.url == null || /^https?:\/\//.test(String(ind.url)),
      `${onde}.url: precisa comecar com http:// ou https://`)
  }

  if (erros.length) {
    console.error(`\n${arquivo} nao passou na conferencia:\n` + erros.map(e => `  - ${e}`).join("\n") + "\n")
    process.exit(1)
  }
}

/**
 * Uma linha por campo, alinhada — a saida e a unica coisa que quem roda o
 * comando ve, e "OK" nao diz se o horario entrou ou foi mantido.
 */
function imprimir(rotulo, acao, motivo) {
  console.log(`    ${String(rotulo).padEnd(22)} ${String(acao).padEnd(9)} (${motivo})`)
}

async function semear(arquivo) {
  const dados = JSON.parse(fs.readFileSync(arquivo, "utf8"))
  conferir(dados, path.relative(RAIZ, arquivo))

  /**
   * Le antes de escrever, e nao `on conflict do update`.
   *
   * O upsert de antes era o proprio problema: ele decidia sobrescrever dentro do
   * banco, onde nao da para perguntar "esse campo estava vazio?". Lendo primeiro,
   * a decisao acontece em `planejarEvento`, que e puro e testado. A corrida entre
   * o `select` e o `insert` existe no papel e nao existe na pratica: quem roda
   * isto e uma pessoa num terminal, uma vez.
   */
  const [atual] = await sql`
    select id, slug, nome_casal, data_evento, hora_evento, cidade, uf,
           local_nome, local_endereco,
           local_latitude, local_longitude, local_raio_metros
      from eventos
     where slug = ${dados.slug}
       and excluido_em is null
     limit 1
  `

  const plano = planejarEvento(dados, atual ?? null)
  let evento = atual

  if (plano.criar) {
    const v = plano.valores
    ;[evento] = await sql`
      insert into eventos (
        slug, nome_casal, data_evento, hora_evento, hora_publicada, fuso,
        cidade, uf,
        local_nome, local_nome_publicado,
        local_endereco, local_latitude, local_longitude, local_raio_metros,
        local_revelacao, publicado
      ) values (
        ${dados.slug}, ${v.nome_casal}, ${v.data_evento},
        ${v.hora_evento}, ${v.hora_publicada}, ${v.fuso},
        ${v.cidade}, ${v.uf},
        ${v.local_nome}, ${v.local_nome_publicado},
        ${v.local_endereco},
        ${v.local_latitude}, ${v.local_longitude}, ${v.local_raio_metros},
        ${v.local_revelacao}, ${v.publicado}
      )
      returning id, slug
    `
    console.log(`  ${evento.slug}: evento criado`)
  } else {
    console.log(`  ${evento.slug}: evento ja existe — so o que estiver vazio e semeado`)
  }

  /**
   * O UPDATE e estatico e usa `coalesce(parametro, coluna)`: parametro nulo
   * significa "nao escreva esta coluna". As cinco colunas de decisao — `fuso`,
   * `local_revelacao` e os tres booleanos — **nao estao aqui**, e a ausencia
   * delas e a regra: depois de criado, o seed nao republica um site que o casal
   * tirou do ar nem revela um local que ele escondeu.
   *
   * Quando `plano.valores` vem vazio, nem o UPDATE sai — a segunda rodada nao
   * mexe nem no `atualizado_em`.
   */
  if (!plano.criar && Object.keys(plano.valores).length > 0) {
    const v = plano.valores
    await sql`
      update eventos set
        nome_casal        = coalesce(${v.nome_casal ?? null}::text,    nome_casal),
        data_evento       = coalesce(${v.data_evento ?? null}::date,   data_evento),
        cidade            = coalesce(${v.cidade ?? null}::text,        cidade),
        uf                = coalesce(${v.uf ?? null}::text,            uf),
        hora_evento       = coalesce(${v.hora_evento ?? null}::time,   hora_evento),
        local_nome        = coalesce(${v.local_nome ?? null}::text,    local_nome),
        local_endereco    = coalesce(${v.local_endereco ?? null}::text, local_endereco),
        local_latitude    = coalesce(${v.local_latitude ?? null}::numeric, local_latitude),
        local_longitude   = coalesce(${v.local_longitude ?? null}::numeric, local_longitude),
        local_raio_metros = coalesce(${v.local_raio_metros ?? null}::integer, local_raio_metros),
        atualizado_em     = now()
      where id = ${evento.id}
    `
  }

  for (const linha of plano.linhas) imprimir(linha.coluna, linha.acao, linha.motivo)

  const dominiosNoBanco = await sql`
    select dominio from evento_dominios where excluido_em is null
  `
  const planoDominios = planejarDominios(dados, dominiosNoBanco.map(d => d.dominio))

  for (const d of planoDominios.inserir) {
    await sql`
      insert into evento_dominios (evento_id, dominio, principal)
      values (${evento.id}, ${d.dominio}, ${d.principal})
    `
  }
  for (const linha of planoDominios.linhas) imprimir(linha.dominio, linha.acao, linha.motivo)

  /**
   * As indicacoes deixaram de ser reescritas em bloco.
   *
   * O `update ... set excluido_em = now()` que abria este trecho apagava, a cada
   * rodada, **tudo** que o casal tivesse acrescentado pelo painel — e essa era a
   * linha mais cara do script. A chave passa a ser `evento_id` + `titulo`: o que
   * o arquivo tem e o banco nao, entra; o resto fica de pe.
   */
  const titulosNoBanco = await sql`
    select titulo from evento_indicacoes
     where evento_id = ${evento.id}
       and excluido_em is null
  `
  const planoIndicacoes = planejarIndicacoes(dados, titulosNoBanco.map(i => i.titulo))

  for (const ind of planoIndicacoes.inserir) {
    await sql`
      insert into evento_indicacoes
        (evento_id, tipo, titulo, descricao, referencia, url, ordem, publicado)
      values (
        ${evento.id}, ${ind.tipo}, ${ind.titulo},
        ${ind.descricao ?? null}, ${ind.referencia ?? null}, ${ind.url ?? null},
        ${ind.ordem}, ${ind.publicado === undefined ? true : Boolean(ind.publicado)}
      )
    `
  }
  for (const linha of planoIndicacoes.linhas) imprimir(linha.titulo, linha.acao, linha.motivo)

  const total = contar(plano.linhas, planoDominios.linhas, planoIndicacoes.linhas)
  console.log(
    `    ${total.semeados} semeado(s), ${total.mantidos} mantido(s). ` +
      `Nao toca em: ${TABELAS_INTOCADAS.join(", ")}.`
  )
}

async function principal() {
  const alvos = process.argv.slice(2).filter(a => !a.startsWith("-"))
  const arquivos = alvos.length
    ? alvos.map(a => path.resolve(RAIZ, a))
    : fs.readdirSync(PASTA).filter(n => n.endsWith(".json")).map(n => path.join(PASTA, n))

  if (arquivos.length === 0) {
    console.error(`Nenhum arquivo de seed em ${PASTA}.`)
    process.exit(1)
  }

  for (const arquivo of arquivos) await semear(arquivo)
  console.log("\nOK.")
}

principal().catch(erro => {
  console.error(erro)
  process.exit(1)
})
