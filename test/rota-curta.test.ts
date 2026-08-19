import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { conferirEnderecoImpresso, enderecoParaLer, enderecoParaQr } from "@/lib/enderecos";
import { ehSlug } from "@/lib/ids";
import { ARQUIVOS_DA_RAIZ, ehRotaCurta, SEGMENTOS_RESERVADOS } from "@/lib/rotas";

/**
 * A ROTA CURTA, E O RISCO DE VERDADE DELA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `casa-nos.app/<slug>` responde 307 para `/e/<slug>/album` (decisão do `po`,
 * 19/08/2026). O endereço vai impresso no cartão de mesa, e ele é a **única
 * retentativa que o passo 1 do fluxo tem** quando o QR não lê.
 *
 * **O RISCO NÃO É A ROTA: É A PRÓXIMA PASTA CRIADA EM `app/`.** No dia em que
 * alguém criar `app/precos/`, o casamento com slug `precos` deixa de existir —
 * em silêncio, e depois de 40 cartões de mesa já impressos. Não há erro, não há
 * log, e a foto simplesmente não é enviada por ninguém.
 *
 * Este teste lê o disco. É ele que segura a decisão; a lista sozinha não segura
 * nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const APP = path.join(RAIZ, "app");

/**
 * Os segmentos de primeiro nível que o roteador do Next expõe na raiz.
 *
 * Pastas entre parênteses são **grupos de rota**: elas não aparecem na URL, e
 * por isso não disputam o espaço de nomes. Arquivos soltos (`layout.tsx`,
 * `page.tsx`, `globals.css`) também não.
 */
function segmentosDeApp(): string[] {
  return fs
    .readdirSync(APP, { withFileTypes: true })
    .filter(entrada => entrada.isDirectory())
    .map(entrada => entrada.name)
    .filter(nome => !nome.startsWith("(") && !nome.startsWith("_") && !nome.startsWith("@"));
}

describe("a lista de reservados cobre o que existe em app/", () => {
  it("existe pasta para conferir — se não, o varredor quebrou", () => {
    expect(segmentosDeApp().length).toBeGreaterThan(0);
  });

  it("**toda pasta de primeiro nível de app/ está reservada**", () => {
    /**
     * Este é o teste. Uma pasta nova em `app/` que ninguém reservou rouba o
     * endereço de um casamento — e o dono do casamento descobre isso quando os
     * convidados apontam a câmera.
     */
    const reservados = new Set<string>(SEGMENTOS_RESERVADOS);
    const orfas = segmentosDeApp().filter(
      nome => !reservados.has(nome) && !nome.startsWith("[")
    );

    expect(
      orfas,
      "Estas pastas de app/ não estão em SEGMENTOS_RESERVADOS (lib/rotas.ts):\n" +
        orfas.map(n => `  - app/${n}`).join("\n") +
        "\n\nA raiz do site é o espaço de nomes dos casamentos desde que a rota\n" +
        "curta existe. Uma pasta não reservada rouba, em silêncio, o endereço de\n" +
        "um casamento que já pode estar impresso em 40 cartões de mesa."
    ).toEqual([]);
  });

  it("a lista de reservados não guarda pasta que já não existe", () => {
    // Reservado sobrando não é perigoso, é confuso: ele bloqueia um slug legítimo
    // por um motivo que ninguém consegue mais reconstruir.
    const existentes = new Set(segmentosDeApp());
    const sobrando = SEGMENTOS_RESERVADOS.filter(nome => !existentes.has(nome));
    expect(sobrando).toEqual([]);
  });
});

describe("o que é rota curta e o que não é", () => {
  it("um slug de casamento é rota curta", () => {
    expect(ehRotaCurta("ana-e-max")).toBe(true);
    expect(ehRotaCurta("casamento-de-teste")).toBe(true);
  });

  it("nenhum segmento reservado é rota curta", () => {
    for (const reservado of SEGMENTOS_RESERVADOS) {
      expect(ehRotaCurta(reservado), `${reservado} virou rota curta`).toBe(false);
    }
  });

  it("os arquivos da raiz não são rota curta", () => {
    // Um `favicon.ico` redirecionado para o álbum de um casamento inexistente é
    // um 404 estranho que ninguém entende.
    for (const arquivo of ARQUIVOS_DA_RAIZ) {
      expect(ehRotaCurta(arquivo), `${arquivo} virou rota curta`).toBe(false);
    }
  });

  it("o interno do Next fica de fora", () => {
    expect(ehRotaCurta("_next")).toBe(false);
    expect(ehRotaCurta(".well-known")).toBe(false);
    expect(ehRotaCurta("")).toBe(false);
  });
});

