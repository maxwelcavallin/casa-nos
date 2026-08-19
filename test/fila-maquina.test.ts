import { describe, expect, it } from "vitest";

import {
  classificarResposta,
  concorrencia,
  esperaEmMs,
  precisaDaFaixa,
  proximosDaFaixa,
  resumoDaFila,
  terminou,
  urlsValidas,
} from "@/lib/fila/maquina";
import { itemNovo, type ItemDaFila } from "@/lib/fila/tipos";

/**
 * A lógica da fila, sem rede e sem IndexedDB.
 *
 * Cada caso aqui é uma coisa que o salão faz com o aparelho do convidado. Não dá
 * para levar o CI ao salão; dá para levar o salão ao CI, e é isso que este
 * arquivo é.
 */

function item(sobrepor: Partial<ItemDaFila> = {}): ItemDaFila {
  const base = itemNovo(
    {
      clientMediaId: "c1",
      eventoId: "e1",
      participacaoId: "p1",
      loteId: "l1",
      visibilidade: "feed",
      origem: "galeria",
      tipoArquivo: "image/jpeg",
      bytes: 1000,
      hashConteudo: "h1",
      nomeLocal: "foto.jpg",
      enfileiradaOffline: false,
    },
    1000,
    true
  );
  return { ...base, ...sobrepor };
}

describe("recuo entre tentativas", () => {
  it("cresce 2, 5, 15, 60 e para de crescer", () => {
    expect(esperaEmMs(1)).toBe(2000);
    expect(esperaEmMs(2)).toBe(5000);
    expect(esperaEmMs(3)).toBe(15000);
    expect(esperaEmMs(4)).toBe(60000);
  });

  it("tem TETO: a décima tentativa espera o mesmo que a quarta", () => {
    // Sem teto, um recuo exponencial chegaria a horas na décima falha — e a rede
    // do salão volta em minutos. O item ficaria dormindo depois de a rede ter
    // voltado, que é a pior forma de perder uma foto: por espera.
    expect(esperaEmMs(10)).toBe(60000);
    expect(esperaEmMs(100)).toBe(60000);
  });
});

describe("classificação da resposta — o portal cativo", () => {
  it("HTML com status 200 é FALHA, não sucesso", () => {
    /**
     * O DEFEITO QUE ISTO PEGA, e ele é o pior disponível: a rede do salão
     * responde 200 com a página de login ao `PUT` que ia para o R2. Sem esta
     * classificação, a fila marcaria a foto como enviada, apagaria o blob local
     * e removeria o item — a foto teria evaporado com o produto dizendo que
     * estava tudo certo, dos dois lados.
     */
    const resultado = classificarResposta({
      ok: true,
      status: 200,
      tipoDeConteudo: "text/html; charset=utf-8",
    });
    expect(resultado.sucesso).toBe(false);
    expect(resultado.falha).toBe("portal");
  });

  it("desvio para outro domínio é portal cativo", () => {
    const resultado = classificarResposta({
      ok: true,
      status: 200,
      tipoDeConteudo: "application/octet-stream",
      redirecionada: true,
      urlPedida: "https://balde.r2.exemplo/e/1/m/2/p.jpg",
      urlFinal: "https://portal.wifi.salao/login",
    });
    expect(resultado.falha).toBe("portal");
  });

  it("5xx é servidor — temporário", () => {
    expect(classificarResposta({ ok: false, status: 503 }).falha).toBe("servidor");
  });

  it("403 do R2 é tratado como REDE, porque quase sempre é URL expirada", () => {
    // Tratar como permanente faria a foto de quem dormiu com a fila cheia virar
    // erro definitivo às 24 h e um minuto — no produto cujo eixo é sobreviver à
    // noite. Repetir a intenção devolve URLs novas.
    expect(classificarResposta({ ok: false, status: 403 }).falha).toBe("rede");
  });

  it("400 é arquivo — o único que não adianta repetir", () => {
    expect(classificarResposta({ ok: false, status: 400 }).falha).toBe("arquivo");
  });

  it("200 de verdade é sucesso", () => {
    const r = classificarResposta({ ok: true, status: 200, tipoDeConteudo: "image/jpeg" });
    expect(r.sucesso).toBe(true);
  });
});

