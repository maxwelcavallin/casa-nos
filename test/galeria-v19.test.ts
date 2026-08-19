import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Executor } from "@/lib/db";
import {
  buscarFoto,
  conferirLegenda,
  conferirOrdem,
  definirLegenda,
  marcarFotoExcluida,
  reordenarFotos,
  TETO_DA_LEGENDA,
} from "@/lib/galeria";
import { apagarDerivadasDaFoto, type ClienteDeObjetos } from "@/lib/r2-objetos";

/**
 * A GALERIA VIRA GALERIA (v1.0, V-19) — legenda, ordem, teto e exclusão.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **POR QUE A EXCLUSÃO É O CORAÇÃO DESTE ARQUIVO, E NÃO A LEGENDA.**
 *
 * Legenda e ordem escrevem no banco, e o banco é onde este produto sabe voltar
 * atrás. A exclusão **apaga byte**: ela é a única operação da v1.0 que destrói
 * uma coisa que não tem cópia dentro do produto. E ela é uma coreografia entre
 * dois sistemas sem transação entre eles — um balde e um Postgres —, o que
 * significa que a ORDEM dos dois passos é o requisito inteiro:
 *
 *   1. o objeto sai de `pub/`;
 *   2. só então a linha recebe `excluido_em`.
 *
 * Invertida, ela produz o defeito que a confirmação de tirar o site do ar
 * promete que não existe: uma linha que diz "apagada" sobre um arquivo que
 * continua respondendo para quem tem o endereço (RV-21, RV-22).
 *
 * **E ELA NUNCA RODOU EM PRODUÇÃO.** As cinco variáveis do R2 não estão
 * configuradas: o caminho exercitado de verdade foi o de degradação (503 na
 * intenção, nenhuma foto perdida), e nenhuma foto chegou a subir. Enquanto isso
 * for verdade, **este arquivo é a única coisa que separa a promessa da
 * esperança** — e é por isso que ele testa o cliente falso recusando, o cliente
 * falso devolvendo 404, e o cliente ausente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const FOTO_1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const FOTO_2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const BASE = "https://midia.exemplo";

/* ------------------------------------------------------------------ *
 * 1. A legenda — 80 caracteres, texto puro, conferidos no servidor
 * ------------------------------------------------------------------ */

