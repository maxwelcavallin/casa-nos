import { beforeEach, describe, expect, it } from "vitest";

import type { EventosDeAnalytics, NomeDeEvento } from "@/lib/analytics";
import type { Armazem } from "@/lib/fila/armazem";
import { criarMotor, type Escolha } from "@/lib/fila/motor";
import type { Rede, RespostaDeIntencao, ResultadoDoEnvio } from "@/lib/fila/rede";
import { chaveDoBlob, type ItemDaFila } from "@/lib/fila/tipos";

/**
 * O SALÃO, DENTRO DO CI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A aposta do produto é uma frase: **a foto não se perde quando o wifi do salão
 * cai**. Ela só é verificável de duas formas — numa festa de verdade, que
 * acontece uma vez, ou aqui, com a rede injetada. Este arquivo é a segunda.
 *
 * Cada cenário abaixo é uma coisa que a rede de um salão faz de verdade:
 * cair no meio do envio, voltar, cair de novo; responder a página de login do
 * portal com status 200; devolver 500; deixar a URL assinada vencer durante a
 * noite; e o convidado fechar a aba no meio de tudo.
 *
 * O QUE ESTE ARQUIVO **NÃO** PROVA, e está escrito para ninguém confundir:
 * throughput real, comportamento do IndexedDB sob pressão de espaço, o
 * congelamento de aba do iOS, e a recusa de `navigator.storage.persist()`. Isso
 * é aparelho de verdade, e está na lista do ensaio.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";
const PARTICIPACAO = "22222222-2222-4222-8222-222222222222";

/* ------------------------------------------------------------------ *
 * Armazém em memória — o mesmo contrato do IndexedDB
 * ------------------------------------------------------------------ */

function armazemFalso() {
  const itens = new Map<string, ItemDaFila>();
  const blobs = new Map<string, Blob>();

  const armazem: Armazem = {
    async listar(eventoId) {
      // Cópia profunda: o IndexedDB devolve objetos novos a cada leitura, e um
      // motor que dependesse de mutar o objeto em memória passaria aqui e
      // falharia no navegador.
      return [...itens.values()]
        .filter(i => i.eventoId === eventoId)
        .map(i => structuredClone(i));
    },
    async salvar(item) {
      itens.set(item.clientMediaId, structuredClone(item));
    },
    async remover(clientMediaId) {
      itens.delete(clientMediaId);
    },
    async lerBlob(clientMediaId, faixa) {
      return blobs.get(chaveDoBlob(clientMediaId, faixa)) ?? null;
    },
    async gravarBlob(clientMediaId, faixa, dados) {
      blobs.set(chaveDoBlob(clientMediaId, faixa), dados);
    },
    async apagarBlob(clientMediaId, faixa) {
      blobs.delete(chaveDoBlob(clientMediaId, faixa));
    },
  };

  return { armazem, itens, blobs };
}

/* ------------------------------------------------------------------ *
 * Rede roteirizada — é onde o salão mora
 * ------------------------------------------------------------------ */

type Roteiro = {
  /** Respostas do `PUT`, na ordem. A última se repete. */
  puts: ResultadoDoEnvio[];
  intencao?: RespostaDeIntencao;
  confirmacao?: ResultadoDoEnvio;
};

function redeFalsa(roteiro: Roteiro) {
  const chamadas = { intencao: 0, put: 0, confirmacao: 0, relatos: 0 };
  let midiaSequencial = 0;

  const rede: Rede = {
    async intencao(_eventoId, corpo) {
      chamadas.intencao += 1;
      if (roteiro.intencao) return roteiro.intencao;
      return {
        situacao: "ok",
        faixaLenta: false,
        itens: corpo.itens.map(item => ({
          client_media_id: item.client_media_id,
          midia_id: `midia-${++midiaSequencial}`,
          ja_existia: false,
          urls: {
            miniatura: "https://balde/t.jpg?assinada",
            previa: "https://balde/p.jpg?assinada",
            original: "https://balde/o.jpg?assinada",
          },
          expira_em: new Date(AGORA + 24 * 60 * 60 * 1000).toISOString(),
        })),
      };
    },
    async enviarFaixa() {
      const resposta = roteiro.puts[Math.min(chamadas.put, roteiro.puts.length - 1)];
      chamadas.put += 1;
      return resposta;
    },
    async confirmar() {
      chamadas.confirmacao += 1;
      return roteiro.confirmacao ?? { sucesso: true, falha: null };
    },
    async relatarErro() {
      chamadas.relatos += 1;
    },
  };

  return { rede, chamadas };
}