describe("ordem das faixas", () => {
  it("a prévia é pedida antes do original", () => {
    const pendente = item();
    expect(precisaDaFaixa(pendente, "previa")).toBe(true);
    expect(precisaDaFaixa(pendente, "original")).toBe(true);
  });

  it("item em recuo não é escolhido antes da hora", () => {
    const dormindo = item({ proximaTentativaEm: 5000 });
    expect(proximosDaFaixa([dormindo], "previa", 1000, 3)).toHaveLength(0);
    expect(proximosDaFaixa([dormindo], "previa", 6000, 3)).toHaveLength(1);
  });

  it("quem escolheu primeiro sobe primeiro", () => {
    const antigo = item({ clientMediaId: "antigo", criadoEm: 1 });
    const novo = item({ clientMediaId: "novo", criadoEm: 99 });
    const ordem = proximosDaFaixa([novo, antigo], "previa", 1000, 2);
    expect(ordem.map(i => i.clientMediaId)).toEqual(["antigo", "novo"]);
  });
});

describe("concorrência", () => {
  it("prévia com 3 e original com 1", () => {
    expect(concorrencia(false)).toEqual({ previa: 3, original: 1 });
  });

  it("faixa lenta despriorizada, NUNCA recusada (RN-11)", () => {
    // Acima de 50 arquivos em 10 minutos a participação cai de faixa. Ela
    // continua enviando: o que muda é a concorrência, não o direito de mandar.
    expect(concorrencia(true)).toEqual({ previa: 1, original: 1 });
  });
});

describe("quando um item termina", () => {
  it("só com AS DUAS faixas confirmadas", () => {
    const soPrevia = item({
      faixas: { miniatura: "confirmada", previa: "confirmada", original: "pendente" },
    });
    expect(terminou(soPrevia)).toBe(false);

    const completo = item({
      faixas: { miniatura: "confirmada", previa: "confirmada", original: "confirmada" },
    });
    expect(terminou(completo)).toBe(true);
  });

  it("prévia pendente de servidor conta como terminada do lado do aparelho", () => {
    // Formato que o navegador não decodifica (B8, decisão P12): o original sobe,
    // a prévia é trabalho do cron. Manter o item na fila esperando por ela faria
    // o indicador dizer "faltam 6 fotos" para sempre, sem nada que o convidado
    // pudesse fazer.
    const exotico = item({
      faixas: {
        miniatura: "pendente_servidor",
        previa: "pendente_servidor",
        original: "confirmada",
      },
    });
    expect(terminou(exotico)).toBe(true);
  });
});

describe("validade das URLs assinadas", () => {
  it("com folga de 5 minutos antes de expirar", () => {
    const comUrl = item({
      midiaId: "m1",
      urls: { previa: "https://x" },
      urlsExpiramEm: 1_000_000,
    });
    expect(urlsValidas(comUrl, 1_000_000 - 6 * 60 * 1000)).toBe(true);
    // Dentro dos últimos 5 minutos já não vale: uma URL que expira no meio de um
    // envio de 40 MB falharia depois de a foto inteira ter subido, e o aparelho
    // pagaria o uplink duas vezes.
    expect(urlsValidas(comUrl, 1_000_000 - 60 * 1000)).toBe(false);
  });

  it("item sem intenção registrada nunca tem URL válida", () => {
    expect(urlsValidas(item(), 0)).toBe(false);
  });
});

describe("o resumo que a faixa mostra", () => {
  it("conta ITENS e a idade do mais velho", () => {
    const a = item({ clientMediaId: "a", criadoEm: 10_000 });
    const b = item({ clientMediaId: "b", criadoEm: 40_000 });
    const resumo = resumoDaFila([a, b], 70_000);
    expect(resumo.pendentes).toBe(2);
    expect(resumo.maisVelhoEmSegundos).toBe(60);
  });

  it("item terminado não conta", () => {
    const pronto = item({
      faixas: { miniatura: "confirmada", previa: "confirmada", original: "confirmada" },
    });
    expect(resumoDaFila([pronto], 0).pendentes).toBe(0);
  });
});
