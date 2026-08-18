/**
 * A MEDICAO do design system. Quem decide o que fazer com o numero e
 * `scripts/ds-check.mjs` (roda no build) e `test/design-system.test.ts` (roda no
 * CI).
 *
 * A medicao mora aqui, sozinha, porque enquanto ela estava copiada nos dois
 * lugares dava para consertar um e esquecer o outro — e ai o build e o teste
 * discordavam sobre o mesmo codigo, que e a pior forma possivel de uma catraca
 * falhar.
 *
 * ESCOPO: `app/` e `components/`. `lib/tokens.ts` NAO e medido de proposito —
 * ele E a paleta, e e o unico lugar do projeto onde um `#hex` significa alguma
 * coisa. Proibir la seria proibir a propria fonte.
 *
 * COBERTURA: as 13 proibicoes da §10 do design system. Nove viraram medida
 * automatica; quatro dependem de olho humano e estao listadas no fim deste
 * comentario, para ninguem achar que a catraca guarda o que ela nao guarda.
 *
 *   §10.1  #hex ......................... coresLiterais
 *   §10.1  rgb/hsl/oklch/lab/color-mix .. coresEmFuncao
 *   §10.1  classe de cor do Tailwind .... classesDeCorTailwind
 *   §10.1  nome de cor CSS .............. nomesDeCorCss
 *   §10.2  Tailwind para tipografia ..... classesDeCorTailwind (as de cor)
 *   §10.3  import de components/ui/ ..... importsDeComponentsUi
 *   §10.4  estilo inline de cor ......... estiloInlineDeCor
 *   §10.4  tamanho fora da escala ....... tipografiaForaDaEscala
 *   §10.6  terceira familia de fonte .... familiasDeFonteAMais
 *   §10.9  tela sem largura tratada ..... paginasSemLarguraTratada
 *   §10.11 modo escuro .................. modoEscuro
 *
 * NAO MEDIDO, e por isso continua sendo revisao humana:
 *   §10.5  <div> onde existe componente do MUI
 *   §10.7  script caligrafico como texto corrido
 *   §10.8  texto sobre foto sem veu
 *   §10.12 animacao decorativa e parallax
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

/**
 * `oklch()` esta aqui por um motivo concreto: o Tailwind v4 fala oklch, entao e
 * o formato de cor com chance real de aparecer neste projeto — e a versao
 * anterior desta catraca so olhava rgb e hsl.
 */
