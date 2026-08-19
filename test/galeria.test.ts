import { afterEach, describe, expect, it, vi } from "vitest";

import type { Executor } from "@/lib/db";
import {
  conferirArquivo,
  conferirLadoMenor,
  conferirMedidas,
  confirmarFoto,
  contarFotosArmazenadas,
  criarIntencaoDeFoto,
  fotosParaOSite,
  LADO_DA_PREVIA,
  LADO_MENOR_MINIMO,
  listarFotosArmazenadas,
  medidasCoerentes,
  TAMANHO_MAXIMO_BYTES,
  type Foto,
} from "@/lib/galeria";

/**
 * A GALERIA DO CASAL (v1.0, V-18) — as réguas que decidem o que vai ao ar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRÊS COISAS SÃO TESTADAS AQUI, e cada uma protege um defeito que só apareceria
 * na foto de um casal específico, meses depois, sem nada no console:
 *
 *   1. **As cinco recusas de medida** (RV-26). `not null` **parece** validação e
 *      não é: ele não impede `0`, não impede um par trocado e não impede um par
 *      que não bate com o arquivo — e os três reservam a caixa ERRADA.
 *   2. **O recorte público.** Intenção não confirmada (RV-25), medida incoerente
 *      e foto sem endereço público não podem chegar à página. E a contagem da
 *      linha invisível sai do que sobrou, nunca de um campo.
 *   3. **Inquilino A não lê o B.** Quarta tabela do produto a carregar
 *      `evento_id`, e a asserção não é "veio o resultado certo" — é **a consulta
 *      carregou o filtro**. Uma consulta sem filtro devolve a resposta certa num
 *      banco com dois registros e vaza num banco com duzentos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const BASE = "https://midia.exemplo";

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------------ *
 * 1. As cinco recusas de medida (RV-26)
 * ------------------------------------------------------------------ */

