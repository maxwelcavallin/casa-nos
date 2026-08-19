/**
 * O NUCLEO DA SENHA — a unica implementacao do hash, em JavaScript puro.
 *
 * ELE E .mjs, E ISSO E A DECISAO DESTE ARQUIVO. Duas pessoas precisam produzir e
 * conferir o mesmo hash: o produto (`lib/senhas.ts`, TypeScript, no runtime do
 * Next) e o terminal (`scripts/conta.mjs`, Node puro, que cria a conta do dono).
 * Um script que reimplementasse PBKDF2 "igualzinho" e como um login para de bater
 * sem nenhum erro aparecer: o formato continua valido, a comparacao continua
 * rodando, e a senha simplesmente nunca confere. E a mesma armadilha que
 * `lib/segredos.ts` descreve para o hash de token, com um agravante — aqui o
 * sintoma aparece semanas depois, quando alguem tenta entrar.
 *
 * Web Crypto e nao `node:crypto`: e a mesma API nos dois lugares, e no runtime de
 * borda so ela existe.
 *
 * O FORMATO: `pbkdf2-sha256$<iteracoes>$<sal>$<hash>`, tudo em hexadecimal. Os
 * parametros viajam DENTRO do valor para que o custo possa subir sem invalidar as
 * senhas antigas — elas continuam conferindo com os parametros com que nasceram.
 */

export const ALGORITMO = "pbkdf2-sha256"

/** O piso do OWASP para PBKDF2-SHA-256 (2023). Sobe; nunca desce. */
export const ITERACOES = 210_000

const BYTES_DE_SAL = 16
const BYTES_DE_HASH = 32

function paraHex(bytes) {
  let saida = ""
  for (const b of bytes) saida += b.toString(16).padStart(2, "0")
  return saida
}

function deHex(texto) {
  const bytes = new Uint8Array(texto.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(texto.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function derivar(senha, sal, iteracoes) {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveBits"]
  )
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: sal, iterations: iteracoes, hash: "SHA-256" },
    chave,
    BYTES_DE_HASH * 8
  )
  return new Uint8Array(bits)
}

/** O valor que vai para `usuarios.senha_hash`. Nunca a senha. */
export async function hashDeSenha(senha) {
  const sal = new Uint8Array(BYTES_DE_SAL)
  crypto.getRandomValues(sal)
  const derivado = await derivar(senha, sal, ITERACOES)
  return `${ALGORITMO}$${ITERACOES}$${paraHex(sal)}$${paraHex(derivado)}`
}

/**
 * Percorre TODOS os bytes, sempre.
 *
 * Comparar dois hashes com `===` devolve na primeira diferenca, e a diferenca de
 * tempo entre "errou no primeiro byte" e "errou no ultimo" e mensuravel pela
 * rede.
 */
function igualEmTempoConstante(a, b) {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i]
  return diferenca === 0
}

/**
 * `true` quando a senha confere com o hash guardado.
 *
 * Hash malformado devolve `false` — e nao estoura. Uma coluna corrompida por uma
 * migracao de dado malfeita nao pode virar 500 numa tela de login.
 */
export async function senhaConfere(senha, guardado) {
  if (typeof senha !== "string" || typeof guardado !== "string") return false
  const partes = guardado.split("$")
  if (partes.length !== 4 || partes[0] !== ALGORITMO) return false

  const iteracoes = Number.parseInt(partes[1], 10)
  if (!Number.isInteger(iteracoes) || iteracoes < 1000) return false
  if (!/^[0-9a-f]+$/.test(partes[2]) || !/^[0-9a-f]+$/.test(partes[3])) return false

  const derivado = await derivar(senha, deHex(partes[2]), iteracoes)
  return igualEmTempoConstante(derivado, deHex(partes[3]))
}

/**
 * O hash nasceu com custo menor que o de hoje?
 *
 * Quem responde `true` teve a senha conferida com os parametros antigos e pode
 * ser reescrita com os novos — no login, o unico momento em que a senha em claro
 * existe do nosso lado.
 */
export function precisaRecriarOHash(guardado) {
  const partes = String(guardado).split("$")
  if (partes.length !== 4 || partes[0] !== ALGORITMO) return true
  return Number.parseInt(partes[1], 10) < ITERACOES
}
