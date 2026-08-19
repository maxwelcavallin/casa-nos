import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import { enderecoDoSite, enderecoDoSiteParaLer } from "@/lib/enderecos";
import { conferirPublicacao, definirPublicacao } from "@/lib/publicacao";

/**
 * PUBLICAR, TIRAR DO AR, E O ENDEREÇO (v1.0, V-11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO SEGURA, e o porquê de cada parte:
 *
 * 1. **`site_published` só na transição.** O GA4 não desconta evento duplicado e
 *    não preenche o passado. Um toque duplo num botão — que é o comportamento
 *    normal de quem aperta e não vê retorno, no celular, com rede lenta — dobra
 *    o primeiro degrau da árvore de aquisição, para sempre.
 * 2. **Tirar do ar não apaga nada** (RV-13). A instrução escreve UMA coluna, e o
 *    teste lê o SQL para provar isso: um `delete` ou um `set ... = null` que
 *    entrasse aqui um dia não teria sintoma até alguém tentar republicar.
 * 3. **O inquilino vem do servidor.** O `evento_id` do `where` é o do evento já
 *    resolvido por `autorizar()`, nunca o do corpo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const ANA = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

/**
 * Um banco falso com DOIS casamentos, e um deles já publicado.
 *
 * Dois desde a primeira linha porque vazamento entre inquilinos é invisível em
 * teste com um só: um `where` esquecido passa despercebido enquanto existir um
 * evento no ar, e aparece no dia em que o segundo casal entrar.
 */
function bancoFalso(estado: Record<string, boolean>) {
  const consultas: Array<{ texto: string; valores: unknown[] }> = [];

  const exec = ((partes: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = partes.join(" ? ");
    consultas.push({ texto, valores });

    // A instrução da V-11: `[eventoId, publicado, publicado, publicado]`.
    const [eventoId, publicado] = valores as [string, boolean];
    if (!(eventoId in estado)) return Promise.resolve([]);

    const antes = estado[eventoId];
    const mudou = antes !== publicado;
    estado[eventoId] = publicado;
    return Promise.resolve([{ id: eventoId, publicado, mudou }]);
  }) as Executor;

  return { exec, consultas, estado };
}

describe("o corpo do `PATCH`", () => {
  it("aceita booleano de verdade, e só ele", () => {
    expect(conferirPublicacao({ publicado: true })).toBe(true);
    expect(conferirPublicacao({ publicado: false })).toBe(false);
  });

  it("recusa `\"true\"`, `1` e `\"sim\"`", () => {
    /**
     * As três são jeitos plausíveis de alguém publicar um site sem querer — a
     * mais provável delas vem de um `<input>` ligado direto no `fetch`, cujo
     * `value` é sempre string. `"false"` é o pior de todos: com coerção, ele
     * publicaria.
     */
    expect(conferirPublicacao({ publicado: "true" })).toBeNull();
    expect(conferirPublicacao({ publicado: "false" })).toBeNull();
    expect(conferirPublicacao({ publicado: 1 })).toBeNull();
    expect(conferirPublicacao({ publicado: "sim" })).toBeNull();
  });

  it("recusa corpo vazio, nulo e sem o campo", () => {
    // `corpoJson` devolve `null` quando o JSON chega truncado — o que acontece
    // sozinho num aparelho que perdeu a rede no meio do envio. Isso é 400, e
    // não 500.
    expect(conferirPublicacao(null)).toBeNull();
    expect(conferirPublicacao({})).toBeNull();
    expect(conferirPublicacao("publicado")).toBeNull();
  });
});