/* ------------------------------------------------------------------ *
 * Montagem
 * ------------------------------------------------------------------ */

const AGORA = 1_700_000_000_000;
const OK: ResultadoDoEnvio = { sucesso: true, falha: null };
const SEM_REDE: ResultadoDoEnvio = { sucesso: false, falha: "rede" };
const PORTAL: ResultadoDoEnvio = { sucesso: false, falha: "portal" };
const SERVIDOR: ResultadoDoEnvio = { sucesso: false, falha: "servidor" };

type Medido = { nome: NomeDeEvento; parametros: unknown };

function montar(roteiro: Roteiro, opcoes: { online?: boolean; armazem?: Armazem } = {}) {
  const guardado = opcoes.armazem ? null : armazemFalso();
  const armazem = opcoes.armazem ?? guardado!.armazem;
  const { rede, chamadas } = redeFalsa(roteiro);
  const medidos: Medido[] = [];
  let relogio = AGORA;
  let sequencial = 0;

  const motor = criarMotor(
    {
      armazem,
      rede,
      agora: () => relogio,
      medir: <N extends NomeDeEvento>(nome: N, parametros: EventosDeAnalytics[N]) => {
        medidos.push({ nome, parametros });
      },
      // Derivadas injetadas: canvas não existe no ambiente de teste, e o que
      // este arquivo verifica é a fila, não a compressão.
      gerarDerivadas: async () => ({
        miniatura: new Blob(["t"]),
        previa: new Blob(["p"]),
        largura: 1600,
        altura: 1200,
      }),
      hashDoArquivo: async () => "h".repeat(64),
      novoId: () => `id-${++sequencial}`,
      online: () => opcoes.online ?? true,
    },
    {
      eventoId: EVENTO,
      participacaoId: PARTICIPACAO,
      weddingId: EVENTO,
      faixaLenta: false,
      primeiroAcessoEm: AGORA - 30_000,
    }
  );

  return {
    motor,
    armazem,
    itens: guardado?.itens,
    blobs: guardado?.blobs,
    chamadas,
    medidos,
    avancar: (ms: number) => {
      relogio += ms;
    },
  };
}

function foto(nome = "foto.jpg", tipo = "image/jpeg"): Escolha {
  return { arquivo: new Blob(["conteudo"]), nome, tipoArquivo: tipo, bytes: 4_200_000 };
}

/** Drena até a fila parar de andar, com teto — nenhum teste roda para sempre. */
async function drenarAte(motor: ReturnType<typeof montar>["motor"], vezes = 4) {
  for (let i = 0; i < vezes; i++) await motor.drenar();
}

/* ------------------------------------------------------------------ *
 * Os cenários
 * ------------------------------------------------------------------ */

describe("a escolha acontece antes de qualquer rede", () => {
  it("sem rede no momento da escolha, os arquivos ficam no disco", async () => {
    const cenario = montar({ puts: [SEM_REDE] }, { online: false });

    const resultado = await cenario.motor.enfileirar([foto(), foto("b.jpg")], {
      visibilidade: "feed",
      origem: "galeria",
    });

    expect(resultado.enfileirados).toBe(2);
    expect(cenario.itens!.size).toBe(2);

    // Os três blobs de cada foto: original, miniatura e prévia.
    expect(cenario.blobs!.size).toBe(6);

    // E a marca que viaja até o GA4 no sucesso: esta foto foi escolhida offline.
    for (const item of cenario.itens!.values()) {
      expect(item.enfileiradaOffline).toBe(true);
    }
  });

  it("vídeo é recusado NO APARELHO e as fotos do mesmo lote seguem (RN-12)", async () => {
    const cenario = montar({ puts: [OK] });

    const resultado = await cenario.motor.enfileirar(
      [foto("a.jpg"), foto("filme.mp4", "video/mp4"), foto("c.jpg")],
      { visibilidade: "feed", origem: "galeria" }
    );

    expect(resultado.videosRecusados).toBe(1);
    expect(resultado.enfileirados).toBe(2);
    expect(cenario.itens!.size).toBe(2);
  });
});

