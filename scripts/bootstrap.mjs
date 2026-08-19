/**
 * Bootstrap: cria (ou atualiza) UM evento e o acesso do casal.
 *
 * Uso:
 *   node scripts/bootstrap.mjs db/seed/casamento-ana-e-max.json --dono
 *   node scripts/bootstrap.mjs db/seed/casamento-de-teste.json
 *
 * POR QUE ISTO CONTINUA EXISTINDO DEPOIS DO CADASTRO PUBLICO (19/08/2026): o
 * cadastro cria um casamento NOVO, pelo site. Este script cria um casamento a
 * partir de um arquivo — e e assim que nascem os dois eventos que o teste de
 * vazamento entre inquilinos exige desde o primeiro dia, e o casamento cobaia,
 * que existia antes de haver conta.
 *
 * A CONTA E OUTRA COISA, e ela nao nasce aqui: `pnpm db:conta <slug> <email>`
 * cria (ou troca a senha de) a conta que abre este casamento.
 *
 * DOIS EVENTOS DESDE O PRIMEIRO DIA (PRD §9.1, item 6). O teste de vazamento
 * entre inquilinos e criterio de termino da F1.1, e acrescentar o segundo
 * inquilino depois significa auditar cada consulta escrita ate ali. Rode este
 * script duas vezes, com dois arquivos.
 *
 * IDEMPOTENTE pela chave `slug`, como o seed: rodar dez vezes deixa o banco no
 * mesmo estado que rodar uma.
 *
 * O TOKEN IMPRESSO E UMA CREDENCIAL. Ele aparece uma vez, aqui, porque no banco
 * so existe o hash. Nao cole em issue, nao mande por mensagem, nao guarde: se
 * ele vazar, revogue pelo painel e gere outro.
 */
import fs from "node:fs"
import path from "node:path"
import { neon } from "@neondatabase/serverless"

const RAIZ = process.cwd()

carregarEnvLocal()

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL nao configurada. Veja .env.example e o README.")
  process.exit(1)
}

const sql = neon(url)

const arquivo = process.argv.find(a => a.endsWith(".json"))
if (!arquivo) {
  console.error("Passe o arquivo de seed: node scripts/bootstrap.mjs db/seed/<arquivo>.json [--dono]")
  process.exit(1)
}
const ehDono = process.argv.includes("--dono")

function carregarEnvLocal() {
  for (const nome of [".env.local", ".env"]) {
    const caminho = path.join(RAIZ, nome)
    if (!fs.existsSync(caminho)) continue
    for (const linha of fs.readFileSync(caminho, "utf8").split("\n")) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const valor = m[2].replace(/^["']|["']$/g, "")
      if (valor && !process.env[m[1]]) process.env[m[1]] = valor
    }
  }
}

function paraHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("")
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

async function principal() {
  const dados = JSON.parse(fs.readFileSync(path.join(RAIZ, arquivo), "utf8"))

  const [evento] = await sql`
    insert into eventos (slug, nome_casal, data_evento, fuso, cidade, uf, publicado, email_casal)
    values (${dados.slug}, ${dados.nomeCasal}, ${dados.dataEvento},
            ${dados.fuso ?? "America/Sao_Paulo"}, ${dados.cidade}, ${dados.uf},
            true, ${dados.emailCasal ?? null})
    on conflict (slug) where excluido_em is null do update set
      nome_casal    = excluded.nome_casal,
      data_evento   = excluded.data_evento,
      email_casal   = coalesce(excluded.email_casal, eventos.email_casal),
      atualizado_em = now()
    returning id, slug, nome_casal
  `

  if (dados.dominio) {
    await sql`
      insert into evento_dominios (evento_id, dominio)
      values (${evento.id}, ${dados.dominio})
      on conflict (dominio) where excluido_em is null do nothing
    `
  }

  // O contador nasce zerado junto com o evento: um agregado que so aparece na
  // primeira mudanca de estado obrigaria toda leitura a tratar "linha ausente"
  // como zero, e essa e a diferenca entre "nenhuma foto ainda" e "nao consegui
  // ler" — que a RN-21 proibe confundir.
  await sql`
    insert into evento_contadores (evento_id) values (${evento.id})
    on conflict (evento_id) do nothing
  `

  const existentes = await sql`
    select id from evento_acessos
     where evento_id = ${evento.id} and tipo = 'casal' and revogado_em is null
     limit 1
  `

  let token = null
  if (existentes.length === 0) {
    token = novoToken()
    await sql`
      insert into evento_acessos (evento_id, tipo, token_hash, rotulo, dono)
      values (${evento.id}, 'casal', ${await hashDeToken(token)}, 'Casal', ${ehDono})
    `
  } else if (ehDono) {
    await sql`
      update evento_acessos set dono = true, atualizado_em = now()
       where evento_id = ${evento.id} and tipo = 'casal' and revogado_em is null
    `
  }

  console.log(`\nEvento: ${evento.nome_casal}`)
  console.log(`  id:   ${evento.id}`)
  console.log(`  slug: ${evento.slug}`)
  console.log(`  album: /e/${evento.slug}/album`)
  console.log(`  painel: /painel/${evento.id}/dia`)
  console.log(`  dono: ${ehDono ? "sim" : "nao"}`)

  if (token) {
    console.log(
      `\n  COOKIE DE ACESSO DO CASAL (aparece uma vez; no banco so existe o hash):\n` +
        `    nome:  a_${evento.id.slice(0, 8)}\n` +
        `    valor: ${token}\n` +
        `  Ou peca um link por e-mail na tela de entrada, se email_casal estiver preenchido.\n`
    )
  } else {
    console.log(`\n  Ja existia acesso de casal. Para um novo, revogue o atual no painel.\n`)
  }
}

principal().catch(erro => {
  console.error(erro)
  process.exit(1)
})
