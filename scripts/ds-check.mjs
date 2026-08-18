/**
 * Catraca do design system — a camada com dentes.
 *
 * POR QUE NO BUILD E NAO SO NO CI: a Vercel roda `pnpm build` em todo deploy.
 * Verificacao que so roda no CI informa; verificacao dentro do build IMPEDE.
 * Como este projeto e publicado direto para producao, e aqui que a diferenca
 * aparece.
 *
 * COMO FUNCIONA: compara o codigo de hoje com `design-system.baseline.json` e
 * falha se algum numero SUBIU.
 *
 * O modo contagem e regra da casa e nao formalidade: catraca que nasce
 * proibindo trabalho existente e desligada no primeiro dia. Neste projeto todos
 * os numeros nascem em ZERO, entao a catraca ja e, na pratica, proibicao — o
 * que ela impede e o primeiro desvio entrar sem ninguem ver.
 *
 * Uso: node scripts/ds-check.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { medir } from "./ds-medidas.mjs"

const RAIZ = process.cwd()
const ARQUIVO_BASELINE = path.join(RAIZ, "design-system.baseline.json")
const baseline = JSON.parse(fs.readFileSync(ARQUIVO_BASELINE, "utf8"))

const { medido, detalhes, quantosArquivos } = medir(RAIZ)

const rotulos = {
  coresLiterais: "cores literais (#hex em app/ e components/)",
  coresEmFuncao: "cores em rgb()/hsl()",
  classesDeCorTailwind: "classes de cor do Tailwind",
  modoEscuro: "usos de dark: (nao existe modo escuro)",
  fontSizeInline: "style={{ fontSize }} inline",
  paginasSemLarguraTratada: "paginas sem largura tratada",
}

let subiu = false
let desceu = false

console.log(`Catraca do design system — ${quantosArquivos} arquivos em app/ e components/\n`)

for (const chave of Object.keys(rotulos)) {
  const agora = medido[chave]
  const teto = baseline[chave]
  if (teto === undefined) {
    console.error(`\nFALHOU: a medida "${chave}" nao existe em design-system.baseline.json.`)
    process.exit(1)
  }
  const delta = agora - teto
  const sinal = delta > 0 ? "SUBIU" : delta < 0 ? "caiu " : "     "
  if (delta > 0) subiu = true
  if (delta < 0) desceu = true
  console.log(
    `  ${sinal}  ${String(agora).padStart(4)} / ${String(teto).padEnd(4)} ${rotulos[chave]}` +
      (delta !== 0 ? `   (${delta > 0 ? "+" : ""}${delta})` : "")
  )
}

if (subiu) {
  console.error(
    "\nOnde:\n" +
      detalhes.map(d => `  - ${d}`).join("\n") +
      "\n\nFALHOU: algum numero subiu.\n" +
      "Remova o desvio que acabou de entrar — nao aumente o teto em\n" +
      "design-system.baseline.json. Se voce tem um motivo real para o numero\n" +
      "subir, ele precisa estar na mensagem do commit.\n"
  )
  process.exit(1)
}

if (desceu) {
  console.log(
    "\nAlgum numero caiu. Atualize design-system.baseline.json com os valores de\n" +
      "agora, senao a catraca fica frouxa e a melhoria pode ser desfeita sem\n" +
      "ninguem notar.\n"
  )
}

console.log("\nOK: nada piorou.")