describe("modo avião intermitente", () => {
  it("três falhas de rede e depois sucesso: a foto chega, com UM evento por faixa", async () => {
    const cenario = montar({ puts: [SEM_REDE, SEM_REDE, SEM_REDE, OK] });
    await cenario.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });

    // Três ciclos falhando. Entre eles, o tempo passa: sem isso o item estaria
    // em recuo e o teste provaria só que o recuo existe.
    for (let i = 0; i < 3; i++) {
      await cenario.motor.drenar();
      cenario.avancar(61_000);
    }

    const antes = cenario.medidos.filter(m => m.nome === "media_upload_succeeded");
    expect(antes, "nada podia ter sido dado como enviado ainda").toHaveLength(0);

    await drenarAte(cenario.motor);

    const sucessos = cenario.medidos.filter(m => m.nome === "media_upload_succeeded");
    const faixas = sucessos.map(m => (m.parametros as { upload_lane: string }).upload_lane);

    // DOIS eventos ao todo — um por faixa —, nunca mais que isso (RN-28).
    expect(faixas.sort()).toEqual(["original", "previa"]);

    // E o item saiu da fila só depois das DUAS faixas.
    expect(cenario.itens!.size).toBe(0);
  });

  it("cada retentativa vira um media_upload_retried com o tipo certo", async () => {
    const cenario = montar({ puts: [SEM_REDE, OK] });
    await cenario.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });
    await cenario.motor.drenar();

    const retentativas = cenario.medidos.filter(m => m.nome === "media_upload_retried");
    expect(retentativas).toHaveLength(1);
    expect((retentativas[0].parametros as { error_kind: string }).error_kind).toBe("rede");
  });

  it("a fila NUNCA desiste: dez falhas seguidas e o item continua lá", async () => {
    const cenario = montar({ puts: [SEM_REDE] });
    await cenario.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });

    for (let i = 0; i < 10; i++) {
      await cenario.motor.drenar();
      cenario.avancar(61_000);
    }

    const [item] = [...cenario.itens!.values()];
    expect(item, "o item sumiu depois de dez falhas — isso é perder a foto").toBeDefined();
    expect(item.tentativas).toBeGreaterThanOrEqual(10);
    expect(item.faixas.previa).toBe("pendente");
  });
});

describe("o portal cativo do salão", () => {
  it("HTML com status 200 não é enviado: o item fica, o blob fica", async () => {
    const cenario = montar({ puts: [PORTAL] });
    await cenario.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });
    const estado = await cenario.motor.drenar();

    expect(estado.situacao).toBe("portal_cativo");
    expect(estado.pendentes).toBe(1);

    const [item] = [...cenario.itens!.values()];
    expect(item.faixas.previa).toBe("pendente");
    expect(item.ultimaFalha).toBe("portal");

    // O blob local continua no disco: é a única cópia que existe da foto se o
    // convidado já apagou a original da galeria.
    expect(cenario.blobs!.size).toBeGreaterThan(0);

    // E nada foi dado como enviado.
    expect(cenario.medidos.filter(m => m.nome === "media_upload_succeeded")).toHaveLength(0);
  });
});

