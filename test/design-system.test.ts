import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import baseline from "@/design-system.baseline.json";
// A MESMA medição que o build usa. Importá-la daqui é o ponto: se o teste
// medisse por conta própria, o CI e o build poderiam discordar sobre o mesmo
// código — que é a pior forma possível de uma catraca falhar.
import { medir } from "@/scripts/ds-medidas.mjs";
import { monograma } from "@/lib/tokens";

const RAIZ = path.resolve(import.meta.dirname, "..");

type Medida = Record<string, number>;
type Resultado = { medido: Medida; detalhes: string[]; quantosArquivos: number };

const medirEm = medir as (raiz: string) => Resultado;

describe("catraca do design system — o código de hoje", () => {
  const { medido, detalhes, quantosArquivos } = medirEm(RAIZ);

  it("a medição achou os arquivos — se não achou, o resto é falso positivo", () => {
    expect(quantosArquivos).toBeGreaterThan(5);
  });

  for (const chave of Object.keys(baseline).filter(k => !k.startsWith("_"))) {
    it(`${chave} não subiu`, () => {
      expect(
        medido[chave],
        `${chave} subiu. Onde:\n` +
          detalhes.filter(d => d.includes(chave)).map(d => `  - ${d}`).join("\n") +
          "\n\nRemova o desvio — não aumente o teto em design-system.baseline.json."
      ).toBeLessThanOrEqual((baseline as unknown as Medida)[chave]);
    });
  }

  it("toda medida do baseline existe na medição, e vice-versa", () => {
    // Sem isto, renomear uma medida em `ds-medidas.mjs` e esquecer o baseline
    // deixaria a medida órfã: ela continuaria sendo contada e nunca comparada
    // com nada. A catraca ficaria verde por não estar olhando.
    const noBaseline = Object.keys(baseline).filter(k => !k.startsWith("_")).sort();
    expect(Object.keys(medido).sort()).toEqual(noBaseline);
  });
});

/**
 * A CATRACA CONSEGUE PEGAR ALGUMA COISA?
 *
 * POR QUE ESTE BLOCO EXISTE: todos os números do projeto estão em zero, o que
 * quer dizer que nenhum teste acima jamais viu a medição acusar um desvio. Uma
 * catraca quebrada e uma catraca com nada para pegar produzem exatamente o mesmo
 * relatório — todos zerados, "OK: nada piorou" — e a diferença entre as duas só
 * apareceria no dia em que alguém cometesse o desvio que ela deveria barrar.
 *
 * Aqui a medição roda contra código deliberadamente errado, num diretório
 * temporário, e cada medida precisa acusar.
 */
describe("catraca do design system — ela pega o desvio quando ele existe", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "casa-nos-ds-"));
  fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "components"), { recursive: true });

  fs.writeFileSync(
    path.join(tmp, "components", "Ruim.tsx"),
    `
    import { Botao } from "@/components/ui/button";
    import { Cormorant_Garamond, Montserrat, Lobster } from "next/font/google";

    export function Ruim() {
      return (
        <div
          className="bg-white text-slate-700 border-[#ccc] dark:bg-black"
          style={{ color: "white", fontSize: 13 }}
          sx={{
            fontSize: 13,
            fontFamily: "Comic Sans",
            backgroundColor: "#FF00FF",
            borderColor: "rgb(1, 2, 3)",
            outlineColor: "oklch(0.7 0.1 20)",
          }}
        >
          <Botao />
        </div>
      );
    }
    `,
    "utf8"
  );

  // Página sem teto de largura: só padding responsivo, que era o passe-livre da
  // versão anterior do `trataLargura`.
  fs.writeFileSync(
    path.join(tmp, "app", "page.tsx"),
    `export default function P() { return <Box sx={{ px: { xs: 2, sm: 3 } }} />; }`,
    "utf8"
  );

  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const { medido } = medirEm(tmp);

  const esperados: [keyof Medida, string][] = [
    ["coresLiterais", "#FF00FF"],
    ["coresEmFuncao", "rgb() e oklch()"],
    ["classesDeCorTailwind", "bg-white, text-slate-700, border-[#ccc]"],
    ["nomesDeCorCss", 'color: "white"'],
    ["modoEscuro", "dark:bg-black"],
    ["estiloInlineDeCor", "style={{ color }}"],
    ["tipografiaForaDaEscala", "fontSize em style e em sx"],
    ["familiaDeFonteAvulsa", "fontFamily avulso"],
    ["familiasDeFonteAMais", "uma terceira família além de Cormorant e Montserrat"],
    ["importsDeComponentsUi", "import de components/ui/"],
    ["paginasSemLarguraTratada", "página só com padding responsivo"],
  ];

  for (const [chave, oQue] of esperados) {
    it(`acusa ${chave} (${oQue})`, () => {
      expect(
        medido[chave],
        `A medida "${chave}" não acusou nada num arquivo que viola ${oQue}. ` +
          "A catraca está cega para essa regra — e um relatório de zeros não " +
          "distingue código limpo de medição quebrada."
      ).toBeGreaterThan(0);
    });
  }

  it("não confunde caminho de token do tema com nome de cor CSS", () => {
    // `color: "text.secondary"` e `borderColor: "divider"` são o jeito CERTO.
    // Uma catraca que reprova o certo é desligada na primeira sexta-feira.
    const limpo = fs.mkdtempSync(path.join(os.tmpdir(), "casa-nos-ds-ok-"));
    fs.mkdirSync(path.join(limpo, "components"), { recursive: true });
    fs.writeFileSync(
      path.join(limpo, "components", "Bom.tsx"),
      `export const B = () => (
        <Typography sx={{ color: "text.secondary", borderColor: "divider", bgcolor: "primary.main" }} />
      );`,
      "utf8"
    );
    const r = medirEm(limpo);
    expect(r.medido.nomesDeCorCss).toBe(0);
    expect(r.medido.coresLiterais).toBe(0);
    fs.rmSync(limpo, { recursive: true, force: true });
  });
});

/**
 * O MONOGRAMA TEM UM PISO, E ELE É MEDIDA — NÃO GOSTO.
 *
 * O traço mais fino da ligadura vale 1.9% da largura da tinta. Abaixo de 88px
 * de tinta ele cai de 1.7px CSS e some numa tela de densidade 1: o monograma
 * vira um borrão azul. A tinta ocupa 64.9% do arquivo (o resto é respiro
 * simétrico já embutido), então 88px de tinta são 136px de arquivo.
 *
 * Isto existe porque "diminui um pouquinho para caber" é a mudança mais provável
 * que alguém vai fazer neste token, e o estrago não aparece em teste de layout:
 * a caixa continua do tamanho certo, só o desenho some.
 */
describe("piso do monograma", () => {
  it("nenhum tamanho declarado desce do mínimo medido", () => {
    const tamanhos = [
      monograma.rodape,
      monograma.hero.xs,
      monograma.hero.sm,
    ];
    for (const tamanho of tamanhos) {
      expect(
        tamanho,
        `${tamanho}px é menor que o piso de ${monograma.minimo}px. Abaixo dele o ` +
          "traço fino da ligadura desaparece — e a caixa continua do tamanho certo, " +
          "então nenhum teste de layout acusaria."
      ).toBeGreaterThanOrEqual(monograma.minimo);
    }
  });

  it("a tinta no piso ainda mantém o traço fino acima de 1px CSS", () => {
    // 136px de arquivo × 64.9% de tinta × 1.9% = ~1.68px de traço.
    const traco = monograma.minimo * monograma.fracaoDaTinta * 0.019;
    expect(traco).toBeGreaterThan(1);
  });
});