describe("publicar e tirar do ar", () => {
  it("publicar um site fora do ar **muda**, e é o que emite `site_published`", async () => {
    const { exec } = bancoFalso({ [ANA]: false });
    const resultado = await definirPublicacao(ANA, true, exec);
    expect(resultado).toEqual({ publicado: true, mudou: true });
  });

  it("**dois toques não geram dois eventos**", async () => {
    /**
     * O segundo `PATCH` encontra o valor já gravado. `mudou` volta `false`, e a
     * tela não emite nada — sem depender de nenhuma trava no cliente, que é o
     * remédio que parece equivalente e não é: os dois toques leem o mesmo estado
     * de React antes de qualquer resposta chegar.
     */
    const { exec } = bancoFalso({ [ANA]: false });
    const primeiro = await definirPublicacao(ANA, true, exec);
    const segundo = await definirPublicacao(ANA, true, exec);

    expect(primeiro?.mudou).toBe(true);
    expect(segundo?.mudou).toBe(false);
    // E o estado final é o mesmo: repetir não desfaz.
    expect(segundo?.publicado).toBe(true);
  });

  it("tirar do ar e publicar de novo volta a ser transição", async () => {
    const { exec } = bancoFalso({ [ANA]: true });
    expect((await definirPublicacao(ANA, false, exec))?.mudou).toBe(true);
    expect((await definirPublicacao(ANA, false, exec))?.mudou).toBe(false);
    expect((await definirPublicacao(ANA, true, exec))).toEqual({
      publicado: true,
      mudou: true,
    });
  });

  it("evento inexistente devolve `null` — e a rota responde 404", async () => {
    /**
     * A CTE `alvo` existe para isto: sem ela, zero linhas afetadas significaria
     * "não mudou" e "não existe" ao mesmo tempo, e um `PATCH` no id de outro
     * casamento responderia 200.
     */
    const { exec } = bancoFalso({ [ANA]: false });
    expect(await definirPublicacao(OUTRO, true, exec)).toBeNull();
  });

  it("**o casamento A não publica o B**", async () => {
    const { exec, consultas, estado } = bancoFalso({ [ANA]: false, [OUTRO]: false });
    await definirPublicacao(ANA, true, exec);

    expect(estado[OUTRO], "o outro casamento foi ao ar junto").toBe(false);
    // O id do `where` é o que foi passado, e ele vem do evento já resolvido pelo
    // servidor (`autorizar()`), nunca do corpo da requisição.
    expect(consultas[0].valores[0]).toBe(ANA);
  });
});

