import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { linhaDeContagem, SecaoGaleria } from "@/components/evento/SecaoGaleria";
import { Providers } from "@/components/Providers";
import type { FotoDoSite } from "@/lib/galeria";

/**
 * A GALERIA NA PÁGINA — as proibições do §20.6, viradas em asserção.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE: dos catorze itens proibidos da galeria, **sete
 * são coisas que o dev não veria como erro** — `object-fit`, `aspect-ratio`
 * literal, esqueleto na caixa reservada, `alt` diferente de `""`, a miniatura de
 * 400 no site, caixa de legenda vazia e foto como alvo de toque. Nenhum deles
 * quebra nada; todos parecem melhoria. Regra escrita não segura nenhum.
 *
 * DUAS CAMADAS, e as duas são necessárias:
 *
 *   1. **O DOM montado.** Prova o que a página entrega: `alt` vazio, medidas no
 *      elemento, `<figcaption>` só quando há legenda, uma coluna.
 *   2. **A leitura do código.** Prova o que a página NÃO tem. Um véu de hover
 *      não aparece no DOM montado do jsdom, e uma pseudo-classe também não —
 *      então a única forma de proibir "nada se sobrepõe à foto" (RV-27) é olhar
 *      o arquivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = "https://midia.exemplo/pub/e/11111111-1111-4111-8111-111111111111/g";

/**
 * O PIOR CASO DA §20.7, e não doze paisagens bonitas.
 *
 * Um 9:16 **primeiro** e sem legenda, uma panorâmica com 80 caracteres em caixa
 * alta, um retrato com uma palavra de 40 caracteres sem espaço, e um 4:5 **por
 * último** e sem legenda. É onde o alinhamento da legenda, o teto de altura e a
 * quebra de palavra quebram juntos.
 */
const FOTOS: FotoDoSite[] = [
  { url: `${BASE}/f1/p.jpg`, largura: 900, altura: 1600, legenda: null },
  {
    url: `${BASE}/f2/p.jpg`,
    largura: 1600,
    altura: 900,
    legenda: "O DIA EM QUE A GENTE DECIDIU CASAR NA PRAIA DO ARPOADOR AO ANOITECER",
  },
  { url: `${BASE}/f3/p.jpg`, largura: 1200, altura: 1200, legenda: null },
  {
    url: `${BASE}/f4/p.jpg`,
    largura: 1067,
    altura: 1600,
    legenda: "Antesdeaverguardaramossairemcorrendo pela areia inteira.",
  },
  { url: `${BASE}/f5/p.jpg`, largura: 1280, altura: 1600, legenda: null },
];

function montar(fotos: FotoDoSite[] = FOTOS) {
  return render(
    <Providers>
      <SecaoGaleria fotos={fotos} />
    </Providers>
  );
}

/* ------------------------------------------------------------------ *
 * 1. O que a página entrega
 * ------------------------------------------------------------------ */

