import { describe, expect, it } from "vitest";

import {
  HOST_MASCARADO,
  caminhoMascarado,
  localizacaoMascarada,
  referenciaMascarada,
} from "@/lib/analytics-privacidade";

/**
 * A ARITMÉTICA DO MASCARAMENTO.
 *
 * O teste irmão (`analytics-sem-pii.test.tsx`) observa o que a página real
 * empilha para o Google. Este aqui prova as regras uma a uma, inclusive nas
 * formas de URL que o produto ainda não tem — que é onde o vazamento seguinte
 * vai nascer.
 */

const WID = "11111111-1111-4111-8111-111111111111";
const SLUG = "ana-e-max";
const DOMINIO_DO_CASAL = "anaemax.com.br";

describe("caminho mascarado", () => {
  const casos: Array<[string, string]> = [
    // As duas formas de endereçar o mesmo casamento colapsam no mesmo caminho.
    ["https://anaemax.com.br/", `/e/${WID}`],
    ["https://anaemax.com.br/e/ana-e-max", `/e/${WID}`],
    ["https://casa-nos.vercel.app/e/ana-e-max/", `/e/${WID}`],

    // Superfícies declaradas sobrevivem: o relatório precisa distinguir álbum
    // de feed, e nenhuma das duas palavras nomeia gente.
    ["https://anaemax.com.br/e/ana-e-max/album", `/e/${WID}/album`],
    ["https://anaemax.com.br/feed", `/e/${WID}/feed`],

    // Nome de convidado é PII de terceiro — pior que a do casal, porque ele nem
    // escolheu estar ali.
    ["https://anaemax.com.br/e/ana-e-max/convidado/joao-silva", `/e/${WID}/convidado/_`],
    ["https://anaemax.com.br/convidado/Ana%20Fl%C3%A1via", `/e/${WID}/convidado/_`],

    // A regra que vale para o que ainda não existe: rota nova nasce mascarada.
    ["https://anaemax.com.br/rota-que-ainda-nao-existe", `/e/${WID}/_`],
    ["https://anaemax.com.br/e/ana-e-max/presentes/lista-da-ana", `/e/${WID}/_/_`],

    // Consulta e fragmento não entram no caminho.
    ["https://anaemax.com.br/e/ana-e-max?nome=Ana#ana-e-max", `/e/${WID}`],
  ];

  for (const [href, esperado] of casos) {
    it(`${href} → ${esperado}`, () => {
      expect(caminhoMascarado(href, WID)).toBe(esperado);
    });
  }

  it("href que não é URL não estoura, e ainda assim mascara", () => {
    expect(caminhoMascarado("/e/ana-e-max", WID)).toBe(`/e/${WID}`);
    expect(caminhoMascarado("", WID)).toBe(`/e/${WID}`);
  });

  /**
   * O componente recebe `evento.id`. `evento.slug` está a um caractere de
   * distância no autocompletar, e trocar um pelo outro repõe exatamente o
   * vazamento que este arquivo fecha — com o slug agora escrito por nós, dentro
   * do campo que deveria protegê-lo.
   */
  it("id que não é uuid vira `_` — passar o slug no lugar do id não vaza", () => {
    expect(caminhoMascarado("https://anaemax.com.br/e/ana-e-max", SLUG)).toBe("/e/_");
    expect(caminhoMascarado("https://anaemax.com.br/", "Ana e Max")).toBe("/e/_");
  });
});

describe("localização mascarada", () => {
  it("o host real some — domínio de casamento é o nome do casal de outro jeito", () => {
    const saida = localizacaoMascarada(`https://${DOMINIO_DO_CASAL}/e/${SLUG}`, WID);
    expect(saida).toBe(`https://${HOST_MASCARADO}/e/${WID}`);
    expect(saida).not.toContain(DOMINIO_DO_CASAL);
    expect(saida).not.toContain("anaemax");
  });

  it("guarda os utm e joga fora o resto da consulta", () => {
    const saida = localizacaoMascarada(
      `https://${DOMINIO_DO_CASAL}/e/${SLUG}?utm_source=whatsapp&utm_medium=convite&nome=Ana+Fl%C3%A1via&telefone=21999999999`,
      WID
    );
    expect(saida).toBe(
      `https://${HOST_MASCARADO}/e/${WID}?utm_source=whatsapp&utm_medium=convite`
    );
    expect(saida).not.toContain("Ana");
    expect(saida).not.toContain("21999999999");
  });

  it("nenhuma forma de escrever o endereço deixa o slug passar", () => {
    const formas = [
      `https://${DOMINIO_DO_CASAL}/`,
      `https://www.${DOMINIO_DO_CASAL}/e/${SLUG}`,
      `https://${DOMINIO_DO_CASAL}/e/${SLUG}#${SLUG}`,
      `https://${DOMINIO_DO_CASAL}/e/${SLUG}?ref=${SLUG}`,
      `https://${DOMINIO_DO_CASAL}/e/${encodeURIComponent(SLUG)}/album`,
      `https://${DOMINIO_DO_CASAL}/${SLUG}`,
    ];
    for (const forma of formas) {
      expect(localizacaoMascarada(forma, WID), forma).not.toContain(SLUG);
    }
  });
});

describe("referência mascarada", () => {
  const AQUI = `https://${DOMINIO_DO_CASAL}/e/${SLUG}`;

  it("sem referência, campo vazio — e ele vai vazio mesmo assim", () => {
    // O campo precisa EXISTIR no hit. Omitir faz o gtag ler `document.referrer`
    // sozinho, que é o comportamento que se está tirando.
    expect(referenciaMascarada("", AQUI, WID)).toBe("");
  });

  it("navegação interna é URL do produto, e é mascarada como qualquer outra", () => {
    expect(referenciaMascarada(`https://${DOMINIO_DO_CASAL}/album`, AQUI, WID)).toBe(
      `https://${HOST_MASCARADO}/e/${WID}/album`
    );
  });

  it("referência de fora fica, mas só a origem", () => {
    expect(referenciaMascarada("https://www.google.com/search?q=casa+nos", AQUI, WID)).toBe(
      "https://www.google.com/"
    );
  });

  /**
   * O redirecionador do Instagram carrega a URL de destino inteira dentro da
   * própria consulta. Guardar a referência crua devolveria o slug pela porta
   * dos fundos, num campo que ninguém olha.
   */
  it("o redirecionador do Instagram não devolve o slug pela consulta", () => {
    const saida = referenciaMascarada(
      `https://l.instagram.com/?u=${encodeURIComponent(AQUI)}&e=ATxxxx`,
      AQUI,
      WID
    );
    expect(saida).toBe("https://l.instagram.com/");
    expect(saida).not.toContain(SLUG);
    expect(saida).not.toContain("anaemax");
  });

  it("referência ilegível vira vazio, não vira erro", () => {
    expect(referenciaMascarada("android-app", AQUI, WID)).toBe("");
  });
});
