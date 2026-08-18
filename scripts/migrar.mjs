/**
 * Aplica as migrations de `db/migrations/` em ordem, uma vez cada.
 *
 * Uso:  pnpm db:migrar          (aplica o que falta)
 *       pnpm db:migrar --status (só lista, não aplica)
 *
 * POR QUE UM RUNNER PROPRIO E NAO UMA FERRAMENTA: o produto tem UMA
 * dependencia de banco (@neondatabase/serverless) e este arquivo tem 90 linhas.
 * Uma ferramenta a mais no PATH e um passo a mais que precisa existir na maquina
 * de quem faz o deploy — e a premissa da casa e que quem mantem nao roda nada
 * localmente.
 *
 * O QUE ELE GARANTE: o banco reconstroi do zero a partir da pasta. Se isso
 * deixar de valer, a pasta e decorativa.
 *
 * DDL NA MAO NO CONSOLE E PROIBIDA. No instante em que alguem roda um ALTER
 * TABLE no painel do Neon, o schema de producao vira algo que so o banco
 * conhece, e nenhum ambiente novo consegue mais ser reconstruido.
 */
import fs from "node:fs"
import path from "node:path"
import { neon } from "@neondatabase/serverless"
import { instrucoesDe } from "./sql-instrucoes.mjs"

const RAIZ = process.cwd()
const PASTA = path.join(RAIZ, "db", "migrations")

carregarEnvLocal()

const url = process.env.DATABASE_URL
if (!url) {
  console.error(
    "DATABASE_URL nao configurada.\n" +
      "Crie um .env.local a partir do .env.example com a string de conexao do Neon,\n" +
      "ou exporte a variavel no ambiente antes de rodar."
  )
  process.exit(1)
}

const sql = neon(url)
const soStatus = process.argv.includes("--status")

/** Lê `.env.local` sem dependência: o script roda fora do Next, que carregaria sozinho. */
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

async function principal() {
  await sql`
    create table if not exists _migracoes (
      nome        text primary key,
      aplicada_em timestamptz not null default now()
    )
  `

  const jaAplicadas = new Set(
    (await sql`select nome from _migracoes`).map(l => l.nome)
  )

  const arquivos = fs
    .readdirSync(PASTA)
    .filter(n => n.endsWith(".sql"))
    .sort()

  if (arquivos.length === 0) {
    console.error(`Nenhuma migration em ${PASTA}.`)
    process.exit(1)
  }

  let aplicou = 0

  for (const arquivo of arquivos) {
    const feita = jaAplicadas.has(arquivo)
    if (soStatus) {
      console.log(`  ${feita ? "aplicada " : "PENDENTE "} ${arquivo}`)
      continue
    }
    if (feita) {
      console.log(`  ja aplicada  ${arquivo}`)
      continue
    }

    const bruto = fs.readFileSync(path.join(PASTA, arquivo), "utf8")
    const instrucoes = instrucoesDe(bruto)
    console.log(`  aplicando    ${arquivo} (${instrucoes.length} instrucoes)`)

    for (const [indice, instrucao] of instrucoes.entries()) {
      try {
        await sql.query(instrucao)
      } catch (erro) {
        console.error(
          `\nFALHOU em ${arquivo}, instrucao ${indice + 1}:\n\n${instrucao}\n\n${erro.message}\n\n` +
            `A migration NAO foi registrada como aplicada. Toda instrucao do projeto e\n` +
            `idempotente (create ... if not exists), entao conserte e rode de novo:\n` +
            `as instrucoes que ja passaram nao vao reclamar.\n`
        )
        process.exit(1)
      }
    }

    await sql`insert into _migracoes (nome) values (${arquivo})`
    aplicou++
  }

  if (!soStatus) {
    console.log(
      aplicou === 0 ? "\nNada a aplicar — o banco esta em dia." : `\nOK: ${aplicou} migration(s) aplicada(s).`
    )
  }
}

principal().catch(erro => {
  console.error(erro)
  process.exit(1)
})
