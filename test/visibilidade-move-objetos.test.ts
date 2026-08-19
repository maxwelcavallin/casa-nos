import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import { chavesDaMidia } from "@/lib/r2";
import {
  abrirDerivadas,
  midiaDaChave,
  restringirDerivadas,
  varrerPublicoIndevido,
  type ClienteDeObjetos,
  type Objeto,
} from "@/lib/r2-objetos";
import { mudarVisibilidadeDaMidia, trocaFalhou } from "@/lib/visibilidade";

/**
 * A COREOGRAFIA DA RN-33 — e ela existe porque o produto imprime uma frase.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **"Só os noivos veem esta foto."**
 *
 * Até 19/08/2026, trocar uma foto de `feed` para `noivos` mudava **uma coluna**.
 * O objeto continuava no endereço público de antes, e quem tivesse aquele
 * endereço continuava vendo a foto — para sempre. A hipótese central da Fatia 1
 * é a razão entre os dois botões de envio; medir uma escolha cuja consequência o
 * produto não cumpre não mede nada.
 *
 * Agora a troca é: **copiar → apagar → purgar a borda → conferir que o endereço
 * público parou de responder → só então escrever a coluna.** Este arquivo prova
 * a ordem e prova a parte que ninguém testa por acidente: **a troca falha
 * inteira quando a borda não confirma.**
 *
 * POR QUE ISTO É TESTÁVEL SEM UM BALDE DE VERDADE: `lib/r2-objetos.ts` fala com
 * o R2 através de uma porta (`ClienteDeObjetos`). Sem ela, esta coreografia só
 * seria verificável com um balde e um domínio reais — ou seja, nunca antes da
 * festa.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";
const MIDIA = "22222222-2222-4222-8222-222222222222";
const PARTICIPACAO = "33333333-3333-4333-8333-333333333333";

type Roteiro = {
  /** Chaves que existem no balde. */
  existentes: Set<string>;
  /** Endereços públicos que a borda ainda responde. */
  vivosNaBorda: Set<string>;
  /** `false` faz a purga não limpar a borda — o caso do token não configurado. */
  purgaFunciona: boolean;
  copiaFunciona: boolean;
  remocaoFunciona: boolean;
};

function clienteFalso(roteiro: Partial<Roteiro> = {}) {
  const estado: Roteiro = {
    existentes: new Set<string>(),
    vivosNaBorda: new Set<string>(),
    purgaFunciona: true,
    copiaFunciona: true,
    remocaoFunciona: true,
    ...roteiro,
  };
  const passos: string[] = [];

  const cliente: ClienteDeObjetos = {
    async cabeca(chave) {
      passos.push(`cabeca:${chave}`);
      return estado.existentes.has(chave)
        ? ({ chave, tamanho: 1, modificadoEm: new Date("2027-08-22T23:00:00Z") } as Objeto)
        : null;
    },
    async copiar(de, para) {
      passos.push(`copiar:${de}->${para}`);
      if (!estado.copiaFunciona) return false;
      estado.existentes.add(para);
      return true;
    },
    async apagar(chave) {
      passos.push(`apagar:${chave}`);
      if (!estado.remocaoFunciona) return false;
      estado.existentes.delete(chave);
      return true;
    },
    async listar(prefixo) {
      const objetos = [...estado.existentes]
        .filter(chave => chave.startsWith(prefixo))
        .map(chave => ({ chave, tamanho: 1, modificadoEm: null }));
      return { objetos, proximo: null };
    },
    async purgarNaBorda(enderecos) {
      passos.push(`purgar:${enderecos.length}`);
      if (!estado.purgaFunciona) return false;
      for (const endereco of enderecos) estado.vivosNaBorda.delete(endereco);
      return true;
    },
    async respondeNoPublico(endereco) {
      passos.push(`conferir:${endereco}`);
      return estado.vivosNaBorda.has(endereco);
    },
  };

  return { cliente, estado, passos };
}

