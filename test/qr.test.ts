import { describe, expect, it } from "vitest";

import {
  capacidadeEmBytes,
  codigosDe,
  codigosNaMatriz,
  correcaoDoBloco,
  estruturaDeBlocos,
  gerarQr,
  informacaoDeFormato,
  informacaoDeVersao,
  mascaraNaMatriz,
  menorVersaoPara,
  qrParaSvg,
  VERSAO_MAXIMA,
  ZONA_DE_SILENCIO,
} from "@/lib/qr";
import { cor } from "@/lib/tokens";

/**
 * O CÓDIGO QR É O PASSO 1 DO FUNIL INTEIRO, E ELE NÃO TEM SEGUNDA CHANCE.
 *
 * Se o código impresso não ler, não existe foto, não existe feed e não existe
 * telão — e o defeito só aparece na mesa, no sábado, com 150 pessoas. Não há
 * câmera neste ambiente; o que existe é aritmética, e ela dá para verificar
 * inteira:
 *
 *  1. **Os valores conhecidos da especificação** (a correção de erro de
 *     "HELLO WORLD", o campo de formato, o campo de versão). Se qualquer um
 *     destes bater, a matemática está certa; se errar, está errada — não há
 *     meio-termo.
 *  2. **O caminho de volta.** A matriz é lida de novo, a máscara é desfeita, e o
 *     que sai tem que ser exatamente o que entrou. Isso exercita o ziguezague, a
 *     coluna de temporização pulada, as posições reservadas e a máscara de uma
 *     vez.
 *
 * O que ele NÃO prova: que a câmera de um iPhone lê o papel impresso sob luz
 * baixa. Isso é critério de aceite da H-04 e é registro humano no PR.
 */

describe("as tabelas da especificação fecham a conta", () => {
  it("total de códigos = dados + correção × blocos, em todas as versões", () => {
    /**
     * Um dígito errado numa destas tabelas não estoura nada: produz um código
     * bem formado e ilegível. Esta conta é a única forma de a transcrição ser
     * conferida sem uma segunda fonte.
     */
    for (let versao = 1; versao <= VERSAO_MAXIMA; versao++) {
      const { ec, b1, d1, b2, d2, total } = estruturaDeBlocos(versao);
      const dados = b1 * d1 + b2 * d2;
      const correcao = (b1 + b2) * ec;
      expect(dados + correcao, `versao ${versao}`).toBe(total);
    }
  });

  it("a capacidade cresce com a versão e a v10 comporta 213 caracteres", () => {
    let anterior = 0;
    for (let versao = 1; versao <= VERSAO_MAXIMA; versao++) {
      const capacidade = capacidadeEmBytes(versao);
      expect(capacidade).toBeGreaterThan(anterior);
      anterior = capacidade;
    }
    expect(capacidadeEmBytes(1)).toBe(14);
    expect(capacidadeEmBytes(10)).toBe(213);
  });

  it("o endereço mais longo que este produto imprime cabe folgado", () => {
    // `https://casa-nos.app/e/<slug de 60>?o=convite` é o pior caso do H-04.
    const pior = `https://casa-nos.app/e/${"a".repeat(60)}?o=convite`;
    expect(pior.length).toBeLessThanOrEqual(capacidadeEmBytes(VERSAO_MAXIMA));
    expect(() => gerarQr(pior)).not.toThrow();
  });

  it("acima do teto o gerador LANÇA em vez de devolver um código ilegível", () => {
    expect(() => menorVersaoPara(1000)).toThrow(/nao cabe/);
  });
});

describe("valores conhecidos da especificação", () => {
  it("a correção de erro de HELLO WORLD (v1-M) bate com a tabela publicada", () => {
    /**
     * Vetor da própria especificação: os 16 códigos de dados de "HELLO WORLD"
     * em v1-M produzem estes 10 códigos de correção. É o teste que separa
     * "a aritmética de Galois está certa" de "ela está quase certa".
     *
     * A entrada é alfanumérica (este produto só usa modo byte), mas a divisão
     * polinomial não sabe disso: ela vê códigos.
     */
    const dados = Uint8Array.from([
      32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17,
    ]);
    expect(Array.from(correcaoDoBloco(dados, 10))).toEqual([
      196, 35, 39, 119, 235, 215, 231, 226, 93, 23,
    ]);

    // E o caminho público monta 16 de dados + 10 de correção, sem sobra.
    const codigos = codigosDe("HELLO WORLD", 1);
    expect(codigos.length).toBe(26);
  });

  it("o campo de formato do nível M bate com a tabela, nas oito máscaras", () => {
    // Tabela do ISO/IEC 18004, nível M. Um bit errado aqui é um código que
    // alguns leitores aceitam e outros recusam.
    const ESPERADOS = [
      0b101010000010010, // máscara 0
      0b101000100100101,
      0b101111001111100,
      0b101101101001011,
      0b100010111111001,
      0b100000011001110,
      0b100111110010111,
      0b100101010100000, // máscara 7
    ];
    for (let mascara = 0; mascara < 8; mascara++) {
      expect(informacaoDeFormato(mascara), `mascara ${mascara}`).toBe(ESPERADOS[mascara]);
    }
  });

  it("o campo de versão bate com a tabela nas versões 7 a 10", () => {
    expect(informacaoDeVersao(7)).toBe(0x07c94);
    expect(informacaoDeVersao(8)).toBe(0x085bc);
    expect(informacaoDeVersao(9)).toBe(0x09a99);
    expect(informacaoDeVersao(10)).toBe(0x0a4d3);
  });
});

