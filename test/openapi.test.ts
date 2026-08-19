import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ROTAS_DE_API } from "@/lib/rotas";

/**
 * O contrato gerado bate com o código.
 *
 * `scripts/openapi.mjs` lê `lib/rotas.ts` como TEXTO — o arquivo é TypeScript e
 * importá-lo do script exigiria um passo de compilação só para gerar um JSON.
 * A extração por expressão regular funciona porque a forma do arquivo é fechada
 * (objetos literais, sem lógica), mas ela pode silenciosamente parar de achar
 * uma rota no dia em que alguém formatar o arquivo de outro jeito.
 *
 * ESTE TESTE É O QUE IMPEDE ISSO DE VIRAR UM CONTRATO MENTIROSO: ele compara o
 * JSON gerado com o MÓDULO de verdade, importado. Se a extração perder uma rota,
 * o CI quebra em vez de o produto publicar um contrato incompleto.
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const ARQUIVO = path.join(RAIZ, "docs", "openapi-casa-nos.json");

type Documento = {
  paths: Record<string, Record<string, unknown>>;
};

const documento = JSON.parse(fs.readFileSync(ARQUIVO, "utf8")) as Documento;

function paraOpenApi(caminho: string): string {
  return caminho.replace(/\[([^\]]+)\]/g, "{$1}");
}

describe("docs/openapi-casa-nos.json", () => {
  it("tem exatamente os caminhos declarados em lib/rotas.ts", () => {
    const esperados = ROTAS_DE_API.map(r => paraOpenApi(r.caminho)).sort();
    const gerados = Object.keys(documento.paths).sort();
    expect(
      gerados,
      "O contrato divergiu da lista de rotas. Rode `node scripts/openapi.mjs` — e " +
        "se ele não achou uma rota, conserte a extração antes de publicar o arquivo."
    ).toEqual(esperados);
  });

  it("tem exatamente os métodos declarados, rota por rota", () => {
    for (const rota of ROTAS_DE_API) {
      const esperados = Object.keys(rota.metodos).map(m => m.toLowerCase()).sort();
      const gerados = Object.keys(documento.paths[paraOpenApi(rota.caminho)] ?? {}).sort();
      expect(gerados, `métodos divergentes em ${rota.caminho}`).toEqual(esperados);
    }
  });

  it("toda rota com parâmetro declara o parâmetro", () => {
    for (const rota of ROTAS_DE_API.filter(r => r.caminho.includes("["))) {
      const operacoes = Object.values(
        documento.paths[paraOpenApi(rota.caminho)] as Record<
          string,
          { parameters?: unknown[] }
        >
      );
      for (const operacao of operacoes) {
        expect(operacao.parameters?.length, `sem parâmetros em ${rota.caminho}`).toBeGreaterThan(
          0
        );
      }
    }
  });

  it("todo erro documentado usa o formato único do produto", () => {
    // `{ erro, detalhe? }`. Nunca 200 com `{ sucesso: false }`, e nunca um
    // formato por rota — o cliente da fila decide retentar a partir do status, e
    // um formato divergente vira tratamento divergente.
    const operacoes = Object.values(documento.paths).flatMap(p => Object.values(p));
    for (const operacao of operacoes as Array<{ responses: Record<string, unknown> }>) {
      for (const status of ["400", "403", "404", "500"]) {
        expect(operacao.responses[status]).toBeDefined();
      }
    }
  });
});
