/**
 * Cria (ou atualiza) a CONTA de um casamento que ja existe.
 *
 * Uso:
 *   pnpm db:conta ana-e-max eu@exemplo.com
 *   pnpm db:conta ana-e-max eu@exemplo.com --senha "uma frase que eu lembro"
 *
 * POR QUE ELE EXISTE, DEPOIS DE O CADASTRO PUBLICO EXISTIR: o cadastro cria um
 * casamento NOVO. Quem ja tem casamento — o de cobaia, o de laboratorio, ou o de
 * um casal que entrou antes da conta existir — precisa de uma conta apontando
 * para o casamento que ja esta la, com o conteudo que ja foi escrito. Cadastrar
 * pelo site criaria um segundo evento vazio e deixaria o primeiro orfao.
 *
 * SEM `--senha`, UMA E SORTEADA e impressa UMA VEZ. No banco so existe o hash:
 * nao ha como recupera-la depois, e nao deve haver. Troque-a na primeira entrada
 * pela tela de "esqueci a senha", se quiser uma que voce escolheu.
 *
 * A SENHA IMPRESSA E UMA CREDENCIAL. Ela aparece uma vez, aqui. Nao cole em
 * issue, nao mande por mensagem: se vazar, peca uma nova pela tela de
 * recuperacao — a troca derruba todas as sessoes.
 *
 * O HASH VEM DE `lib/senhas-nucleo.mjs`, o mesmo modulo que o produto usa. Este
 * script NAO reimplementa PBKDF2: duas implementacoes do mesmo hash e como um
 * login para de bater sem nenhum erro aparecer.
 */
import fs from "node:fs"
import path from "node:path"
import { neon } from "@neondatabase/serverless"

import { hashDeSenha } from "../lib/senhas-nucleo.mjs"

const RAIZ = process.cwd()

carregarEnvLocal()

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL nao configurada. Veja .env.example e o README (secao 'Banco').")
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

/**
 * Uma senha sorteada que da para ditar por telefone.
 *
 * Quatro palavras de uma lista curta, e nao dezesseis caracteres aleatorios: o
 * dono vai digita-la num celular pelo menos uma vez, e uma senha impossivel de
 * digitar e uma senha que vira captura de tela — que e pior do que qualquer
 * regra de composicao resolveria. A entropia vem do numero no fim e do sorteio
 * criptografico, nao de simbolos.
 */
const PALAVRAS = [
  "amendoeira", "bandolim", "cascata", "damasco", "eclipse", "fandango",
  "girassol", "hibisco", "ipe", "jacaranda", "lampiao", "manjericao",
  "nevoeiro", "orvalho", "peroba", "quiabo", "roseira", "sabia",
  "tamarindo", "umbuzeiro", "vagalume", "xaxim", "zimbro", "acaia",
  "bergamota", "canela", "dendezeiro", "erva-doce", "figueira", "goiabeira",
]

function senhaSorteada() {
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  const palavras = []
  for (let i = 0; i < 4; i++) palavras.push(PALAVRAS[bytes[i] % PALAVRAS.length])
  return `${palavras.join("-")}-${(bytes[4] % 90) + 10}`
}

async function principal() {
  const argumentos = process.argv.slice(2)
  const posicionais = argumentos.filter(a => !a.startsWith("--"))
  const indiceSenha = argumentos.indexOf("--senha")
  const senhaEscolhida = indiceSenha >= 0 ? argumentos[indiceSenha + 1] : null

  const [slug, emailBruto] = posicionais
  if (!slug || !emailBruto) {
    console.error("Uso: pnpm db:conta <slug> <email> [--senha \"...\"]")
    process.exit(1)
  }

  const email = emailBruto.trim().toLowerCase()
  const senha = senhaEscolhida ?? senhaSorteada()

  if (senha.length < 12) {
    console.error("A senha precisa de pelo menos 12 caracteres.")
    process.exit(1)
  }

  const [evento] = await sql`
    select id, slug, nome_casal from eventos
     where slug = ${slug} and excluido_em is null
     limit 1
  `
  if (!evento) {
    console.error(`Nao existe casamento com o slug "${slug}".`)
    process.exit(1)
  }

  const hash = await hashDeSenha(senha)

  /**
   * Conta nova, ou senha nova para a conta que ja existe.
   *
   * `on conflict` com a condicao do indice PARCIAL repetida — sem o
   * `where excluido_em is null`, o Postgres responde 42P10 e nao casa o indice.
   * E o mesmo tropeco que o bootstrap ja levou uma vez (commit d7589d4).
   */
  const [conta] = await sql`
    insert into usuarios (email, senha_hash)
    values (${email}, ${hash})
    on conflict (email) where excluido_em is null do update set
      senha_hash    = excluded.senha_hash,
      atualizado_em = now()
    returning id, (xmax = 0) as nasceu_agora
  `

  /**
   * O vinculo: o acesso de casal deste evento passa a apontar para a conta.
   *
   * Atualiza TODAS as linhas de casal ainda vivas, e nao so uma: um evento pode
   * ter varias sessoes abertas (um celular cada), e todas sao do mesmo casal.
   * Quando nao houver nenhuma — evento criado sem bootstrap —, uma nasce aqui,
   * revogada de imediato: ela existe para o vinculo, e nao como credencial.
   */
  const vinculadas = await sql`
    update evento_acessos
       set usuario_id = ${conta.id}, atualizado_em = now()
     where evento_id = ${evento.id}
       and tipo = 'casal'
       and revogado_em is null
    returning id
  `

  if (vinculadas.length === 0) {
    await sql`
      insert into evento_acessos (evento_id, tipo, token_hash, usuario_id, rotulo, revogado_em)
      values (
        ${evento.id}, 'casal',
        encode(gen_random_bytes(32), 'hex'), ${conta.id}, 'Vinculo da conta', now()
      )
    `
  }

  console.log(`\nCasamento: ${evento.nome_casal}  (${evento.slug})`)
  console.log(`  conta:  ${email}  ${conta.nasceu_agora ? "(criada agora)" : "(ja existia — senha trocada)"}`)
  console.log(`  painel: /painel/${evento.id}/site`)

  if (!senhaEscolhida) {
    console.log(
      `\n  SENHA (aparece uma vez; no banco so existe o hash):\n\n    ${senha}\n\n` +
        `  Entre em /entrar com o e-mail acima. Para trocar por uma que voce escolha,\n` +
        `  use "Esqueci a senha" — a troca derruba todas as sessoes abertas.\n`
    )
  } else {
    console.log(`\n  Senha definida com o valor que voce passou.\n`)
  }
}

principal().catch(erro => {
  console.error(erro)
  process.exit(1)
})
