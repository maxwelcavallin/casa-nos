import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { instrucoesDe } from "@/scripts/sql-instrucoes.mjs";

/**
 * O separador de instruções do runner de migration.
 *
 * POR QUE ELE TEM TESTE PRÓPRIO: é a peça mais fácil de errar do processo, e o
 * erro dela não parece erro dela. Um `;` cortado no lugar errado chega ao
 * Postgres como SQL truncado, e a mensagem que volta fala de sintaxe — mandando
 * quem investiga procurar defeito na migration, que está correta.
 *
 * O cenário caro é a migration parcialmente aplicada: metade das tabelas criada,
 * a outra metade não, e o banco num estado que só ele conhece.
 */

const partir = instrucoesDe as (sql: string) => string[];

describe("instrucoesDe", () => {
  it("separa instruções simples", () => {
    expect(partir("create table a (id int); create table b (id int);")).toHaveLength(2);
  });

  it("ignora `;` dentro de string literal", () => {
    const sql = "insert into t (txt) values ('ponto e virgula ; aqui'); select 1;";
    const instrucoes = partir(sql);
    expect(instrucoes).toHaveLength(2);
    expect(instrucoes[0]).toContain("ponto e virgula ; aqui");
  });

  it("ignora `;` dentro de comentário de linha e de bloco", () => {
    const sql = `
      -- comentario com ; dentro
      create table a (id int);
      /* bloco com ; dentro */
      create table b (id int);
    `;
    expect(partir(sql)).toHaveLength(2);
  });

  it("ignora `;` dentro de corpo com cifrão — o caso que quebra split(';')", () => {
    const sql = `
      create function f() returns trigger as $$
      begin
        new.atualizado_em = now();
        return new;
      end;
      $$ language plpgsql;
      create table a (id int);
    `;
    const instrucoes = partir(sql);
    expect(
      instrucoes,
      "O corpo em $$ foi cortado ao meio. Uma função assim chegaria truncada ao banco."
    ).toHaveLength(2);
    expect(instrucoes[0]).toContain("return new");
  });

  it("ignora `;` dentro de identificador entre aspas duplas", () => {
    expect(partir('create table "tabela;esquisita" (id int); select 1;')).toHaveLength(2);
  });

  it("não devolve instrução vazia por causa de `;` sobrando", () => {
    expect(partir("select 1;;\n\n;")).toEqual(["select 1"]);
  });
});

describe("as migrations do projeto passam pelo separador", () => {
  const PASTA = path.resolve(import.meta.dirname, "..", "db", "migrations");
  const arquivos = fs.readdirSync(PASTA).filter(n => n.endsWith(".sql"));

  it("existe migration para conferir", () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  for (const arquivo of arquivos) {
    it(`${arquivo} vira instruções não vazias e todas idempotentes`, () => {
      const instrucoes = partir(fs.readFileSync(path.join(PASTA, arquivo), "utf8"));
      expect(instrucoes.length).toBeGreaterThan(0);

      for (const instrucao of instrucoes) {
        expect(instrucao.trim()).not.toBe("");

        /**
         * Toda instrução do projeto precisa poder rodar duas vezes.
         *
         * O runner aplica uma instrução por requisição, sem transação em volta
         * do arquivo: se a quinta falhar, as quatro primeiras já ficaram. Com
         * tudo idempotente, consertar e rodar de novo é seguro. Sem isso, o
         * conserto exige alguém abrir o console do banco e desfazer à mão — que
         * é exatamente a DDL manual que o padrão da casa proíbe.
         */
        expect(
          /^\s*create (table|index|unique index|extension)/i.test(instrucao)
            ? /if not exists/i.test(instrucao)
            : true,
          `Instrução não idempotente em ${arquivo}:\n${instrucao.slice(0, 120)}...`
        ).toBe(true);
      }
    });
  }
});