describe("as medidas são validadas na escrita, e `not null` não basta", () => {
  it("um par honesto passa", () => {
    expect(conferirMedidas(1600, 1067)).toEqual([]);
    expect(conferirMedidas(1200, 1600)).toEqual([]);
    // O quadrado e o extremo aceito (1:6) também passam.
    expect(conferirMedidas(900, 900)).toEqual([]);
    expect(conferirMedidas(1500, 250)).toEqual([]);
  });

  it("**1. ausente**", () => {
    expect(conferirMedidas(undefined, 1000).map(r => r.campo)).toEqual(["largura"]);
    expect(conferirMedidas(1000, null).map(r => r.campo)).toEqual(["altura"]);
    // As duas ausentes dão DUAS recusas, e não uma: a tela mostra o motivo por
    // campo, e uma mensagem só deixaria metade do defeito invisível.
    expect(conferirMedidas(undefined, undefined)).toHaveLength(2);
  });

  it("**2. não inteiro** — inclusive a string que parece número", () => {
    for (const lixo of ["1600", 1600.5, NaN, Infinity, true, {}]) {
      expect(
        conferirMedidas(lixo, 1000).length,
        `${String(lixo)} passou como largura`
      ).toBeGreaterThan(0);
    }
  });

  it("**3. `<= 0`** — o caso que o `not null` do banco deixa passar de verdade", () => {
    // `largura integer not null` aceita `0` sem reclamar, e `0` reserva uma
    // caixa de altura zero: a página não reflui, ela some a foto sem dizer nada.
    expect(conferirMedidas(0, 1000)).toHaveLength(1);
    expect(conferirMedidas(1000, -20)).toHaveLength(1);
  });

  it("**4. acima do lado da prévia** — nenhuma derivada excede 1600", () => {
    expect(conferirMedidas(LADO_DA_PREVIA + 1, 1000)).toHaveLength(1);
    expect(conferirMedidas(1000, 4032)).toHaveLength(1);
    // O número entra na mensagem: quem lê o registro precisa saber o teto.
    expect(conferirMedidas(4000, 1000)[0].mensagem).toContain(String(LADO_DA_PREVIA));
  });

  it("**5. razão fora de 1:6 a 6:1**", () => {
    expect(conferirMedidas(1600, 100)).toHaveLength(1);
    expect(conferirMedidas(100, 1600)).toHaveLength(1);
    // 1:6 exato ainda passa: o corte é FORA da faixa, não na borda dela.
    expect(conferirMedidas(1600, 267)).toEqual([]);
  });

  it("a razão só é conferida com os dois lados válidos", () => {
    // Senão o par `0 × 1600` produziria duas mensagens sobre o mesmo defeito, e
    // a segunda ("quase Infinity vezes mais comprida") confundiria quem lê.
    expect(conferirMedidas(0, 1600)).toHaveLength(1);
  });

  it("nenhuma mensagem usa a palavra “erro” nem “falhou”", () => {
    const todas = [
      ...conferirMedidas(undefined, 0),
      ...conferirMedidas(4000, 100),
      ...conferirMedidas("x", 1.5),
    ].map(r => r.mensagem.toLowerCase());
    for (const mensagem of todas) {
      expect(mensagem, mensagem).not.toMatch(/\berro\b|falhou/);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. O arquivo, antes de decodificar
 * ------------------------------------------------------------------ */

describe("o arquivo é recusado antes de decodificar", () => {
  it("acima de 25 MB, **com o número no corpo**", () => {
    const recusa = conferirArquivo({ size: TAMANHO_MAXIMO_BYTES + 1, type: "image/jpeg" });
    expect(recusa).not.toBeNull();
    // "arquivo grande demais" não diz quanto é demais, e quem tentou não sabe
    // que foto escolher no lugar.
    expect(recusa!.mensagem).toMatch(/25 MB/);
  });

  it("um arquivo de 24 MB passa — o teto não é medo de arquivo grande", () => {
    expect(conferirArquivo({ size: 24 * 1024 * 1024, type: "image/heic" })).toBeNull();
  });

  it("vídeo e PDF são recusados, e a mensagem diz o que vale", () => {
    for (const tipo of ["video/mp4", "application/pdf", "", "image/gif"]) {
      const recusa = conferirArquivo({ size: 1000, type: tipo });
      expect(recusa, `${tipo} passou`).not.toBeNull();
    }
    expect(conferirArquivo({ size: 1000, type: "video/mp4" })!.mensagem).toMatch(/JPEG/);
  });

  it("o lado menor é conferido sobre a FOTO, e não sobre a prévia", () => {
    /**
     * A panorâmica é o caso que decide. 4000×900 tem lado menor de 900 e é
     * legítima; a prévia dela mede 1600×360. Uma conferência feita sobre a
     * prévia a recusaria por um número que o redimensionamento produziu — e é
     * por isso que `gerarDerivadas` devolve também as medidas do original.
     */
    expect(conferirLadoMenor(4000, 900)).toBeNull();
    expect(conferirLadoMenor(1600, LADO_MENOR_MINIMO)).toBeNull();

    const recusa = conferirLadoMenor(640, 480);
    expect(recusa).not.toBeNull();
    expect(recusa!.mensagem).toMatch(/480 px/);
    expect(recusa!.mensagem).toMatch(new RegExp(String(LADO_MENOR_MINIMO)));
  });
});

/* ------------------------------------------------------------------ *
 * 3. O recorte público
 * ------------------------------------------------------------------ */

function foto(parcial: Partial<Foto> & { id: string }): Foto {
  return {
    legenda: null,
    largura: 1600,
    altura: 1067,
    ordem: 1,
    armazenada: true,
    ...parcial,
  };
}

describe("o que chega à página, e o que fica de fora", () => {
  it("uma foto confirmada vira endereço, medidas e legenda — e nada mais", () => {
    vi.stubEnv("R2_PUBLIC_BASE", BASE);
    const saida = fotosParaOSite(A, [foto({ id: "aaa", legenda: "A gente." })]);
    expect(saida).toEqual([
      {
        url: `${BASE}/pub/e/${A}/g/aaa/p.jpg`,
        largura: 1600,
        altura: 1067,
        legenda: "A gente.",
      },
    ]);
  });

  it("**a PRÉVIA de 1600, nunca a miniatura de 400**", () => {
    // Sem lightbox, a prévia É a foto. A miniatura é do editor no painel, e no
    // site ela apareceria borrada numa coluna de 592.
    vi.stubEnv("R2_PUBLIC_BASE", BASE);
    expect(fotosParaOSite(A, [foto({ id: "aaa" })])[0].url).toMatch(/\/p\.jpg$/);
  });

  it("**intenção não confirmada não renderiza** (RV-25)", () => {
    vi.stubEnv("R2_PUBLIC_BASE", BASE);
    const saida = fotosParaOSite(A, [
      foto({ id: "aaa" }),
      foto({ id: "bbb", armazenada: false }),
    ]);
    expect(saida.map(f => f.url)).toEqual([`${BASE}/pub/e/${A}/g/aaa/p.jpg`]);
  });

  it("**medida incoerente não renderiza** — caixa não reservada é pior que foto a menos", () => {
    vi.stubEnv("R2_PUBLIC_BASE", BASE);
    const saida = fotosParaOSite(A, [
      foto({ id: "zero", largura: 0 }),
      foto({ id: "gigante", altura: 4032 }),
      foto({ id: "fita", largura: 1600, altura: 40 }),
      foto({ id: "boa" }),
    ]);
    expect(saida).toHaveLength(1);
    expect(saida[0].url).toContain("/g/boa/");
  });

  it("**sem `R2_PUBLIC_BASE`, nenhuma foto** — e nenhuma imagem quebrada", () => {
    // Um `src` vazio é uma imagem quebrada no site do casamento, que é pior que
    // uma foto a menos pelo mesmo motivo da caixa não reservada.
    vi.stubEnv("R2_PUBLIC_BASE", "");
    expect(fotosParaOSite(A, [foto({ id: "aaa" })])).toEqual([]);
  });

  it("a ordem da lista é preservada, e é a ordem do casal", () => {
    vi.stubEnv("R2_PUBLIC_BASE", BASE);
    const saida = fotosParaOSite(A, [
      foto({ id: "um", ordem: 1 }),
      foto({ id: "dois", ordem: 2 }),
      foto({ id: "tres", ordem: 3 }),
    ]);
    expect(saida.map(f => f.url.split("/g/")[1].split("/")[0])).toEqual([
      "um",
      "dois",
      "tres",
    ]);
  });

  it("**a contagem da linha invisível é o que sobrou do recorte**", () => {
    /**
     * `gtm.md` §5.17: *"o número vem das fotos que realmente foram
     * renderizadas, nunca de um campo configurado"*. Uma contagem que não bate
     * com a tela é o defeito que só quem não vê a tela descobre — e ela não tem
     * como conferir.
     */
    vi.stubEnv("R2_PUBLIC_BASE", BASE);
    const guardadas = [
      foto({ id: "a1" }),
      foto({ id: "a2", armazenada: false }),
      foto({ id: "a3", largura: 0 }),
    ];
    expect(guardadas).toHaveLength(3);
    expect(fotosParaOSite(A, guardadas)).toHaveLength(1);
  });

  it("`medidasCoerentes` é o mesmo predicado de `conferirMedidas`", () => {
    // Duas réguas para a mesma coisa divergiriam: a escrita aceitaria o que a
    // leitura esconde, e ninguém entenderia por que a foto sumiu.
    for (const [l, a] of [
      [1600, 1067],
      [0, 100],
      [1600, 40],
      [4000, 1000],
    ] as const) {
      expect(medidasCoerentes(l, a)).toBe(conferirMedidas(l, a).length === 0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 4. Inquilino A não lê o B
 * ------------------------------------------------------------------ */

type Linha = Record<string, unknown>;

function bancoFalso(linhas: Linha[]) {
  const registro: Array<{ texto: string; valores: unknown[] }> = [];
  const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
    registro.push({ texto, valores });

    if (/^insert into evento_fotos/.test(texto)) {
      return [
        {
          id: "nova",
          legenda: null,
          largura: valores[1],
          altura: valores[2],
          ordem: 1,
          armazenada_em: null,
        },
      ];
    }
    if (/^update evento_fotos/.test(texto)) {
      // A ordem dos parâmetros é a do SQL: largura, altura, bytes, id, evento_id.
      const fotoId = valores[3];
      const eventoId = valores[4];
      const achada = linhas.find(l => l.id === fotoId && l.evento_id === eventoId);
      return achada ? [{ ...achada, armazenada_em: new Date() }] : [];
    }
    if (/count\(\*\)/.test(texto)) {
      const [eventoId] = valores;
      return [
        {
          quantas: linhas.filter(l => l.evento_id === eventoId && l.armazenada_em).length,
        },
      ];
    }
    if (/from evento_fotos/.test(texto)) {
      const [eventoId] = valores;
      return linhas.filter(l => l.evento_id === eventoId && l.armazenada_em);
    }
    throw new Error(`Consulta não prevista: ${texto}`);
  }) as unknown as Executor;
  return { exec, registro };
}

const LINHAS: Linha[] = [
  {
    id: "f-de-a",
    evento_id: A,
    legenda: "Do casamento A.",
    largura: 1600,
    altura: 1067,
    ordem: 1,
    armazenada_em: new Date(),
  },
  {
    id: "f-de-b",
    evento_id: B,
    legenda: "Do casamento B.",
    largura: 1600,
    altura: 1067,
    ordem: 1,
    armazenada_em: new Date(),
  },
];

describe("as fotos de um casamento não vazam para o outro", () => {
  it("a leitura devolve só as do evento pedido", async () => {
    const { exec } = bancoFalso(LINHAS);
    const daA = await listarFotosArmazenadas(A, exec);
    expect(daA.map(f => f.id)).toEqual(["f-de-a"]);
  });

  it("**a consulta de leitura carrega o `evento_id`**", async () => {
    const { exec, registro } = bancoFalso(LINHAS);
    await listarFotosArmazenadas(A, exec);
    expect(registro[0].texto).toMatch(/where evento_id = \?/);
    expect(registro[0].valores[0]).toBe(A);
  });

  it("a contagem também filtra", async () => {
    const { exec, registro } = bancoFalso(LINHAS);
    expect(await contarFotosArmazenadas(B, exec)).toBe(1);
    expect(registro[0].valores[0]).toBe(B);
  });

  it("a intenção nasce com o `evento_id` do servidor", async () => {
    const { exec, registro } = bancoFalso([]);
    await criarIntencaoDeFoto(B, { largura: 1600, altura: 1067, bytesPrevia: 1234 }, exec);
    expect(registro[0].valores[0]).toBe(B);
    // A ordem é calculada NA MESMA instrução (`max + 1`): ler o máximo numa
    // consulta e inserir noutra daria duas fotos com a mesma ordem quando o
    // casal mandasse duas ao mesmo tempo.
    expect(registro[0].texto).toMatch(/coalesce\(max\(ordem\), 0\) \+ 1/);
    expect(registro).toHaveLength(1);
  });

  it("**confirmar a foto de outro casamento devolve nulo, e a rota traduz em 404**", async () => {
    const { exec } = bancoFalso(LINHAS);
    const alheia = await confirmarFoto(
      A,
      "f-de-b",
      { largura: 1600, altura: 1067, bytesPrevia: null },
      exec
    );
    // Nunca 403: 403 confirmaria que a foto do outro casamento existe.
    expect(alheia).toBeNull();

    const propria = await confirmarFoto(
      A,
      "f-de-a",
      { largura: 1600, altura: 1067, bytesPrevia: null },
      exec
    );
    expect(propria?.armazenada).toBe(true);
  });

  it("a confirmação **mantém o primeiro carimbo** — repetir não é erro", async () => {
    const { exec, registro } = bancoFalso(LINHAS);
    await confirmarFoto(A, "f-de-a", { largura: 1600, altura: 1067, bytesPrevia: 1 }, exec);
    // É o que faz o botão de tentar de novo ser seguro: a fila do produto
    // reconfirma quando não tem certeza de que a primeira chegou.
    expect(registro[0].texto).toMatch(/armazenada_em = coalesce\(armazenada_em, now\(\)\)/);
  });
});