describe("o servidor falhando", () => {
  it("500 vira retentativa com error_kind servidor, e um relato ao servidor", async () => {
    const cenario = montar({ puts: [SERVIDOR, OK] });
    await cenario.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });
    await cenario.motor.drenar();

    const retentativas = cenario.medidos.filter(m => m.nome === "media_upload_retried");
    expect((retentativas[0].parametros as { error_kind: string }).error_kind).toBe("servidor");

    // H-18: falha relatada pelo cliente vira registro no servidor. Sem isto, um
    // 403 do balde é invisível daqui — o `PUT` não passa por nós.
    expect(cenario.chamadas.relatos).toBe(1);
  });
});

describe("a noite inteira: a URL assinada vence", () => {
  it("depois de 24 h a intenção é repetida antes de qualquer PUT (P10)", async () => {
    const cenario = montar({ puts: [SEM_REDE] });
    await cenario.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });
    await cenario.motor.drenar();
    expect(cenario.chamadas.intencao).toBe(1);

    // Dormiu a noite. A URL de 24 h venceu.
    cenario.avancar(25 * 60 * 60 * 1000);
    await cenario.motor.drenar();

    expect(
      cenario.chamadas.intencao,
      "a fila tentou usar uma URL vencida em vez de pedir outra. No produto isso " +
        "vira erro permanente na manhã seguinte."
    ).toBe(2);
  });
});

describe("fora da janela de envio", () => {
  it("409 é ESTADO: a fila para de tentar e não perde nada", async () => {
    const cenario = montar({
      puts: [OK],
      intencao: { situacao: "fora_da_janela" },
    });
    await cenario.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });
    const estado = await cenario.motor.drenar();

    expect(estado.situacao).toBe("parada");
    // Nenhum PUT: não adianta subir byte de uma foto que o servidor recusou.
    expect(cenario.chamadas.put).toBe(0);
    // E o item continua no disco: se o casal reabrir a janela, ele sobe.
    expect(cenario.itens!.size).toBe(1);
  });
});

describe("a retomada, ao reabrir o link", () => {
  it("um motor novo sobre o mesmo disco encontra a fila e manda sozinho", async () => {
    const compartilhado = armazemFalso();

    // Primeira visita: sem rede. A foto fica no disco e a aba fecha.
    const primeira = montar({ puts: [SEM_REDE] }, { armazem: compartilhado.armazem, online: false });
    await primeira.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });
    await primeira.motor.drenar();
    expect(compartilhado.itens.size).toBe(1);

    // Segunda visita, aparelho novo em memória, mesmo disco, rede boa.
    const segunda = montar({ puts: [OK] }, { armazem: compartilhado.armazem });
    const estado = await segunda.motor.retomar();

    expect(
      estado.retomados,
      "a retomada não encontrou a foto que ficou — é o 'achamos 6 fotos que faltavam'"
    ).toBe(1);

    await drenarAte(segunda.motor);
    expect(compartilhado.itens.size).toBe(0);
  });

  it("a retomada zera o recuo: quem dormiu 60 s não espera de novo", async () => {
    const compartilhado = armazemFalso();
    const primeira = montar({ puts: [SEM_REDE] }, { armazem: compartilhado.armazem });
    await primeira.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });
    await primeira.motor.drenar();

    const [emRecuo] = [...compartilhado.itens.values()];
    expect(emRecuo.proximaTentativaEm).toBeGreaterThan(AGORA);

    const segunda = montar({ puts: [OK] }, { armazem: compartilhado.armazem });
    await segunda.motor.retomar();
    await drenarAte(segunda.motor);

    expect(compartilhado.itens.size).toBe(0);
  });
});

describe("o blob some quando a faixa confirma", () => {
  it("a prévia confirmada apaga miniatura e prévia, e mantém o original", async () => {
    // Miniatura e prévia passam; o `PUT` do original cai. É o caso comum no
    // salão: 300 KB sobem, 40 MB não.
    const cenario = montar({ puts: [OK, OK, SEM_REDE] });
    await cenario.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });

    await cenario.motor.drenar();

    const chaves = [...cenario.blobs!.keys()];
    expect(chaves.some(c => c.endsWith(":previa"))).toBe(false);
    expect(chaves.some(c => c.endsWith(":miniatura"))).toBe(false);
    expect(
      chaves.some(c => c.endsWith(":original")),
      "o original foi apagado antes de confirmar — é a única cópia que existe se " +
        "o convidado já apagou a foto da galeria"
    ).toBe(true);
  });
});