describe("o proxy redireciona preservando o `?o=`", () => {
  it("o redirecionamento é 307 e não 301/308", () => {
    /**
     * Permanente é cacheado pelo navegador **para sempre**, inclusive na aba de
     * quem leu o QR errado. O dia em que um slug for corrigido, o aparelho de
     * quem já visitou continuaria indo para o antigo, e não há como limpar isso
     * remotamente.
     */
    const proxy = fs.readFileSync(path.join(RAIZ, "proxy.ts"), "utf8");
    expect(proxy).toMatch(/NextResponse\.redirect\([^)]*307\)/);
    // A consulta viaja inteira: é o `?o=` que diz qual peça impressa trouxe o
    // convidado, e sem ele toda leitura de QR vira `direto`.
    expect(proxy).toMatch(/destino\.search = pedido\.nextUrl\.search/);
    expect(proxy).toMatch(/ehRotaCurta/);
    // E o formato é conferido antes: o que não parece slug não redireciona.
    expect(proxy).toMatch(/ehSlug\(partes\[0\]\) && ehRotaCurta\(partes\[0\]\)/);
  });

  it("o `matcher` inclui a raiz de um segmento", () => {
    const proxy = fs.readFileSync(path.join(RAIZ, "proxy.ts"), "utf8");
    expect(proxy).toMatch(/"\/:slug"/);
  });
});

describe("o endereço impresso", () => {
  const ORIGEM = "https://casa-nos.app";

  it("o QR carrega a rota CURTA, com a origem por superfície", () => {
    expect(enderecoParaQr(ORIGEM, "ana-e-max", "mesa")).toBe(
      "https://casa-nos.app/ana-e-max?o=mesa"
    );
    // `direto` não vai na URL: ele é o padrão de quem chegou sem material
    // impresso, e escrevê-lo transformaria "veio de um cartaz sem parâmetro" em
    // "veio sem cartaz nenhum".
    expect(enderecoParaQr(ORIGEM, "ana-e-max", "direto")).toBe(
      "https://casa-nos.app/ana-e-max"
    );
    // Valor fora da lista vira `direto`: o parâmetro é público, e texto livre
    // virando dimensão do GA4 é dado envenenado que não se limpa.
    expect(enderecoParaQr(ORIGEM, "ana-e-max", "sei-la")).toBe(
      "https://casa-nos.app/ana-e-max"
    );
  });

  it("o endereço escrito é o mesmo, sem esquema e sem `?o=`", () => {
    // A única diferença permitida entre o que a câmera abre e o que está escrito
    // é o `?o=`, que é medição e não destino. Quem digitar o que está no cartão
    // precisa cair exatamente onde a câmera cairia.
    expect(enderecoParaLer(ORIGEM, "ana-e-max")).toBe("casa-nos.app/ana-e-max");
  });

  it("a conferência dos 24 caracteres **avisa e não recusa**", () => {
    /**
     * Recusar o slug longo impediria o casal de se chamar como ele quer no
     * próprio endereço; encurtá-lo sozinho produziria um endereço que ninguém
     * escolheu e que o casal descobre impresso em 40 cartões. A tela mostra a
     * conta e oferece encurtar. Degradar e avisar, nunca recusar.
     */
    const curto = conferirEnderecoImpresso(ORIGEM, "ana-e-max");
    expect(curto.cabe).toBe(true);
    expect(curto.caracteres).toBe("casa-nos.app/ana-e-max".length);
    // 13 do domínio + a barra → sobram 11 para o nome.
    expect(curto.sobramParaOSlug).toBe(11);

    const longo = conferirEnderecoImpresso(ORIGEM, "ana-flavia-e-maxwel-2027");
    expect(longo.cabe).toBe(false);
    // E mesmo assim ele devolve o endereço, inteiro: quem quiser slug maior
    // imprime o endereço maior.
    expect(longo.endereco).toContain("ana-flavia-e-maxwel-2027");
  });

  it("todo slug que o produto aceita continua sendo slug depois do redirecionamento", () => {
    for (const slug of ["ana-e-max", "casamento-de-teste", "ab", "a1-b2"]) {
      expect(ehSlug(slug)).toBe(true);
      expect(ehRotaCurta(slug)).toBe(true);
    }
  });
});