describe("a instrução escreve uma coluna, e nada mais", () => {
  const FONTE = fs.readFileSync(path.join(RAIZ, "lib/publicacao.ts"), "utf8");

  it("**nada é apagado** (RV-13)", () => {
    /**
     * Tirar do ar é estado. Um `delete` ou um `set ... = null` que entrasse aqui
     * não teria sintoma até alguém tentar republicar — e nesse dia o site voltaria
     * vazio, semanas depois de o casal ter escrito tudo.
     */
    const sql = FONTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(sql).not.toMatch(/\bdelete\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    // As duas únicas colunas escritas.
    const atribuicoes = [...sql.matchAll(/set\s+([\s\S]*?)\s+from\s+alvo/gi)].map(a => a[1]);
    expect(atribuicoes).toHaveLength(1);
    expect(atribuicoes[0]).toMatch(/publicado\s*=/);
    expect(atribuicoes[0]).toMatch(/atualizado_em\s*=\s*now\(\)/);
  });

  it("a transição é decidida na MESMA instrução que grava", () => {
    /**
     * O driver HTTP do Neon executa uma instrução por requisição, sem transação
     * abraçando o arquivo. "Lê, compara, escreve" são duas idas ao banco, e
     * entre elas cabe o segundo toque: os dois leem `false`, os dois gravam
     * `true`, e os dois concluem que houve transição.
     */
    expect(FONTE).toMatch(/is distinct from/);
    // Uma chamada ao executor, e uma só.
    expect(FONTE.match(/await exec`/g) ?? []).toHaveLength(1);
  });

  it("a consulta filtra por id e por `excluido_em is null`", () => {
    expect(FONTE).toMatch(/where id = \$\{eventoId\}[\s\S]*?and excluido_em is null/);
  });
});

describe("o endereço que o painel mostra", () => {
  it("o domínio do casal ganha do `/e/<slug>`", () => {
    /**
     * É o endereço que o casal pagou e escolheu. O `/e/<slug>` é a forma de o
     * site existir enquanto o DNS não aponta — mostrá-lo a quem já tem domínio
     * seria ensinar o casal a divulgar o endereço errado.
     */
    expect(enderecoDoSite("https://casa-nos.app", "ana-e-max", "anaemax.com.br")).toBe(
      "https://anaemax.com.br"
    );
    expect(enderecoDoSiteParaLer("https://casa-nos.app", "ana-e-max", "anaemax.com.br")).toBe(
      "anaemax.com.br"
    );
  });

  it("sem domínio, o endereço é o `/e/<slug>` da origem atual", () => {
    /**
     * A origem vem dos cabeçalhos e não de variável de ambiente: um endereço
     * copiado na pré-visualização precisa abrir a pré-visualização, senão o
     * casal testa o link e cai no site de produção sem entender por quê.
     */
    expect(enderecoDoSite("https://casa-nos.app", "ana-e-max")).toBe(
      "https://casa-nos.app/e/ana-e-max"
    );
    expect(enderecoDoSiteParaLer("https://previa.vercel.app", "ana-e-max")).toBe(
      "previa.vercel.app/e/ana-e-max"
    );
  });

  it("**não é o endereço do álbum**", () => {
    /**
     * `caminhoCurto`/`enderecoParaLer` montam `casa-nos.app/<slug>`, que é o QR
     * do cartão de mesa e leva ao ENVIO DE FOTOS. Confundir os dois mandaria 150
     * pessoas ao álbum meses antes da festa.
     */
    expect(enderecoDoSite("https://casa-nos.app", "ana-e-max")).toContain("/e/");
  });
});

describe("a confirmação diz a consequência", () => {
  const TELA = fs.readFileSync(
    path.join(RAIZ, "components/painel/site/PublicacaoDoSite.tsx"),
    "utf8"
  );

  it("a frase do PRD está escrita, inteira", () => {
    // Critério literal da V-11. Ela não pode virar "tem certeza?" numa refação
    // de copy: quem chegou ao botão já tem certeza do que quer, e não sabe é o
    // que vai acontecer.
    expect(TELA).toMatch(
      /quem abrir o link vai ver uma página de\s*\n?\s*endereço não encontrado/
    );
  });

  it("ela diz também que nada é apagado (RV-13)", () => {
    expect(TELA).toMatch(/Nada é apagado/);
  });

  it("**publicar não pede confirmação; tirar do ar pede**", () => {
    /**
     * A assimetria é deliberada: publicar é reversível num toque, e pedir
     * confirmação para os dois lados ensinaria a atravessar a caixa sem ler — o
     * que estraga justamente a caixa que importa.
     */
    expect(TELA).toMatch(/onClick=\{\(\) => void definir\(true\)\}/);
    expect(TELA).toMatch(/onClick=\{\(\) => setConfirmando\(true\)\}/);
    // Ação destrutiva não fecha por toque no véu (design system §16.5).
    expect(TELA).toMatch(/destrutiva/);
  });

  it("o evento só sai quando o SERVIDOR disse que mudou", () => {
    expect(TELA).toMatch(
      /corpo\.publicado === true && corpo\.mudou === true[\s\S]{0,120}enviarEvento\("site_published"/
    );
  });

  it("**a emenda da galeria está registrada, e não antecipada**", () => {
    /**
     * Quando a galeria existir (V-18), a foto vai morar no prefixo público e
     * despublicar o site **não** tira o arquivo do ar. V-19 tem o critério de
     * emendar esta frase. Enquanto isso, o texto é verdadeiro inteiro — e uma
     * frase que fala de fotos que não existem confunde mais do que a ausência
     * dela.
     *
     * O que este teste segura é o comentário: sem ele, quem mexer nesta tela
     * daqui a dois meses não tem como saber que o texto tem data de validade.
     */
    expect(TELA).toMatch(/V-19 tem o critério de emendar esta frase/);
    // E a frase de hoje NÃO fala de foto.
    expect(TELA).not.toMatch(/continua conseguindo abrir essa foto/);
  });
});