describe("o convidado sai com a fila cheia", () => {
  it("media_upload_abandoned leva a contagem e a idade do mais velho", async () => {
    const cenario = montar({ puts: [SEM_REDE] });
    await cenario.motor.enfileirar([foto(), foto("b.jpg")], {
      visibilidade: "feed",
      origem: "galeria",
    });
    cenario.avancar(45_000);
    await cenario.motor.aoSair();

    const abandono = cenario.medidos.find(m => m.nome === "media_upload_abandoned");
    expect(abandono).toBeDefined();
    const parametros = abandono!.parametros as {
      pending_count: number;
      oldest_pending_seconds: number;
    };
    expect(parametros.pending_count).toBe(2);
    expect(parametros.oldest_pending_seconds).toBe(45);
  });

  it("sem fila, nenhum evento de abandono é mandado", async () => {
    const cenario = montar({ puts: [OK] });
    await cenario.motor.aoSair();
    expect(cenario.medidos.filter(m => m.nome === "media_upload_abandoned")).toHaveLength(0);
  });
});

describe("o evento de sucesso carrega a história da fila", () => {
  it("queue_age_seconds, enqueued_offline e seconds_since_scan chegam juntos", async () => {
    const cenario = montar({ puts: [OK] }, { online: false });
    await cenario.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });
    cenario.avancar(120_000);
    await drenarAte(cenario.motor);

    const previa = cenario.medidos.find(
      m =>
        m.nome === "media_upload_succeeded" &&
        (m.parametros as { upload_lane: string }).upload_lane === "previa"
    );
    const parametros = previa!.parametros as Record<string, unknown>;

    expect(parametros.queue_age_seconds).toBe(120);
    expect(parametros.enqueued_offline).toBe("true");
    // Só na faixa `previa`: no original mediria o uplink do salão, não o produto.
    expect(parametros.seconds_since_scan).toBe(150);

    const original = cenario.medidos.find(
      m =>
        m.nome === "media_upload_succeeded" &&
        (m.parametros as { upload_lane: string }).upload_lane === "original"
    );
    expect(
      (original!.parametros as Record<string, unknown>).seconds_since_scan
    ).toBeUndefined();
  });
});

describe("a prévia tem prioridade sobre o original", () => {
  it("com duas fotos, nenhum original sobe antes de todas as prévias", async () => {
    const cenario = montar({ puts: [OK] });
    await cenario.motor.enfileirar([foto("a.jpg"), foto("b.jpg")], {
      visibilidade: "feed",
      origem: "galeria",
    });

    await cenario.motor.drenar();

    const itens = [...cenario.itens!.values()];
    // Uma passada: as duas prévias confirmadas, nenhum original.
    expect(itens.every(i => i.faixas.previa === "confirmada")).toBe(true);
    expect(itens.every(i => i.faixas.original === "pendente")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * O caso que mais importa e que é o mais fácil de errar
 * ------------------------------------------------------------------ */

describe("confirmação repetida não vira evento repetido (RN-28)", () => {
  let blobs: Map<string, Blob>;

  beforeEach(() => {
    blobs = new Map();
  });

  it("drenar de novo depois de tudo confirmado não dispara nada", async () => {
    const compartilhado = armazemFalso();
    blobs = compartilhado.blobs;

    const cenario = montar({ puts: [OK] }, { armazem: compartilhado.armazem });
    await cenario.motor.enfileirar([foto()], { visibilidade: "feed", origem: "galeria" });
    await drenarAte(cenario.motor, 6);

    const sucessos = cenario.medidos.filter(m => m.nome === "media_upload_succeeded");
    expect(
      sucessos,
      "participação inflada por retentativa é o erro mais fácil deste produto e o " +
        "mais difícil de perceber depois"
    ).toHaveLength(2);
    expect(blobs.size).toBe(0);
  });
});
