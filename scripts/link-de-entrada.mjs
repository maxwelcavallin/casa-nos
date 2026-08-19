/**
 * Gera um link de entrada no painel, sem passar por e-mail.
 *
 * O caminho normal do casal e pedir o link em /entrar, que o manda por e-mail
 * pelo Brevo. Isso nao serve para duas situacoes reais: um evento de laboratorio
 * sem `email_casal` (que e o caso do segundo inquilino, de proposito), e
 * qualquer ambiente sem chave do Brevo configurada.
 *
 * Sem esta ferramenta a alternativa era colar um cookie na mao pelo DevTools —
 * que funciona, e ensina a tratar credencial como se fosse configuracao.
 *
 * O TOKEN IMPRESSO E UMA CREDENCIAL. Vale 30 minutos e serve uma vez so, que e
 * a mesma regra do link por e-mail: esta ferramenta muda o transporte, nunca a
 * validade.
 *
 *   pnpm db:link casamento-de-teste
 *   pnpm db:link casamento-de-teste --base https://casa-nos.vercel.app
 */

import fs from "node:fs"
import path from "node:path"
import { neon } from "@neondatabase/serverless"

const RAIZ = process.cwd()

// Mesma leitura do bootstrap: a credencial mora em .env.local, nunca no repo.
function carregarEnvLocal() {
  for (const nome of [".env.local", ".env"]) {
    const caminho = path.join(RAIZ, nome)
    if (!fs.existsSync(caminho)) continue
    for (const linha of fs.readFileSync(caminho, "utf8").split(String.fromCharCode(10))) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const valor = m[2].replace(/^["']|["']$/g, "")
      if (valor && !process.env[m[1]]) process.env[m[1]] = valor
    }
  }
}

carregarEnvLocal()

const url = process.env.DATABASE_URL
if (!url) {
  console.error("\nFalta DATABASE_URL. Copie .env.example para .env.local e preencha.\n")
  process.exit(1)
}
const sql = neon(url)

const slug = process.argv[2]
if (!slug || slug.startsWith("--")) {
  console.error("\nUso: pnpm db:link <slug> [--base https://...]\n")
  process.exit(1)
}
const iBase = process.argv.indexOf("--base")
const base = iBase > -1 ? process.argv[iBase + 1] : "http://localhost:3000"

function paraHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")
}

function novoToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return paraHex(bytes)
}

async function hashDeToken(token) {
  const digerido = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  return paraHex(new Uint8Array(digerido))
}

const [evento] = await sql`
  select id, slug, nome_casal from eventos
   where slug = ${slug} and excluido_em is null
`
if (!evento) {
  console.error(`\nNao existe evento vivo com slug "${slug}".\n`)
  process.exit(1)
}

const token = novoToken()
await sql`
  insert into evento_acessos_convites (evento_id, token_hash, expira_em)
  values (${evento.id}, ${await hashDeToken(token)}, now() + interval '30 minutes')
`

console.log(`\nEvento: ${evento.nome_casal}  (${evento.slug})`)
console.log(`\n  LINK DE ENTRADA — vale 30 minutos e serve uma vez so:\n`)
console.log(`    ${base}/entrar/${token}\n`)