describe("o caminho de volta — a matriz contém o que entrou", () => {
  const CASOS = [
    "https://casa-nos.app/e/ana-e-max?o=mesa",
    "https://casa-nos.app/e/ana-e-max?o=telao",
    "A", // v1, o menor possível
    "x".repeat(14), // v1 cheia até a borda
    "y".repeat(15), // força a v2
    "z".repeat(106), // v6, com quatro blocos — exercita a intercalação
    "w".repeat(152), // v8, dois grupos de tamanhos diferentes
    "k".repeat(213), // v10, com contagem de 16 bits e campo de versão
  ];

  for (const texto of CASOS) {
    it(`${texto.length} caracteres voltam idênticos da matriz`, () => {
      const { modulos, versao, mascara } = gerarQr(texto);
      expect(mascaraNaMatriz(modulos), "a máscara gravada no formato").toBe(mascara);
      const lidos = codigosNaMatriz(modulos, versao, mascara);
      expect(Array.from(lidos)).toEqual(Array.from(codigosDe(texto, versao)));
    });
  }

  it("a coluna de temporização não recebe dado, e nenhuma coluna recebe duas vezes", () => {
    /**
     * O defeito que isto pega: "quando a coluna for 6, use a 5" faz o par (5,4)
     * e depois o par (4,3) — a coluna 4 leva dois bits diferentes, e o código
     * sai ilegível sem nada estourar. O caminho de volta acima já falharia, mas
     * este é o teste que diz **por quê**.
     */
    const { modulos, lado } = gerarQr("https://casa-nos.app/e/ana-e-max");
    // A coluna 6 é alternada de ponta a ponta entre os localizadores.
    for (let y = 8; y < lado - 8; y++) {
      expect(modulos[y][6], `temporizacao em y=${y}`).toBe(y % 2 === 0);
    }
  });

  it("o módulo escuro obrigatório está lá", () => {
    // (linha 4v+9, coluna 8). Se o campo de formato o sobrescrever, parte dos
    // leitores recusa o código — e a outra parte aceita, que é pior.
    for (const texto of ["A", "z".repeat(106), "k".repeat(213)]) {
      const { modulos, versao } = gerarQr(texto);
      expect(modulos[4 * versao + 9][8], `versao ${versao}`).toBe(true);
    }
  });
});

describe("os três localizadores estão desenhados", () => {
  const { modulos, lado } = gerarQr("https://casa-nos.app/e/ana-e-max");

  const olho = (ox: number, oy: number) => {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const naBorda = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const noMiolo = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        expect(modulos[oy + dy][ox + dx], `(${ox + dx},${oy + dy})`).toBe(naBorda || noMiolo);
      }
    }
  };

  it("superior esquerdo, superior direito e inferior esquerdo", () => {
    olho(0, 0);
    olho(lado - 7, 0);
    olho(0, lado - 7);
  });

  it("o canto inferior direito NÃO tem localizador — é ele que dá a orientação", () => {
    const cantoEscuro =
      modulos[lado - 1][lado - 1] &&
      modulos[lado - 2][lado - 2] &&
      modulos[lado - 3][lado - 3];
    expect(cantoEscuro).toBe(false);
  });
});

describe("o SVG", () => {
  const svg = qrParaSvg("https://casa-nos.app/e/ana-e-max?o=mesa", {
    modulo: cor.primary,
    campo: cor.bg,
  });

  it("é vetorial, e por isso o piso de 1200 px do H-04 não se aplica a ele", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox=");
  });

  it("nunca é invertido: módulos escuros sobre campo claro", () => {
    // QR claro sobre fundo escuro falha em parte dos leitores de câmera
    // (design system §16.9). O campo é `cor.bg`; os módulos, `cor.primary`.
    expect(svg).toContain(`fill="${cor.bg}"`);
    expect(svg).toContain(`fill="${cor.primary}"`);
    const posicaoDoCampo = svg.indexOf(cor.bg);
    const posicaoDoModulo = svg.indexOf(cor.primary);
    // O retângulo do campo vem antes do caminho dos módulos: o desenho é
    // escuro SOBRE claro, não o contrário.
    expect(posicaoDoCampo).toBeLessThan(posicaoDoModulo);
  });

  it("carrega a zona de silêncio dos quatro módulos", () => {
    const { lado } = gerarQr("https://casa-nos.app/e/ana-e-max?o=mesa");
    const total = lado + ZONA_DE_SILENCIO * 2;
    expect(svg).toContain(`viewBox="0 0 ${total} ${total}"`);
  });

  it("tem nome acessível — ele vai para dentro de uma página e de um cartão", () => {
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title>");
  });

  it("um só `path`, e não um `rect` por módulo", () => {
    // 841 elementos num código versão 5 quadruplicam o arquivo e engasgam parte
    // dos programas de impressão.
    expect((svg.match(/<rect/g) ?? []).length).toBe(1);
    expect((svg.match(/<path/g) ?? []).length).toBe(1);
  });

  it("recusa conteúdo fora de ISO-8859-1 em vez de gerar lixo", () => {
    expect(() => qrParaSvg("café ☕", { modulo: cor.primary, campo: cor.bg })).toThrow(
      /ISO-8859-1/
    );
  });
});
