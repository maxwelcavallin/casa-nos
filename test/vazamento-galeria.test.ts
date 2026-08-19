import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `evento_fotos` — A QUARTA TABELA DE INQUILINO (v1.0, V-18, RV-14).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELE COMPLEMENTA `test/galeria.test.ts`, E NÃO O REPETE.
 *
 * Lá, um banco falso prova que as consultas **que existem hoje** carregam o
 * `evento_id`. Aqui a varredura é sobre a FORMA: nenhuma consulta nova pode
 * nascer sem o filtro, inclusive uma escrita numa função que ninguém lembrou de
 * testar. Num vazamento entre inquilinos as duas verificações são baratas
 * demais para escolher só uma — é o bug mais caro deste modelo, e ele é
 * **invisível em teste com um inquilino só**.
 *
 * A galeria é a tabela mais exposta das quatro: ela guarda foto do casal num
 * prefixo público, e uma consulta sem filtro serviria a foto do casamento
 * vizinho dentro do site de alguém.
 *
 * Ele vive em arquivo próprio, e não dentro de `vazamento-inquilinos`, porque a
 * técnica é outra: aquele monta um banco falso e observa o comportamento; este
 * lê o SQL. Misturar os dois num arquivo faria a próxima pessoa achar que já
 * existe cobertura de forma para as outras três tabelas — e não existe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");

/** `select`, `insert`, `update`, `delete` — instrução de verdade. */
const EH_SQL = /(^|\s)(select|insert|update|delete)(\s|$)/i;

/**
 * O nome da tabela aparece entre crases na prosa que explica a regra, e prosa
 * tem crase em número ímpar. Sem tirar os comentários, o pareamento abaixo anda
 * um passo e instruções somem do varredor **sem nenhum aviso** — ele fica verde
 * por não estar olhando, que é o pior número possível.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * O miolo de cada template marcado, por PARIDADE e não por expressão regular.
 *
 * Uma regex de crase-a-crase casa a partir de qualquer crase, inclusive de uma
 * que FECHA um template. Partindo a fonte pela crase, os pedaços de índice ímpar
 * são exatamente o conteúdo dos templates.
 */
function instrucoesSobreFotos(fonte: string): string[] {
  const pedacos = semComentarios(fonte).split("`");
  const saida: string[] = [];
  for (let i = 1; i < pedacos.length; i += 2) {
    const pedaco = pedacos[i];
    if (pedaco.includes("evento_fotos") && EH_SQL.test(pedaco)) saida.push(pedaco);
  }
  return saida;
}

function arquivosDeLib(): Array<{ relativo: string; fonte: string }> {
  const pasta = path.join(RAIZ, "lib");
  return fs
    .readdirSync(pasta)
    .filter(nome => nome.endsWith(".ts"))
    .map(nome => ({
      relativo: `lib/${nome}`,
      fonte: fs.readFileSync(path.join(pasta, nome), "utf8"),
    }));
}

describe("nenhuma consulta a `evento_fotos` sem o filtro de inquilino", () => {
  it("o varredor acha as instruções — se não, ele fica verde sem olhar", () => {
    const daGaleria = instrucoesSobreFotos(
      fs.readFileSync(path.join(RAIZ, "lib", "galeria.ts"), "utf8")
    );
    expect(
      daGaleria.length,
      "Nenhuma instrução sobre `evento_fotos` encontrada em lib/galeria.ts. " +
        "Ou a tabela mudou de nome, ou este varredor parou de casar."
    ).toBeGreaterThanOrEqual(4);
  });

  it("**toda instrução SQL sobre `evento_fotos` cita `evento_id`**", () => {
    const infratoras: string[] = [];

    for (const arquivo of arquivosDeLib()) {
      for (const instrucao of instrucoesSobreFotos(arquivo.fonte)) {
        if (/evento_id/.test(instrucao)) continue;
        infratoras.push(
          `${arquivo.relativo}: ${instrucao.replace(/\s+/g, " ").trim().slice(0, 90)}`
        );
      }
    }

    expect(
      infratoras,
      [
        "Estas instruções tocam `evento_fotos` sem citar `evento_id`:",
        ...infratoras.map(i => `  - ${i}`),
        "",
        "Uma consulta sem filtro devolve a resposta certa num banco com dois",
        "registros e vaza num banco com duzentos.",
      ].join("\n")
    ).toEqual([]);
  });

  it("nenhuma rota escreve SQL sobre `evento_fotos` por conta própria", () => {
    /**
     * O acesso à tabela mora em `lib/galeria.ts`, e só lá. Uma rota que montasse
     * a própria consulta escaparia da varredura acima **e** do banco falso de
     * `test/galeria.test.ts` — e é exatamente onde o `evento_id` da URL viraria
     * filtro de inquilino sem ninguém conferir de quem é a sessão.
     */
    const infratoras: string[] = [];

    function varrer(dir: string) {
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) varrer(completo);
        else if (entrada.name === "route.ts") {
          const fonte = fs.readFileSync(completo, "utf8");
          if (instrucoesSobreFotos(fonte).length > 0) {
            infratoras.push(path.relative(RAIZ, completo).split(path.sep).join("/"));
          }
        }
      }
    }
    varrer(path.join(RAIZ, "app", "api"));

    expect(
      infratoras,
      [
        "Estas rotas montam SQL sobre `evento_fotos` em vez de chamar lib/galeria.ts:",
        ...infratoras.map(i => `  - ${i}`),
      ].join("\n")
    ).toEqual([]);
  });
});
