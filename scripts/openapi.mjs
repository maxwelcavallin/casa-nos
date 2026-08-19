/**
 * Gera `docs/openapi-casa-nos.json` a partir de `lib/rotas.ts`.
 *
 * CONTRATO GERADO, NAO ESCRITO A MAO (stack.md §5). Contrato escrito a mao
 * diverge do codigo em duas semanas — e a divergencia nao aparece em lugar
 * nenhum, porque ninguem le os dois lado a lado.
 *
 * Uso:  node scripts/openapi.mjs            (regenera)
 *       node scripts/openapi.mjs --conferir (falha se estiver desatualizado)
 *
 * O `--conferir` roda dentro do `pnpm verificar`. Rota nova sem regenerar o
 * contrato quebra o CI, que e o unico jeito de o arquivo continuar valendo
 * alguma coisa.
 *
 * O QUE ELE NAO DESCREVE: o corpo de cada requisicao e resposta. Isso exigiria
 * um esquema por rota, escrito a mao, que e exatamente o que este script existe
 * para evitar. O que ele garante e a lista de caminhos, metodos, permissao
 * exigida e status possiveis — que e o que muda quando alguem mexe nas rotas.
 */
import fs from "node:fs"
import path from "node:path"

const RAIZ = process.cwd()
const SAIDA = path.join(RAIZ, "docs", "openapi-casa-nos.json")

/**
 * Le `lib/rotas.ts` como TEXTO em vez de importar o modulo.
 *
 * O arquivo e TypeScript e importa tipos; um `import()` aqui exigiria um passo
 * de compilacao so para gerar um JSON. A extracao e por expressao regular
 * porque a forma do arquivo e fechada — objetos literais, sem logica — e porque
 * `test/openapi.test.ts` compara o resultado com o modulo de verdade, entao uma
 * extracao errada quebra o CI em vez de gerar um contrato mentiroso.
 */
function lerRotas() {
  const fonte = fs.readFileSync(path.join(RAIZ, "lib", "rotas.ts"), "utf8")
  const bloco = fonte
    .slice(fonte.indexOf("export const ROTAS_DE_API"), fonte.indexOf("export type Tela"))
    /**
     * OS COMENTARIOS SAEM ANTES DA EXTRACAO.
     *
     * A primeira versao casava `caminho: "...", metodos: {` com `\s*` entre os
     * dois — e uma entrada com um comentario no meio (que e o padrao deste
     * arquivo: quase toda rota explica por que esta na posicao em que esta)
     * simplesmente NAO ERA ENCONTRADA. A rota sumia do contrato em silencio, e
     * quem lesse o JSON concluiria que ela nao existe.
     *
     * `test/openapi.test.ts` pegou isso comparando com o modulo de verdade, que
     * e exatamente para isso que ele existe.
     */
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")

  const rotas = []
  const porRota = /\{\s*caminho:\s*"([^"]+)",\s*metodos:\s*\{([^}]*)\}([^}]*)\}/g
  for (const achado of bloco.matchAll(porRota)) {
    const metodos = {}
    for (const par of achado[2].matchAll(/(GET|POST|PATCH|DELETE):\s*"([^"]+)"/g)) {
      metodos[par[1]] = par[2]
    }
    rotas.push({
      caminho: achado[1],
      metodos,
      publica: /publica:\s*true/.test(achado[3]),
    })
  }
  return rotas
}

/** `[id]` do App Router vira `{id}` do OpenAPI. */
function paraOpenApi(caminho) {
  return caminho.replace(/\[([^\]]+)\]/g, "{$1}")
}

function parametrosDe(caminho) {
  return [...caminho.matchAll(/\[([^\]]+)\]/g)].map(m => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string", format: m[1] === "token" ? "hex64" : "uuid" },
    description:
      m[1] === "token"
        ? "64 caracteres hexadecimais. Formato conferido antes de qualquer consulta."
        : "uuid. Formato conferido antes de qualquer consulta: malformado e 404, nunca 500.",
  }))
}

const ERRO = {
  description: "Formato unico de erro do produto.",
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["erro"],
        properties: { erro: { type: "string" }, detalhe: {} },
      },
    },
  },
}

function documento() {
  const paths = {}

  for (const rota of lerRotas()) {
    const caminho = paraOpenApi(rota.caminho)
    paths[caminho] = paths[caminho] ?? {}
    const parametros = parametrosDe(rota.caminho)

    for (const [metodo, acao] of Object.entries(rota.metodos)) {
      paths[caminho][metodo.toLowerCase()] = {
        summary: `${metodo} ${rota.caminho}`,
        description:
          `Permissao exigida: \`${acao}\` (lib/autorizacao.ts).` +
          (rota.publica ? " Rota publica, com limite de taxa." : ""),
        ...(parametros.length ? { parameters: parametros } : {}),
        responses: {
          200: { description: "OK" },
          400: ERRO,
          403: { ...ERRO, description: "Sem permissao para esta acao." },
          404: {
            ...ERRO,
            description:
              "Nao encontrado. Cobre id malformado, recurso inexistente e recurso de OUTRO evento — os tres dao a mesma resposta, de proposito.",
          },
          405: { ...ERRO, description: "Metodo nao declarado em lib/rotas.ts." },
          500: ERRO,
        },
      }
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "casa-nos",
      version: "fatia-1-f1.1-f1.2",
      description:
        "GERADO por scripts/openapi.mjs a partir de lib/rotas.ts. Nao edite a mao: a proxima geracao apaga.",
    },
    paths,
  }
}

const gerado = JSON.stringify(documento(), null, 2) + "\n"

if (process.argv.includes("--conferir")) {
  const atual = fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA, "utf8") : ""
  if (atual !== gerado) {
    console.error(
      "\nFALHOU: docs/openapi-casa-nos.json esta desatualizado.\n" +
        "Rode `node scripts/openapi.mjs` e inclua o arquivo no mesmo commit da rota.\n"
    )
    process.exit(1)
  }
  console.log("OK: contrato em dia.")
} else {
  fs.mkdirSync(path.dirname(SAIDA), { recursive: true })
  fs.writeFileSync(SAIDA, gerado)
  console.log(`OK: ${path.relative(RAIZ, SAIDA)} regenerado.`)
}
