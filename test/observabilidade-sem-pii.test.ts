import { describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import { registrarErro, sanearMensagem } from "@/lib/observabilidade";

/**
 * O REGISTRO DE ERRO NÃO GUARDA GENTE (H-18).
 *
 * "Toda rota de API captura exceção e registra: rota, `evento_id`, tipo de
 * sessão, e o erro. **Nunca** nome, telefone ou conteúdo de foto."
 *
 * A mensagem de exceção é o lugar mais fácil do mundo para um dado pessoal
 * aparecer sem ninguém planejar: basta alguém escrever
 * `new Error(\`convidado ${rotulo} sem slot\`)` — que é a forma natural de
 * escrever uma exceção. Por isso a barreira é uma função, e ela tem teste.
 */

describe("sanearMensagem", () => {
  it("apaga token de 64 hexadecimais", () => {
    const bruta = `falha ao validar ${"a".repeat(64)} na rota`;
    const limpa = sanearMensagem(bruta);
    expect(limpa).not.toContain("a".repeat(64));
    expect(limpa).toContain("[token]");
  });

  it("apaga e-mail", () => {
    expect(sanearMensagem("nao achei maxwel@exemplo.com.br")).toBe("nao achei [email]");
  });

  it("apaga sequência longa de dígitos — telefone, documento, cartão", () => {
    expect(sanearMensagem("contato 21987654321")).toBe("contato [numero]");
  });

  it("PRESERVA uuid — ele é opaco e é como se liga um erro a uma mídia às 23h", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    expect(sanearMensagem(`midia ${uuid} sem previa`)).toContain(uuid);
  });

  it("trunca mensagem gigante", () => {
    expect(sanearMensagem("x".repeat(5000)).length).toBeLessThanOrEqual(300);
  });

  it("aguenta o que não é string sem estourar", () => {
    // Quem chama é um `catch`, e em `catch` chega qualquer coisa: `undefined`,
    // um objeto, uma string. Um saneador que estoura transforma um erro em dois
    // e apaga o rastro do primeiro.
    expect(() => sanearMensagem(undefined)).not.toThrow();
    expect(() => sanearMensagem({ a: 1 })).not.toThrow();
  });
});

describe("registrarErro", () => {
  function bancoFalso(quebrar = false) {
    const instrucoes: Array<{ texto: string; valores: unknown[] }> = [];
    const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
      instrucoes.push({ texto, valores });
      if (quebrar) throw new Error("banco fora do ar");
      // A consulta do alerta pede contagens.
      if (/select \(select count/.test(texto)) return [{ erros: 0, envios: 0, alertas: 0 }];
      return [];
    }) as unknown as Executor;
    return { exec, instrucoes };
  }

  it("grava rota, tipo de sessão e evento, com a mensagem saneada", async () => {
    const banco = bancoFalso();
    await registrarErro(
      {
        origem: "servidor",
        rota: "/api/eventos/[id]/midias/intencao",
        sessaoTipo: "convidado",
        eventoId: "11111111-1111-4111-8111-111111111111",
        tipoErro: "servidor",
        classe: "Error",
        mensagem: "estourou para joana@exemplo.com",
        httpStatus: 500,
      },
      banco.exec
    );

    const insercao = banco.instrucoes.find(i => /insert into eventos_de_erro/.test(i.texto));
    expect(insercao).toBeDefined();
    expect(insercao!.valores).toContain("/api/eventos/[id]/midias/intencao");
    expect(insercao!.valores.some(v => String(v).includes("joana@exemplo.com"))).toBe(false);
    expect(insercao!.valores.some(v => String(v).includes("[email]"))).toBe(true);
  });

  it("a ROTA gravada é a declarada, nunca a URL crua", async () => {
    // A URL carrega slug e token, e os dois são identificador legível. O que vai
    // para a tabela de erro tem a mesma régua do que vai para o GA4.
    const banco = bancoFalso();
    await registrarErro(
      { origem: "cliente", rota: "/api/interno/erro-cliente", sessaoTipo: "convidado" },
      banco.exec
    );
    const insercao = banco.instrucoes.find(i => /insert into eventos_de_erro/.test(i.texto));
    expect(insercao!.valores.some(v => String(v).includes("ana-e-max"))).toBe(false);
  });

  it("NUNCA estoura, mesmo com o banco fora do ar", async () => {
    /**
     * Um registrador de erro que lança transforma um 500 num 500 diferente e
     * apaga o rastro do primeiro: o defeito passa a ser sobre a ferramenta de
     * diagnóstico, e a causa original nunca é escrita.
     */
    const banco = bancoFalso(true);
    await expect(
      registrarErro({ origem: "servidor", rota: "/x", sessaoTipo: "anonimo" }, banco.exec)
    ).resolves.toBeUndefined();
  });
});