describe("a legenda é conferida no servidor, e o `CHECK` é a segunda tranca", () => {
  it("uma legenda comum passa, e volta como foi escrita", () => {
    const { legenda, recusa } = conferirLegenda("O dia em que a gente se conheceu.");
    expect(recusa).toBeNull();
    expect(legenda).toBe("O dia em que a gente se conheceu.");
  });

  it("**exatamente 80 passa; 81 é recusado com os dois números**", () => {
    const oitenta = "a".repeat(TETO_DA_LEGENDA);
    expect(conferirLegenda(oitenta).recusa).toBeNull();

    const recusa = conferirLegenda("a".repeat(TETO_DA_LEGENDA + 1)).recusa;
    expect(recusa).not.toBeNull();
    // O NÚMERO NO CORPO: quem escreveu 81 precisa saber quantos cortar. Uma
    // mensagem sem número é "legenda longa demais", que não vira ação nenhuma.
    expect(recusa!.mensagem).toContain(String(TETO_DA_LEGENDA));
    expect(recusa!.mensagem).toContain("81");
  });

  it("**`null`, `undefined` e vazio são a mesma coisa, e viram `null`**", () => {
    /**
     * Uma legenda vazia não é uma legenda curta: ela não desenha `<figcaption>`
     * nenhum na página. Gravar `""` produziria uma linha que o `CHECK` aceita e
     * que o site renderizaria como caixa vazia sob a foto — o item 8 da lista de
     * proibições de `design-system.md` §20.6.
     */
    for (const bruto of [null, undefined, "", "   ", "\n\n"]) {
      const { legenda, recusa } = conferirLegenda(bruto);
      expect(recusa, `${JSON.stringify(bruto)} virou recusa`).toBeNull();
      expect(legenda, `${JSON.stringify(bruto)} não virou null`).toBeNull();
    }
  });

  it("**o espaço em branco é normalizado ANTES de medir**", () => {
    /**
     * HTML colapsa quebra de linha em espaço, e a legenda mora num
     * `<figcaption>`. Um Enter digitado no campo não faria nada na tela e ainda
     * gastaria um dos 80 caracteres: o casal contaria 80 e o site mostraria 79,
     * sem explicação em lugar nenhum.
     */
    expect(conferirLegenda("  Nós   dois\n  na  praia  ").legenda).toBe("Nós dois na praia");

    // E a medição é DEPOIS: 80 caracteres com espaço duplo cabem, porque o que
    // vai para a página tem menos que isso.
    const comEspacoDobrado = "ab ".repeat(20) + " ".repeat(20);
    expect(conferirLegenda(comEspacoDobrado).recusa).toBeNull();
  });

  it("o que não é texto é recusado, e não convertido", () => {
    for (const lixo of [42, true, {}, ["oi"]]) {
      expect(
        conferirLegenda(lixo).recusa,
        `${JSON.stringify(lixo)} atravessou como legenda`
      ).not.toBeNull();
    }
  });

  it("nenhuma mensagem usa a palavra “erro” nem “falhou”", () => {
    const mensagens = [
      conferirLegenda("a".repeat(200)).recusa!.mensagem,
      conferirLegenda(42).recusa!.mensagem,
    ];
    for (const mensagem of mensagens) {
      expect(mensagem.toLowerCase()).not.toContain("erro");
      expect(mensagem.toLowerCase()).not.toContain("falh");
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. A ordem — a lista inteira, e a recusa é inteira
 * ------------------------------------------------------------------ */

describe("a ordem chega como lista inteira, e é conferida como lista (RV-05)", () => {
  it("uma lista honesta passa", () => {
    const { ordens, recusas } = conferirOrdem([
      { id: FOTO_1, ordem: 1 },
      { id: FOTO_2, ordem: 2 },
    ]);
    expect(recusas).toEqual([]);
    expect(ordens).toEqual([
      { id: FOTO_1, ordem: 1 },
      { id: FOTO_2, ordem: 2 },
    ]);
  });

  it("o que não é lista, e a lista vazia, são recusados", () => {
    for (const bruto of [undefined, null, {}, "fotos", []]) {
      expect(
        conferirOrdem(bruto).recusas.length,
        `${JSON.stringify(bruto)} passou como lista`
      ).toBeGreaterThan(0);
    }
  });

  it("**id repetido é recusa, e é a conferência que mais importa aqui**", () => {
    /**
     * O `unnest` não reclama de duplicata: ele aplicaria as duas linhas na ordem
     * em que o Postgres resolvesse, e a foto acabaria numa das duas posições sem
     * ninguém saber qual. Uma lista que quem a montou não sabe descrever é uma
     * lista para recusar inteira.
     */
    const { ordens, recusas } = conferirOrdem([
      { id: FOTO_1, ordem: 1 },
      { id: FOTO_1, ordem: 2 },
    ]);
    expect(recusas.length).toBeGreaterThan(0);
    expect(ordens).toEqual([]);
  });

  it("uuid torto e ordem não inteira são recusados", () => {
    expect(conferirOrdem([{ id: "nao-e-uuid", ordem: 1 }]).recusas.length).toBeGreaterThan(0);
    expect(conferirOrdem([{ id: FOTO_1, ordem: 1.5 }]).recusas.length).toBeGreaterThan(0);
    expect(conferirOrdem([{ id: FOTO_1, ordem: "1" }]).recusas.length).toBeGreaterThan(0);
    expect(conferirOrdem([{ id: FOTO_1 }]).recusas.length).toBeGreaterThan(0);
  });

  it("**recusa parcial não existe: uma linha ruim invalida a lista**", () => {
    /**
     * Gravar as boas e ignorar a ruim deixaria a ordem pela metade — que é
     * exatamente o que a decisão de lote existe para evitar. É a mesma regra que
     * `PATCH /site/secoes` já segue.
     */
    const { ordens, recusas } = conferirOrdem([
      { id: FOTO_1, ordem: 1 },
      { id: "lixo", ordem: 2 },
    ]);
    expect(recusas.length).toBe(1);
    expect(ordens).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 3. A escrita, com banco falso — e o `evento_id` em toda instrução
 * ------------------------------------------------------------------ */

type Linha = Record<string, unknown>;

function bancoFalso(linhas: Linha[]) {
  const registro: Array<{ texto: string; valores: unknown[] }> = [];

  const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
    registro.push({ texto, valores });

    // `update ... set legenda`
    if (/^update evento_fotos set legenda/.test(texto)) {
      const [legenda, fotoId, eventoId] = valores;
      const achada = linhas.find(l => l.id === fotoId && l.evento_id === eventoId);
      if (!achada) return [];
      achada.legenda = legenda;
      return [{ ...achada }];
    }

    // `update ... set excluido_em`
    if (/^update evento_fotos set excluido_em/.test(texto)) {
      const [fotoId, eventoId] = valores;
      const achada = linhas.find(
        l => l.id === fotoId && l.evento_id === eventoId && !l.excluido_em
      );
      if (!achada) return [];
      achada.excluido_em = new Date();
      return [{ id: achada.id }];
    }

    // `update evento_fotos as f ... from unnest(...)`
    if (/^update evento_fotos as f/.test(texto)) {
      const [ids, posicoes, eventoId] = valores as [string[], number[], string];
      ids.forEach((id, i) => {
        const achada = linhas.find(l => l.id === id && l.evento_id === eventoId);
        if (achada) achada.ordem = posicoes[i];
      });
      return [];
    }

    if (/^select id, legenda/.test(texto)) {
      const [fotoId, eventoId] = valores;
      const achada = linhas.find(l => l.id === fotoId && l.evento_id === eventoId);
      return achada ? [{ ...achada }] : [];
    }

    throw new Error(`Consulta não prevista: ${texto}`);
  }) as unknown as Executor;

  return { exec, registro };
}

function linhasDeTeste(): Linha[] {
  return [
    {
      id: FOTO_1,
      evento_id: A,
      legenda: null,
      largura: 1600,
      altura: 1067,
      ordem: 1,
      armazenada_em: new Date(),
      excluido_em: null,
    },
    {
      id: FOTO_2,
      evento_id: A,
      legenda: null,
      largura: 1200,
      altura: 1600,
      ordem: 2,
      armazenada_em: new Date(),
      excluido_em: null,
    },
    {
      id: FOTO_1,
      evento_id: B,
      legenda: "Do casamento B.",
      largura: 1600,
      altura: 1067,
      ordem: 1,
      armazenada_em: new Date(),
      excluido_em: null,
    },
  ];
}

describe("a escrita de V-19 carrega o `evento_id` em toda instrução (RV-14)", () => {
  it("a legenda grava, e a foto do casamento vizinho devolve nulo", async () => {
    const linhas = linhasDeTeste();
    const { exec } = bancoFalso(linhas);

    const minha = await definirLegenda(A, FOTO_1, "Nossa primeira viagem.", exec);
    expect(minha?.legenda).toBe("Nossa primeira viagem.");

    /**
     * **A MESMA `FOTO_1` EXISTE NOS DOIS CASAMENTOS NESTE FIXTURE**, de
     * propósito: é o único jeito de a asserção provar que o filtro é o
     * `evento_id`, e não a raridade do uuid. Sem a colisão, a consulta erraria e
     * o teste continuaria verde.
     */
    const doVizinho = await definirLegenda(
      "33333333-3333-4333-8333-333333333333",
      FOTO_1,
      "invadida",
      exec
    );
    expect(doVizinho).toBeNull();
    expect(linhas.find(l => l.evento_id === B)!.legenda).toBe("Do casamento B.");
  });

  it("**a reordenação é UMA instrução, com `unnest` e o `evento_id`** (RV-05)", async () => {
    const linhas = linhasDeTeste();
    const { exec, registro } = bancoFalso(linhas);

    await reordenarFotos(
      A,
      [
        { id: FOTO_2, ordem: 1 },
        { id: FOTO_1, ordem: 2 },
      ],
      exec
    );

    /**
     * UMA, e não duas. O driver HTTP do Neon executa uma instrução por
     * requisição, sem transação abraçando o arquivo: doze `update` em sequência,
     * numa conexão de celular à noite, deixam a ordem inconsistente no meio se o
     * quinto falhar.
     */
    expect(registro).toHaveLength(1);
    expect(registro[0].texto).toContain("unnest");
    expect(registro[0].valores).toContain(A);

    expect(linhas.find(l => l.id === FOTO_2 && l.evento_id === A)!.ordem).toBe(1);
    expect(linhas.find(l => l.id === FOTO_1 && l.evento_id === A)!.ordem).toBe(2);
  });

  it("**um id de outro casamento na lista não move nada dele**", async () => {
    const linhas = linhasDeTeste();
    const { exec } = bancoFalso(linhas);

    // A lista de A carrega, contaminada, o id que também existe em B.
    await reordenarFotos(A, [{ id: FOTO_1, ordem: 9 }], exec);

    expect(linhas.find(l => l.id === FOTO_1 && l.evento_id === A)!.ordem).toBe(9);
    expect(
      linhas.find(l => l.id === FOTO_1 && l.evento_id === B)!.ordem,
      "a foto do casamento vizinho mudou de posição"
    ).toBe(1);
  });

  it("lista vazia não executa instrução nenhuma", async () => {
    const { exec, registro } = bancoFalso(linhasDeTeste());
    await reordenarFotos(A, [], exec);
    expect(registro).toEqual([]);
  });

  it("`buscarFoto` e `marcarFotoExcluida` filtram por evento", async () => {
    const linhas = linhasDeTeste();
    const { exec } = bancoFalso(linhas);

    expect(await buscarFoto(A, FOTO_1, exec)).not.toBeNull();
    expect(await buscarFoto("33333333-3333-4333-8333-333333333333", FOTO_1, exec)).toBeNull();

    expect(await marcarFotoExcluida(A, FOTO_1, exec)).toBe(true);
    // Repetir devolve `false`: a linha já está marcada. É o que faz a rota
    // responder 404 em vez de fingir que apagou de novo.
    expect(await marcarFotoExcluida(A, FOTO_1, exec)).toBe(false);
    expect(linhas.find(l => l.id === FOTO_1 && l.evento_id === B)!.excluido_em).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 4. O balde — a metade que nunca rodou em produção
 * ------------------------------------------------------------------ */

type Chamada = { tipo: "apagar" | "purgar"; alvo: string };

function clienteFalso(opcoes: { recusa?: string; some?: string } = {}) {
  const chamadas: Chamada[] = [];
  const cliente: ClienteDeObjetos = {
    async cabeca() {
      throw new Error("a exclusão da galeria não deve consultar `cabeca`");
    },
    async copiar() {
      throw new Error("a exclusão da galeria não copia nada");
    },
    async apagar(chave) {
      chamadas.push({ tipo: "apagar", alvo: chave });
      if (opcoes.recusa && chave.endsWith(opcoes.recusa)) return false;
      return true;
    },
    async listar() {
      return { objetos: [], proximo: null };
    },
    async purgarNaBorda(enderecos) {
      for (const endereco of enderecos) chamadas.push({ tipo: "purgar", alvo: endereco });
      return true;
    },
    async respondeNoPublico() {
      return false;
    },
  };
  return { cliente, chamadas };
}

describe("apagar a foto apaga as duas derivadas, e nada mais", () => {
  beforeEach(() => {
    vi.stubEnv("R2_PUBLIC_BASE", BASE);
  });

  it("**as duas chaves são as de `chavesDaFoto`, e a miniatura vai primeiro**", async () => {
    const { cliente, chamadas } = clienteFalso();
    expect(await apagarDerivadasDaFoto(A, FOTO_1, cliente)).toBe(true);

    const apagadas = chamadas.filter(c => c.tipo === "apagar").map(c => c.alvo);
    expect(apagadas).toEqual([
      `pub/e/${A}/g/${FOTO_1}/t.jpg`,
      `pub/e/${A}/g/${FOTO_1}/p.jpg`,
    ]);

    /**
     * **A MINIATURA ANTES DA PRÉVIA, E A ORDEM É DELIBERADA.** Se a segunda
     * falhar, o que ficou de pé é o que o SITE serve: a prévia de 1600. A foto
     * continua inteira na página do casamento, e o que quebra é o quadradinho do
     * editor — visível só para o casal, e consertado por um toque em apagar de
     * novo. Invertida, a falha do meio quebraria a página que 150 pessoas abrem.
     */
    expect(apagadas[0].endsWith("/t.jpg"), "a prévia foi apagada antes da miniatura").toBe(
      true
    );
  });

  it("**a borda é purgada nos dois endereços públicos** — melhor esforço", async () => {
    const { cliente, chamadas } = clienteFalso();
    await apagarDerivadasDaFoto(A, FOTO_1, cliente);

    expect(chamadas.filter(c => c.tipo === "purgar").map(c => c.alvo)).toEqual([
      `${BASE}/pub/e/${A}/g/${FOTO_1}/t.jpg`,
      `${BASE}/pub/e/${A}/g/${FOTO_1}/p.jpg`,
    ]);
  });

  it("**o balde recusando devolve `false`, e a segunda derivada nem é tentada**", async () => {
    const { cliente, chamadas } = clienteFalso({ recusa: "t.jpg" });
    expect(await apagarDerivadasDaFoto(A, FOTO_1, cliente)).toBe(false);

    // Nada de purga: não há o que invalidar, porque nada saiu.
    expect(chamadas.filter(c => c.tipo === "purgar")).toEqual([]);
    // E a prévia continua lá — abortar cedo é o que mantém o estado descritível.
    expect(chamadas.filter(c => c.tipo === "apagar")).toHaveLength(1);
  });

  it("**objeto que já não existe conta como apagado** — é o que faz tentar de novo terminar", async () => {
    /**
     * `apagar()` trata 204 e 404 como os dois "não está mais lá". É essa
     * tolerância que faz a segunda passada atravessar o balde sem fazer nada e
     * chegar à linha — que é o conserto do processo que morreu entre os dois
     * passos.
     */
    const { cliente } = clienteFalso();
    expect(await apagarDerivadasDaFoto(A, FOTO_1, cliente)).toBe(true);
    expect(await apagarDerivadasDaFoto(A, FOTO_1, cliente)).toBe(true);
  });

  it("**sem R2 configurado, apagar a linha é a operação inteira**", async () => {
    /**
     * ESTE É O ESTADO REAL DA PRODUÇÃO HOJE: as cinco variáveis do balde não
     * estão configuradas, e o envio responde 503 na intenção. Sem balde não há
     * objeto, e o que não existe não precisa sair de lugar nenhum — então a
     * exclusão **não pode** travar. Devolver `false` aqui deixaria o casal com
     * uma foto que ele não consegue apagar por causa de uma variável de
     * ambiente.
     */
    expect(await apagarDerivadasDaFoto(A, FOTO_1, null)).toBe(true);
  });
});