describe("a galeria renderizada", () => {
  it("**a seção some sem foto** (RV-02)", () => {
    const { container } = montar([]);
    expect(container.querySelector("section")).toBeNull();
    // Nem título, nem sobrescrita, nem a linha invisível: uma seção vazia num
    // convite não informa nada e ainda sugere que alguém esqueceu de preencher.
    expect(container.textContent).toBe("");
  });

  it("uma foto é uma linha completa, e não um estado especial", () => {
    // A objeção do `po` resolvida por construção: numa coluna, uma foto é pixel
    // a pixel a primeira linha de uma galeria de doze. Nenhum desenho próprio.
    const { container } = montar([FOTOS[0]]);
    expect(container.querySelectorAll("figure")).toHaveLength(1);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("uma foto por bloco — nenhuma figura carrega duas imagens", () => {
    const { container } = montar();
    for (const figura of container.querySelectorAll("figure")) {
      expect(figura.querySelectorAll("img")).toHaveLength(1);
    }
    expect(container.querySelectorAll("figure")).toHaveLength(FOTOS.length);
  });

  it("**todo `alt` é vazio** (RV-19)", () => {
    /**
     * E é vazio nos DOIS casos, com legenda e sem. `alt` igual à legenda faria o
     * leitor de tela anunciar a mesma frase duas vezes seguidas — a imagem e
     * depois o `figcaption`. Um teste que aceite `alt` igual à legenda está
     * escrito contra a versão velha da regra.
     */
    const { container } = montar();
    const imagens = [...container.querySelectorAll("img")];
    expect(imagens).toHaveLength(FOTOS.length);
    for (const imagem of imagens) {
      expect(imagem.getAttribute("alt")).toBe("");
    }
  });

  it("**o `<figcaption>` existe só quando há legenda**, e nunca vazio", () => {
    const { container } = montar();
    const legendas = [...container.querySelectorAll("figcaption")];
    expect(legendas).toHaveLength(FOTOS.filter(f => f.legenda).length);
    for (const legenda of legendas) {
      expect(legenda.textContent?.trim()).not.toBe("");
    }

    // E a figura sem legenda não deixa caixa nenhuma no lugar dela.
    const semLegenda = [...container.querySelectorAll("figure")].filter(
      f => !f.querySelector("figcaption")
    );
    expect(semLegenda).toHaveLength(FOTOS.filter(f => !f.legenda).length);
    for (const figura of semLegenda) {
      expect(figura.children).toHaveLength(1);
    }
  });

  it("**a legenda não é truncada**: sem `noWrap`, sem reticências", () => {
    const { container } = montar();
    const legenda = container.querySelector("figcaption")!;
    // O texto inteiro está no DOM. `noWrap` do MUI vira `text-overflow: ellipsis`
    // com `white-space: nowrap`, e é isso que a régua §10.25 recusa.
    expect(legenda.textContent).toBe(FOTOS[1].legenda);
    expect(legenda.textContent).not.toMatch(/…|\.\.\./);
    expect(legenda.className).not.toMatch(/noWrap/i);
  });

  it("**`width` e `height` saem de `evento_fotos`** — a caixa é reservada antes do byte", () => {
    const { container } = montar();
    const imagens = [...container.querySelectorAll("img")];
    imagens.forEach((imagem, i) => {
      expect(imagem.getAttribute("width")).toBe(String(FOTOS[i].largura));
      expect(imagem.getAttribute("height")).toBe(String(FOTOS[i].altura));
    });
  });

  it("**a primeira é ansiosa, as demais preguiçosas**", () => {
    const { container } = montar();
    const imagens = [...container.querySelectorAll("img")];
    expect(imagens[0].getAttribute("loading")).toBe("eager");
    for (const imagem of imagens.slice(1)) {
      expect(imagem.getAttribute("loading")).toBe("lazy");
    }
  });

  it("**a página serve a prévia, e nunca a miniatura de 400**", () => {
    const { container } = montar();
    for (const imagem of container.querySelectorAll("img")) {
      expect(imagem.getAttribute("src")).toMatch(/\/p\.jpg$/);
      expect(imagem.getAttribute("src")).not.toMatch(/\/t\.jpg$/);
    }
  });

  it("**a `<section>` é nomeada por um `h2` de verdade**", () => {
    /**
     * É a primeira das duas mitigações do `alt=""` (§20.5): com doze imagens sem
     * descrição, o título deixa de ser decorativo e passa a ser **o nome do
     * grupo**. Sem ele, a região é anônima e cheia de imagens mudas.
     */
    const { container } = montar();
    const secao = container.querySelector("section")!;
    const id = secao.getAttribute("aria-labelledby");
    expect(id).toBeTruthy();

    const alvo = container.querySelector(`#${id}`)!;
    expect(alvo).toBeTruthy();
    expect(alvo.tagName).toBe("H2");
    expect(alvo.textContent).toBe("Nossas fotos");
  });

  it("**a linha de contagem existe, e conta o que foi renderizado**", () => {
    const { container } = montar();
    expect(container.textContent).toContain(`São ${FOTOS.length} fotos.`);
    // E o número NÃO entra no título: o título aparece na lista de títulos do
    // rotor, e "Nossas fotos, 5 fotos" transforma navegação em inventário.
    expect(container.querySelector("h2")!.textContent).toBe("Nossas fotos");
  });

  it("**o singular é outra frase, e não uma variação mecânica**", () => {
    // "1 fotos" é o defeito óbvio. `É uma foto.` é o silencioso: ouvido sozinho
    // soa como definição, e não como contagem. O `só` força a leitura de número.
    expect(linhaDeContagem(1)).toBe("É uma foto só.");
    expect(linhaDeContagem(2)).toBe("São 2 fotos.");
    expect(linhaDeContagem(12)).toBe("São 12 fotos.");

    const { container } = montar([FOTOS[0]]);
    expect(container.textContent).toContain("É uma foto só.");
  });

  it("a linha de contagem **não aparece para quem enxerga**", () => {
    /**
     * A proibição de contador visível (§20.6, item 9) continua de pé. O recorte
     * é `clip-path` + `position: absolute`, e não `display: none` — este último
     * tiraria o texto da árvore de acessibilidade também, ou seja, sumiria com
     * ele para quem ele existe para servir.
     */
    const { container } = montar();
    const linha = [...container.querySelectorAll("p")].find(p =>
      p.textContent?.includes("São 5 fotos.")
    )!;
    expect(linha).toBeTruthy();

    /**
     * A regra é lida da folha que o emotion injetou, e não de
     * `getComputedStyle`: o jsdom não resolve classe de folha injetada para
     * propriedade computada, e a asserção passaria por vacuidade.
     */
    const folhas = [...document.querySelectorAll("style")]
      .map(s => s.textContent ?? "")
      .join("");
    // TODAS as ocorrências da classe, e não a primeira: o emotion emite um
    // `.classe{}` vazio antes da regra de verdade, e casar só a primeira faria
    // esta asserção passar por vacuidade sobre uma regra em branco.
    const regra = [...linha.classList]
      .flatMap(classe => [
        ...folhas.matchAll(new RegExp(`\.${classe}\{([^}]*)\}`, "g")),
      ])
      .map(achado => achado[1])
      .join("");

    expect(regra.length, "nenhuma regra encontrada para a linha invisível").toBeGreaterThan(0);

    expect(regra, "a linha invisível perdeu o estilo de recorte").toContain(
      "position:absolute"
    );
    expect(regra).toMatch(/clip-path:inset\(50%\)/);
    // `width: 1` no `sx` do MUI significa 100%, e não 1px: o texto ficaria
    // recortado e mesmo assim ocuparia a caixa inteira do pai.
    expect(regra).toContain("width:1px");
    // `display: none` e `visibility: hidden` tirariam o texto da árvore de
    // acessibilidade também — ou seja, sumiriam com ele para quem ele serve.
    expect(regra).not.toContain("display:none");
    expect(regra).not.toContain("visibility:hidden");
  });

  it("**nenhuma foto é alvo de toque** — nem link, nem botão, nem foco", () => {
    /**
     * Consequência direta do lightbox cortado (D4): uma foto que reage ao
     * ponteiro **promete abrir**, e não há nada para abrir. É a decisão que
     * sustenta a outra — mexer numa sozinha quebra a outra.
     */
    const { container } = montar();
    const secao = container.querySelector("section")!;
    expect(secao.querySelectorAll("a")).toHaveLength(0);
    expect(secao.querySelectorAll("button")).toHaveLength(0);
    expect(secao.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(secao.querySelectorAll("[tabindex]")).toHaveLength(0);
    for (const imagem of secao.querySelectorAll("img")) {
      expect(getComputedStyle(imagem).cursor).not.toBe("pointer");
    }
  });

  it("**nada se sobrepõe à foto** (RV-27) — no DOM montado", () => {
    /**
     * A figura tem a imagem e, quando há legenda, o `figcaption`. Nada mais: nem
     * chip, nem ícone, nem número, nem gradiente, nem cantoneira. E nenhum
     * elemento dentro da figura sai do fluxo — que é como um véu chega.
     */
    const { container } = montar();
    for (const figura of container.querySelectorAll("figure")) {
      const filhos = [...figura.children].map(f => f.tagName);
      for (const tag of filhos) expect(["IMG", "FIGCAPTION"]).toContain(tag);

      for (const descendente of figura.querySelectorAll("*")) {
        const posicao = getComputedStyle(descendente).position;
        expect(posicao, `${descendente.tagName} saiu do fluxo dentro da figura`).not.toBe(
          "absolute"
        );
        expect(posicao).not.toBe("fixed");
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. O que a página NÃO tem — a leitura do código
 * ------------------------------------------------------------------ */

describe("os catorze itens proibidos da galeria (§20.6)", () => {
  const arquivo = path.join(RAIZ, "components", "evento", "SecaoGaleria.tsx");
  /**
   * Sem comentários. O cabeçalho deste componente **explica** cada proibição, e
   * um varredor que olhasse o texto reprovaria o arquivo por conter as palavras
   * que ele existe para proibir — uma catraca que quebra por causa de um
   * comentário é desligada no primeiro dia.
   */
  const fonte = fs
    .readFileSync(arquivo, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  const PROIBIDOS: Array<[string, RegExp, string]> = [
    [
      "object-fit",
      /objectFit|object-fit/,
      "a caixa É a proporção da foto. Escrever `contain` anuncia uma caixa que não bate com a imagem, e `cover` recorta — e aqui o recorte é permanente, porque não há lightbox.",
    ],
    [
      "aspect-ratio literal",
      /aspectRatio|aspect-ratio/,
      "a proporção é DADO (`evento_fotos.largura/altura`), não estilo.",
    ],
    [
      "esqueleto / blur-up / cor de espera",
      /Skeleton|blur|shimmer|placeholder/i,
      "a caixa já está reservada e a página é renderizada no servidor. O que aparece enquanto a foto não chega é a moldura vazia com a proporção certa — e um shimmer aqui é enfeite que pisca.",
    ],
    [
      "alvo de toque",
      /cursor:\s*["']pointer|role=["']button|onClick|tabIndex|<a\s|href=/,
      "uma foto que reage ao ponteiro promete abrir, e o lightbox foi cortado.",
    ],
    [
      "véu, gradiente ou sobreposição",
      /gradient|overlay|backdrop|::before|::after|content:\s*["']/,
      "nada se sobrepõe a uma foto na página pública (RV-27).",
    ],
    [
      "hover na foto",
      /&:hover|":hover"/,
      "hover é a porta pela qual o véu entra, e ele é a promessa de que algo acontece ao tocar.",
    ],
    [
      "sombra",
      /boxShadow|elevation/,
      "sombra diz “levantado”; a foto é conteúdo dentro da coluna de leitura, como os parágrafos da história.",
    ],
    [
      "grade, mosaico ou carrossel",
      /GradeMidias|CardMidia|Masonry|columnCount|gridTemplate|scrollSnap|Carousel/,
      "uma coluna, uma foto por linha, em todos os viewports (D1).",
    ],
    [
      "a miniatura de 400 no site",
      /grade\.miniatura|\/t\.jpg/,
      "sem lightbox, a prévia É a foto. A miniatura é do editor no painel (D7).",
    ],
    [
      "contador visível",
      /de\s+12|\/\s*12|contador/i,
      "o teto é 12 e doze cabem numa rolagem. A contagem existe só para leitor de tela.",
    ],
  ];

  for (const [nome, padrao, motivo] of PROIBIDOS) {
    it(`não tem ${nome}`, () => {
      expect(padrao.test(fonte), `${nome} entrou em SecaoGaleria.tsx — ${motivo}`).toBe(
        false
      );
    });
  }

  it("**`alt` só aparece como `alt=\"\"`**", () => {
    const usos = [...fonte.matchAll(/\balt=\{?["']?([^"'}\s]*)["']?\}?/g)].map(m => m[1]);
    expect(usos.length, "sumiu o `alt` do componente").toBeGreaterThan(0);
    for (const uso of usos) expect(uso).toBe("");
  });

  it("**`GradeMidias` e `CardMidia` não entram em `components/evento/`**", () => {
    /**
     * A varredura é da PASTA, e não deste arquivo: o motivo que decide não é a
     * largura, é que um tile pequeno é uma promessa de que a foto abre. Qualquer
     * componente da página pública que os importasse reabriria o lightbox sem
     * perceber.
     */
    const pasta = path.join(RAIZ, "components", "evento");
    const infratores = fs
      .readdirSync(pasta)
      .filter(nome => /\.tsx?$/.test(nome))
      .filter(nome =>
        /from\s+["']@\/components\/album\/(GradeMidias|CardMidia)["']/.test(
          fs.readFileSync(path.join(pasta, nome), "utf8")
        )
      );

    expect(
      infratores,
      "Estes arquivos da página pública importam a grade do álbum:\n" +
        infratores.map(n => `  - components/evento/${n}`).join("\n") +
        "\n\nUm tile pequeno é uma promessa de que a foto abre, e o lightbox foi " +
        "cortado. As duas decisões se sustentam uma na outra."
    ).toEqual([]);
  });
});
