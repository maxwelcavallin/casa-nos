/**
 * Escreve no banco o conteudo de `db/seed/*.json`.
 *
 * Uso:  pnpm db:seed                                (todos os arquivos da pasta)
 *       pnpm db:seed db/seed/casamento-ana-e-max.json  (um so)
 *
 * ESTE E O EDITOR DE CONTEUDO DA FATIA 0. Nao existe painel administrativo, e
 * isso e decisao registrada em docs/fatia-0.md, nao esquecimento. O dono edita o
 * JSON e roda este comando; a pagina muda no proximo carregamento.
 *
 * IDEMPOTENTE: a chave e o `slug`. Rodar dez vezes deixa o banco no mesmo
 * estado que rodar uma. Isso importa porque ele VAI rodar mais de uma vez, em
 * mais de um ambiente, e um seed que duplica evento cria dois inquilinos para o
 * mesmo casamento.
 */
import fs from "node:fs"
import path from "node:path"
import { neon } from "@neondatabase/serverless"

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
 * ATENCAO — ESTE SCRIPT SOBRESCREVE O QUE O CASAL EDITOU NO PAINEL.
 *
 * Desde a V1.3 o casal edita o site em `/painel/<id>/site`. Este seed continua
 * sendo o que sempre foi: o JSON e a fonte da verdade, e ele reescreve o evento
 * inteiro e APAGA todas as indicacoes antes de reinserir as do arquivo. Rodado
 * por engano num evento ja editado, ele desfaz tudo que a noiva escreveu — sem
 * erro nenhum e sem aviso.
 *
 * Ele NAO toca em `evento_secoes`, `evento_historia`, `evento_programacao` nem
 * `evento_perguntas`: essas quatro estao a salvo.
 *
 * Consertar isso e a historia V-12 do prd-v1.md (fatia V1.6), e ela ainda nao
 * foi feita. Ate la: use o seed para CRIAR evento novo e para o de teste.
 */
async function semear(arquivo) {
  const dados = JSON.parse(fs.readFileSync(arquivo, "utf8"))
  conferir(dados, path.relative(RAIZ, arquivo))

  const [evento] = await sql`
    insert into eventos (
      slug, nome_casal, data_evento, hora_evento, hora_publicada, fuso,
      cidade, uf,
      local_nome, local_nome_publicado,
      local_endereco, local_latitude, local_longitude, local_raio_metros,
      local_revelacao, publicado
    ) values (
      ${dados.slug}, ${dados.nomeCasal}, ${dados.dataEvento},
      ${dados.horaEvento ?? null}, ${Boolean(dados.horaPublicada)},
      ${dados.fuso ?? "America/Sao_Paulo"},
      ${dados.cidade}, ${dados.uf},
      ${dados.localNome ?? null}, ${Boolean(dados.localNomePublicado)},
      ${dados.localEndereco ?? null},
      ${dados.localLatitude ?? null}, ${dados.localLongitude ?? null},
      ${dados.localRaioMetros ?? null},
      ${dados.localRevelacao}, ${Boolean(dados.publicado)}
    )
    on conflict (slug) where excluido_em is null do update set
      nome_casal           = excluded.nome_casal,
      data_evento          = excluded.data_evento,
      hora_evento          = excluded.hora_evento,
      hora_publicada       = excluded.hora_publicada,
      fuso                 = excluded.fuso,
      cidade               = excluded.cidade,
      uf                   = excluded.uf,
      local_nome           = excluded.local_nome,
      local_nome_publicado = excluded.local_nome_publicado,
      local_endereco       = excluded.local_endereco,
      local_latitude       = excluded.local_latitude,
      local_longitude      = excluded.local_longitude,
      local_raio_metros    = excluded.local_raio_metros,
      local_revelacao      = excluded.local_revelacao,
      publicado            = excluded.publicado,
      atualizado_em        = now()
    returning id, slug
  `

  for (const d of dados.dominios ?? []) {
    await sql`
      insert into evento_dominios (evento_id, dominio, principal)
      values (${evento.id}, ${String(d.dominio).toLowerCase().replace(/^www\./, "")}, ${Boolean(d.principal)})
      on conflict (dominio) where excluido_em is null do update set
        evento_id     = excluded.evento_id,
        principal     = excluded.principal,
        atualizado_em = now()
    `
  }

  /**
   * As indicacoes sao REESCRITAS a cada seed, e nao acumuladas.
   *
   * O arquivo e a fonte da verdade: tirar um hotel do JSON tem que tirar o
   * hotel do site. Com `insert` incremental, um item removido do arquivo
   * continuaria no ar para sempre e ninguem entenderia por que.
   *
   * A exclusao e logica (`excluido_em`), como manda o padrao da casa — o dono
   * consegue recuperar um item que tirou por engano.
   */
  await sql`
    update evento_indicacoes
       set excluido_em = now()
     where evento_id = ${evento.id}
       and excluido_em is null
  `

  for (const [i, ind] of (dados.indicacoes ?? []).entries()) {
    await sql`
      insert into evento_indicacoes
        (evento_id, tipo, titulo, descricao, referencia, url, ordem, publicado)
      values (
        ${evento.id}, ${ind.tipo}, ${ind.titulo},
        ${ind.descricao ?? null}, ${ind.referencia ?? null}, ${ind.url ?? null},
        ${ind.ordem ?? i + 1}, ${ind.publicado === undefined ? true : Boolean(ind.publicado)}
      )
    `
  }

  const quantas = (dados.indicacoes ?? []).length
  console.log(
    `  ${evento.slug}: evento gravado, ${(dados.dominios ?? []).length} dominio(s), ` +
      `${quantas} indicacao(oes)${quantas === 0 ? " — a secao de indicacoes nao vai aparecer na pagina" : ""}`
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