const BASE = "https://fotos.casa-nos.app";
const guardada = process.env.R2_PUBLIC_BASE;

beforeEach(() => {
  process.env.R2_PUBLIC_BASE = BASE;
});

afterEach(() => {
  if (guardada === undefined) delete process.env.R2_PUBLIC_BASE;
  else process.env.R2_PUBLIC_BASE = guardada;
});

const chavesFeed = chavesDaMidia(EVENTO, MIDIA, null, "feed");
const chavesNoivos = chavesDaMidia(EVENTO, MIDIA, null, "noivos");
const enderecoDaPrevia = `${BASE}/${chavesFeed.previa}`;
const enderecoDaMiniatura = `${BASE}/${chavesFeed.miniatura}`;

/** Um balde com a foto publicada e a borda servindo os dois endereços. */
function comFotoPublicada() {
  return clienteFalso({
    existentes: new Set([chavesFeed.miniatura, chavesFeed.previa]),
    vivosNaBorda: new Set([enderecoDaMiniatura, enderecoDaPrevia]),
  });
}

describe("feed → noivos: restringir", () => {
  it("copia para prv/, apaga de pub/, purga e confere — NESTA ordem", async () => {
    const { cliente, estado, passos } = comFotoPublicada();

    const resultado = await restringirDerivadas(EVENTO, MIDIA, cliente);

    expect(resultado.ok).toBe(true);
    expect(estado.existentes.has(chavesNoivos.previa)).toBe(true);
    expect(estado.existentes.has(chavesFeed.previa)).toBe(false);

    /**
     * A ORDEM NÃO É INTERCAMBIÁVEL, e cada troca tem uma consequência:
     * apagar antes de copiar perde a foto; conferir antes de purgar dá verde
     * enquanto a borda ainda serve; conferir depois do banco confirma para a
     * convidada uma privacidade que não existe.
     */
    const copiar = passos.findIndex(p => p.startsWith("copiar:"));
    const apagar = passos.findIndex(p => p.startsWith("apagar:"));
    const purgar = passos.findIndex(p => p.startsWith("purgar:"));
    const conferir = passos.findIndex(p => p.startsWith("conferir:"));
    expect(copiar).toBeLessThan(apagar);
    expect(apagar).toBeLessThan(purgar);
    expect(purgar).toBeLessThan(conferir);
  });

  it("**A BORDA QUE CONTINUA RESPONDENDO REPROVA A TROCA**", async () => {
    /**
     * O buraco que apareceria meses depois como "bug de cache". O objeto some da
     * origem, a purga não funciona (token não configurado, zona errada), e a
     * borda continua servindo a foto por horas para quem tiver o endereço.
     *
     * Conferindo só a origem, isto passaria em verde.
     */
    const { cliente } = clienteFalso({
      existentes: new Set([chavesFeed.miniatura, chavesFeed.previa]),
      vivosNaBorda: new Set([enderecoDaMiniatura, enderecoDaPrevia]),
      purgaFunciona: false,
    });

    const resultado = await restringirDerivadas(EVENTO, MIDIA, cliente);
    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.motivo).toBe("borda");
  });

  it("falha na cópia aborta antes de apagar — a foto nunca fica sem lugar", async () => {
    const { cliente, estado, passos } = clienteFalso({
      existentes: new Set([chavesFeed.miniatura, chavesFeed.previa]),
      vivosNaBorda: new Set([enderecoDaMiniatura, enderecoDaPrevia]),
      copiaFunciona: false,
    });

    const resultado = await restringirDerivadas(EVENTO, MIDIA, cliente);
    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.motivo).toBe("copia");
    expect(passos.some(p => p.startsWith("apagar:"))).toBe(false);
    expect(estado.existentes.has(chavesFeed.previa)).toBe(true);
  });

  it("foto que ainda não subiu não é erro — é o caso comum", async () => {
    // Trocar a visibilidade em "as minhas fotos" antes de a prévia chegar é
    // normal. Não há objeto para mover, e a troca segue.
    const { cliente } = clienteFalso();
    const resultado = await restringirDerivadas(EVENTO, MIDIA, cliente);
    expect(resultado.ok).toBe(true);
    expect(resultado.ok === true && resultado.movidas).toBe(0);
  });

  it("sem R2 configurado, não há objeto e não há vazamento", async () => {
    // `null` NÃO é falha: sem balde não existe objeto, e sem objeto não existe
    // endereço público para vazar.
    const resultado = await restringirDerivadas(EVENTO, MIDIA, null);
    expect(resultado.ok).toBe(true);
  });
});