const FUNCAO_DE_COR = /\b(rgba?|hsla?|hwb|oklch|oklab|lab|lch|color-mix)\s*\(/g

const PALETA_TAILWIND =
  "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const PREFIXO_DE_COR = "bg|text|border|ring|from|via|to|divide|outline|decoration|caret|accent|fill|stroke|shadow|placeholder"

const CLASSE_DE_COR_TAILWIND = new RegExp(
  [
    // bg-red-500, text-slate-700
    `\\b(?:${PREFIXO_DE_COR})-(?:${PALETA_TAILWIND})-\\d{2,3}\\b`,
    // bg-white, text-black — as que alguem digita sem pensar, porque nao
    // parecem "cor de paleta". Eram justamente as que passavam livres.
    `\\b(?:${PREFIXO_DE_COR})-(?:white|black)\\b`,
    // bg-[#fff], text-[rgb(...)] — valor arbitrario, a porta dos fundos
    `\\b(?:${PREFIXO_DE_COR})-\\[`,
  ].join("|"),
  "g"
)

/**
 * Nome de cor CSS como VALOR de propriedade de cor.
 *
 * So conta quando esta do lado direito de uma propriedade de cor, para nao
 * confundir com nome de variante ou de token (`color: "text.secondary"` e
 * certo; `color: "white"` nao e). `currentColor`, `transparent` e `inherit`
 * ficam de fora: nao sao cor escolhida, sao referencia.
 */
const NOME_DE_COR_CSS =
  /\b(?:color|backgroundColor|bgcolor|borderColor|fill|stroke|outlineColor|background)\s*:\s*["'](?:white|black|red|blue|green|yellow|orange|purple|pink|brown|gray|grey|silver|gold|beige|ivory|navy|teal|olive|maroon|aqua|fuchsia|lime)["']/gi

const MODO_ESCURO = /\bdark:[a-z-]/g

/** Pega `style={{ color: ... }}` e `style={{ background: ... }}`. */
const ESTILO_INLINE_DE_COR = /style=\{\{[^}]*\b(color|background|backgroundColor|borderColor)\s*:/g

/**
 * Qualquer `fontSize`, venha de `style` ou de `sx`.
 *
 * A versao anterior so pegava `style={{ fontSize }}` — e num projeto MUI o jeito
 * provavel de furar a escala e `sx={{ fontSize: 13 }}`, que nao era visto.
 * Tamanho vem de variante do tema; se falta um tamanho, ele nasce na escala.
 */
const TIPOGRAFIA_FORA_DA_ESCALA = /\bfontSize\s*:/g

/** `fontFamily:` avulso. As duas familias do produto vivem em lib/tokens.ts. */
const FAMILIA_DE_FONTE_AVULSA = /\bfontFamily\s*:/g

/** Importar de `components/ui/` (shadcn). A pasta nao nasce neste projeto. */
const IMPORT_DE_COMPONENTS_UI =
  /from\s+["'](?:@\/)?(?:\.\.?\/)*components\/ui(?:\/[^"']*)?["']/g

/** Familias carregadas por `next/font`. O produto tem duas, e so duas. */
const FONTES_DO_NEXT = /import\s*\{([^}]*)\}\s*from\s*["']next\/font\/(?:google|local)["']/g
const LIMITE_DE_FAMILIAS = 2

/**
 * Uma das tres formas aceitas de tratar largura (padrao da casa, §5).
 *
 * A versao anterior aceitava o arquivo se ele contivesse qualquer coisa
 * parecida com `xs:` — e `px: { xs: 2 }` ja satisfazia. Ou seja: uma pagina so
 * com padding responsivo e sem nenhum teto contava como tratada, que e
 * justamente a pagina cujo `h1` estica 1900px num monitor.
 *
 * Agora o breakpoint so conta quando ele muda o DESENHO (largura, direcao,
 * colunas, exibicao), nao o respiro.
 */
function trataLargura(fonte) {
  if (/\bmaxWidth\b/.test(fonte)) return true
  if (/largura\.(texto|conteudo|app)/.test(fonte)) return true
  if (
    /\b(width|flexDirection|gridTemplateColumns|display|flexWrap|columns)\s*:\s*\{\s*(xs|sm|md|lg|xl)\s*:/.test(
      fonte
    )
  ) {
    return true
  }
  return false
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
    nomesDeCorCss: 0,
    modoEscuro: 0,
    estiloInlineDeCor: 0,
    tipografiaForaDaEscala: 0,
    familiaDeFonteAvulsa: 0,
    familiasDeFonteAMais: 0,
    importsDeComponentsUi: 0,
    paginasSemLarguraTratada: 0,
  }

  const detalhes = []
  let familiasDeclaradas = 0

  for (const arquivo of arquivos) {
    const relativo = path.relative(raiz, arquivo).split(path.sep).join("/")
    const fonte = semComentarios(fs.readFileSync(arquivo, "utf8"))

    const achados = {
      coresLiterais: contar(fonte, HEX),
      coresEmFuncao: contar(fonte, FUNCAO_DE_COR),
      classesDeCorTailwind: contar(fonte, CLASSE_DE_COR_TAILWIND),
      nomesDeCorCss: contar(fonte, NOME_DE_COR_CSS),
      modoEscuro: contar(fonte, MODO_ESCURO),
      estiloInlineDeCor: contar(fonte, ESTILO_INLINE_DE_COR),
      tipografiaForaDaEscala: contar(fonte, TIPOGRAFIA_FORA_DA_ESCALA),
      familiaDeFonteAvulsa: contar(fonte, FAMILIA_DE_FONTE_AVULSA),
      importsDeComponentsUi: contar(fonte, IMPORT_DE_COMPONENTS_UI),
    }

    for (const chave of Object.keys(achados)) {
      medido[chave] += achados[chave]
      if (achados[chave] > 0) detalhes.push(`${relativo}: ${achados[chave]} ${chave}`)
    }

    for (const casamento of fonte.matchAll(FONTES_DO_NEXT)) {
      familiasDeclaradas += casamento[1]
        .split(",")
        .map(n => n.trim())
        .filter(Boolean).length
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

  medido.familiasDeFonteAMais = Math.max(0, familiasDeclaradas - LIMITE_DE_FAMILIAS)
  if (medido.familiasDeFonteAMais > 0) {
    detalhes.push(
      `next/font declara ${familiasDeclaradas} familias; o produto tem ${LIMITE_DE_FAMILIAS} (Fraunces e Inter)`
    )
  }

  return { medido, detalhes, quantosArquivos: arquivos.length }
}
