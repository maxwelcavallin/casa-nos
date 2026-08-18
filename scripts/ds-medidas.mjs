/**
 * A MEDICAO do design system. Quem decide o que fazer com o numero e
 * `scripts/ds-check.mjs` (roda no build) e `test/design-system.test.ts` (roda no
 * CI).
 *
 * A medicao mora aqui, sozinha, porque enquanto ela estava copiada nos dois
 * lugares dava para consertar um e esquecer o outro — e ai o build e o teste
 * discordavam sobre o mesmo codigo, que e a pior forma possivel de uma catraca
 * falhar.
 */
import fs from "node:fs"
import path from "node:path"

const EXTENSOES = new Set([".ts", ".tsx"])

function arquivosDe(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) arquivosDe(completo, acc)
    else if (EXTENSOES.has(path.extname(entrada.name))) acc.push(completo)
  }
  return acc
}

/**
 * Tira comentario antes de contar.
 *
 * Comentario que registra a cor de um bug antigo — "o botao vinha #E0E0E0" — e
 * documentacao, nao desvio, e deve continuar permitido. Contar comentario faria
 * a catraca punir justamente quem explica o passado.
 */
function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const HEX = /#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\b/g
const FUNCAO_DE_COR = /\b(rgb|rgba|hsl|hsla)\(/g
const CLASSE_DE_COR_TAILWIND =
  /\b(?:bg|text|border|ring|from|via|to|divide|outline|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g
const MODO_ESCURO = /\bdark:[a-z-]/g
const FONT_SIZE_INLINE = /style=\{\{[^}]*fontSize/g

/** Uma das tres formas aceitas de tratar largura (padrao da casa, §5). */
function trataLargura(fonte) {
  return (
    /maxWidth/.test(fonte) ||
    /largura\.(texto|conteudo|app)/.test(fonte) ||
    /\b(xs|sm|md|lg|xl):/.test(fonte) ||
    /\{\s*xs:/.test(fonte)
  )
}

function contar(fonte, expressao) {
  return (fonte.match(expressao) ?? []).length
}

export function medir(raiz) {
  const arquivos = [
    ...arquivosDe(path.join(raiz, "app")),
    ...arquivosDe(path.join(raiz, "components")),
  ]

  const medido = {
    coresLiterais: 0,
    coresEmFuncao: 0,
    classesDeCorTailwind: 0,
    modoEscuro: 0,
    fontSizeInline: 0,
    paginasSemLarguraTratada: 0,
  }

  const detalhes = []

  for (const arquivo of arquivos) {
    const relativo = path.relative(raiz, arquivo).split(path.sep).join("/")
    const fonte = semComentarios(fs.readFileSync(arquivo, "utf8"))

    const achados = {
      coresLiterais: contar(fonte, HEX),
      coresEmFuncao: contar(fonte, FUNCAO_DE_COR),
      classesDeCorTailwind: contar(fonte, CLASSE_DE_COR_TAILWIND),
      modoEscuro: contar(fonte, MODO_ESCURO),
      fontSizeInline: contar(fonte, FONT_SIZE_INLINE),
    }

    for (const chave of Object.keys(achados)) {
      medido[chave] += achados[chave]
      if (achados[chave] > 0) detalhes.push(`${relativo}: ${achados[chave]} ${chave}`)
    }

    if (relativo.endsWith("page.tsx") && !trataLargura(fonte)) {
      // Pagina que delega a montagem inteira a um componente de composicao
      // (PaginaDoEvento) nao precisa repetir o teto — o teto esta la.
      if (!/PaginaDoEvento/.test(fonte)) {
        medido.paginasSemLarguraTratada += 1
        detalhes.push(`${relativo}: sem largura tratada`)
      }
    }
  }

  return { medido, detalhes, quantosArquivos: arquivos.length }
}