describe("noivos → feed: abrir", () => {
  it("copia para pub/ e **não apaga prv/ antes do banco**", async () => {
    /**
     * A assimetria com o caminho de cima é de propósito. Abrindo, o risco muda
     * de lado: apagar `prv/` antes do banco e a escrita falhar deixaria a foto
     * `noivos` sem objeto em `prv/` — a convidada abriria "as minhas fotos" e
     * veria um tile quebrado no lugar da própria foto. Lixo em `prv/` é o erro
     * barato, e o cron do H-15 recolhe.
     */
    const { cliente, estado, passos } = clienteFalso({
      existentes: new Set([chavesNoivos.miniatura, chavesNoivos.previa]),
    });

    const resultado = await abrirDerivadas(EVENTO, MIDIA, cliente);
    expect(resultado.ok).toBe(true);
    expect(estado.existentes.has(chavesFeed.previa)).toBe(true);
    expect(estado.existentes.has(chavesNoivos.previa)).toBe(true);
    expect(passos.some(p => p.startsWith("apagar:"))).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * O banco só é escrito depois de o balde confirmar
 * ------------------------------------------------------------------ */

function bancoFalso(visibilidadeAtual: "feed" | "noivos") {
  const escritas: string[] = [];
  let visibilidade = visibilidadeAtual;
  const exec = (async (partes: TemplateStringsArray) => {
    const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
    if (/^update midias set visibilidade/i.test(texto)) {
      escritas.push(texto);
      visibilidade = visibilidade === "feed" ? "noivos" : "feed";
      return [linha(visibilidade)];
    }
    if (/^insert into eventos_de_erro/i.test(texto)) return [];
    if (/^select \* from midias/i.test(texto)) return [linha(visibilidade)];
    return [];
  }) as unknown as Executor;
  return { exec, escritas, atual: () => visibilidade };
}

function linha(visibilidade: string) {
  return {
    id: MIDIA,
    evento_id: EVENTO,
    participacao_id: PARTICIPACAO,
    lote_id: "44444444-4444-4444-8444-444444444444",
    client_media_id: "55555555-5555-4555-8555-555555555555",
    hash_conteudo: null,
    estado: "armazenada",
    visibilidade,
    aprovacao: "nao_requer",
    tipo_arquivo: "image/jpeg",
    bytes: 100,
    previa_armazenada_em: new Date(),
    original_armazenada_em: null,
    criada_em: new Date(),
    enfileirada_offline: false,
  };
}

describe("a troca inteira — banco e balde", () => {
  it("a coluna só muda DEPOIS de o endereço público parar de responder", async () => {
    const { cliente } = comFotoPublicada();
    const { exec, escritas } = bancoFalso("feed");

    const resultado = await mudarVisibilidadeDaMidia(
      EVENTO,
      MIDIA,
      PARTICIPACAO,
      "noivos",
      { cliente, exec }
    );

    expect(trocaFalhou(resultado)).toBe(false);
    expect(escritas).toHaveLength(1);
  });

  it("**a borda que não confirma deixa a coluna intacta**", async () => {
    /**
     * O comportamento que a H-10 já mandava: se a troca não completa, ela
     * reverte. É o que torna verdadeira a mensagem de erro da tela — *"Não
     * conseguimos mudar agora. Continua na festa."* Continua mesmo.
     */
    const { cliente } = clienteFalso({
      existentes: new Set([chavesFeed.miniatura, chavesFeed.previa]),
      vivosNaBorda: new Set([enderecoDaMiniatura, enderecoDaPrevia]),
      purgaFunciona: false,
    });
    const { exec, escritas, atual } = bancoFalso("feed");

    const resultado = await mudarVisibilidadeDaMidia(
      EVENTO,
      MIDIA,
      PARTICIPACAO,
      "noivos",
      { cliente, exec }
    );

    expect(trocaFalhou(resultado)).toBe(true);
    expect(escritas).toEqual([]);
    expect(atual()).toBe("feed");
  });
});

/* ------------------------------------------------------------------ *
 * A varredura — a guarda contra a falha parcial
 * ------------------------------------------------------------------ */

describe("a varredura de pub/", () => {
  it("apaga objeto público de mídia `noivos` e de mídia excluída", async () => {
    /**
     * A coreografia não tem transação entre o banco e o balde. Ela aborta antes
     * do banco quando falha — mas o processo pode morrer no meio (a plataforma
     * encerra a função), e aí sobra uma mídia `noivos` com objeto em `pub/`.
     * **Sem esta varredura, a promessa fica quebrada em silêncio**, que é
     * exatamente o modo de falha que este produto não pode ter.
     */
    const outraMidia = "66666666-6666-4666-8666-666666666666";
    const excluida = "77777777-7777-4777-8777-777777777777";
    const daOutra = chavesDaMidia(EVENTO, outraMidia, null, "feed");
    const daExcluida = chavesDaMidia(EVENTO, excluida, null, "feed");

    const { cliente, estado } = clienteFalso({
      existentes: new Set([
        chavesFeed.previa, // esta é `feed` de verdade e fica
        daOutra.previa, // esta virou `noivos` e não deveria estar aqui
        daExcluida.previa, // esta foi apagada
      ]),
    });

    const varredura = await varrerPublicoIndevido(
      EVENTO,
      async ids => {
        const mapa = new Map<string, "feed" | "noivos" | "excluida">();
        for (const id of ids) {
          if (id === MIDIA) mapa.set(id, "feed");
          if (id === outraMidia) mapa.set(id, "noivos");
          if (id === excluida) mapa.set(id, "excluida");
        }
        return mapa;
      },
      cliente
    );

    expect(varredura.indevidos.sort()).toEqual([excluida, outraMidia].sort());
    expect(estado.existentes.has(chavesFeed.previa)).toBe(true);
    expect(estado.existentes.has(daOutra.previa)).toBe(false);
    expect(estado.existentes.has(daExcluida.previa)).toBe(false);
  });

  it("objeto SEM LINHA no banco é indevido, e não ignorado", async () => {
    /**
     * Ele não pode existir: o `midia_id` nasce da linha de intenção. Se
     * apareceu, alguma coisa escreveu no balde por fora — e tratar como
     * "desconhecido, deixa quieto" seria deixar aberto um objeto que ninguém
     * consegue explicar.
     */
    const { cliente, estado } = clienteFalso({
      existentes: new Set([chavesFeed.previa]),
    });
    const varredura = await varrerPublicoIndevido(EVENTO, async () => new Map(), cliente);
    expect(varredura.indevidos).toEqual([MIDIA]);
    expect(estado.existentes.size).toBe(0);
  });

  it("a chave vira id de mídia nos dois prefixos", () => {
    expect(midiaDaChave(`pub/e/${EVENTO}/m/${MIDIA}/t.jpg`)).toBe(MIDIA);
    expect(midiaDaChave(`prv/e/${EVENTO}/m/${MIDIA}/o.heic`)).toBe(MIDIA);
    expect(midiaDaChave("qualquer/coisa.jpg")).toBeNull();
  });
});
