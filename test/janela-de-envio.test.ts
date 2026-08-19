import { describe, expect, it } from "vitest";

import {
  instanteDoEvento,
  instanteDoInputLocal,
  janelaDeEnvioPadrao,
  paraInputLocal,
  somarDias,
} from "@/lib/datas";
import type { Evento } from "@/lib/eventos";
import { estadoDoEnvio, janelaDoEvento } from "@/lib/janela";

/**
 * A JANELA DE ENVIO — o mesmo instante em UTC e em Brasília (RN-08).
 *
 * ESTE ARQUIVO RODA EM `TZ=UTC` (é o padrão dos projetos do vitest, e é como a
 * Vercel roda). O arquivo irmão, `janela-de-envio.brasilia.test.ts`, roda os
 * MESMOS números em `TZ=America/Sao_Paulo` — que é como roda a máquina de quem
 * desenvolve. Os dois precisam concordar.
 *
 * POR QUE DOIS ARQUIVOS E NÃO UM: um teste que roda só no fuso de quem escreve é
 * um teste que nunca vê o defeito. Toda a classe de bug de data deste produto —
 * a página anunciar 21 de agosto para um casamento no dia 22, meia festa cair no
 * dia seguinte — só existe quando o processo está em UTC.
 */

const DIA = "2027-08-22"; // domingo

const ESPERADO = {
  // D-1 às 00:00 em São Paulo = 21/08 03:00 UTC (UTC-3).
  abre: "2027-08-21T03:00:00.000Z",
  // D+7 às 23:59:59 em São Paulo = 30/08 02:59:59 UTC.
  fecha: "2027-08-30T02:59:59.000Z",
};

describe("aritmética de calendário", () => {
  it("soma dias sem passar por instante", () => {
    expect(somarDias(DIA, -1)).toBe("2027-08-21");
    expect(somarDias(DIA, 7)).toBe("2027-08-29");
  });

  it("vira o mês e o ano sem caso especial", () => {
    expect(somarDias("2027-12-31", 7)).toBe("2028-01-07");
    expect(somarDias("2027-03-01", -1)).toBe("2027-02-28");
  });
});

describe("a janela padrão", () => {
  it("abre D-1 00:00 e fecha D+7 23:59:59, no fuso do evento", () => {
    const janela = janelaDeEnvioPadrao(DIA, "America/Sao_Paulo");
    expect(janela.abre.toISOString()).toBe(ESPERADO.abre);
    expect(janela.fecha.toISOString()).toBe(ESPERADO.fecha);
  });

  it("o último segundo do sétimo dia AINDA está dentro", () => {
    // Sem os segundos no cálculo, quem manda 23:59:30 do sétimo dia receberia
    // "fora da janela" — e não haveria erro nenhum aparecendo em lugar nenhum.
    const janela = janelaDeEnvioPadrao(DIA, "America/Sao_Paulo");
    const ultimoInstante = instanteDoEvento("2027-08-29", "23:59:30", "America/Sao_Paulo");
    expect(ultimoInstante <= janela.fecha).toBe(true);
  });

  it("00:30 do dia SEGUINTE à festa é aceito (RN-08)", () => {
    const janela = janelaDeEnvioPadrao(DIA, "America/Sao_Paulo");
    const madrugada = instanteDoEvento("2027-08-23", "00:30", "America/Sao_Paulo");
    expect(madrugada >= janela.abre && madrugada <= janela.fecha).toBe(true);
  });
});

describe("ida e volta do campo do formulário", () => {
  it("o instante volta como horário LOCAL DO EVENTO, não como UTC", () => {
    // Se isto mostrasse UTC, o casal veria a janela dele começando às 03:00 do
    // dia 21 — e "corrigir" para 00:00 moveria a janela real em três horas.
    const janela = janelaDeEnvioPadrao(DIA, "America/Sao_Paulo");
    expect(paraInputLocal(janela.abre, "America/Sao_Paulo")).toBe("2027-08-21T00:00");
  });

  it("o que o campo manda volta a ser o mesmo instante", () => {
    const ida = paraInputLocal(new Date(ESPERADO.abre), "America/Sao_Paulo");
    const volta = instanteDoInputLocal(ida, "America/Sao_Paulo");
    expect(volta?.toISOString()).toBe(ESPERADO.abre);
  });

  it("data incompleta devolve nulo, e vira erro de campo — nunca exceção", () => {
    expect(instanteDoInputLocal("2027-08-", "America/Sao_Paulo")).toBeNull();
    expect(instanteDoInputLocal("", "America/Sao_Paulo")).toBeNull();
    expect(instanteDoInputLocal(null, "America/Sao_Paulo")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * O estado que a tela e a rota leem
 * ------------------------------------------------------------------ */

const EVENTO: Evento = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "ana-e-max",
  nomeCasal: "Ana Flávia e Maxwel",
  dataEvento: DIA,
  fuso: "America/Sao_Paulo",
  horaEvento: null,
  horaPublicada: false,
  cidade: "Rio de Janeiro",
  uf: "RJ",
  localNome: null,
  localNomePublicado: false,
  localEndereco: null,
  localLatitude: null,
  localLongitude: null,
  localRaioMetros: null,
  localRevelacao: "oculto",
  publicado: true,
  modoModeracao: "direto",
  envioAbreEm: null,
  envioFechaEm: null,
  enviosEncerradosEm: null,
  novosAparelhosBloqueados: false,
  inicioFestaEm: null,
  fimFestaEm: null,
  presentesContagem: null,
  emailCasal: null,
};

describe("estado do envio", () => {
  it("evento sem janela configurada cai no padrão calculado", () => {
    const janela = janelaDoEvento(EVENTO);
    expect(janela.abre.toISOString()).toBe(ESPERADO.abre);
  });

  it("dentro da janela, aberto", () => {
    const durante = new Date("2027-08-22T23:00:00.000Z");
    expect(estadoDoEnvio(EVENTO, durante, true)).toBe("aberto");
  });

  /**
   * ANTES E DEPOIS SÃO **ESTADOS DIFERENTES**, e a separação nasceu de um
   * defeito real da F1.2.
   *
   * Até aqui os dois instantes opostos devolviam o mesmo valor, e a tela dizia
   * *"Os envios deste casamento foram encerrados"* para quem chegou na
   * antevéspera. Falso e desanimador ao mesmo tempo — e para quem tinha feito a
   * coisa certa, porque chegar cedo é o comportamento que o produto quer.
   *
   * Este teste existe para que "unificar os dois de novo" seja uma falha de CI e
   * não um refinamento que parece limpeza.
   */
  it("antes da janela é um estado próprio, e não o mesmo de depois", () => {
    expect(estadoDoEnvio(EVENTO, new Date("2027-08-01T12:00:00.000Z"), true)).toBe(
      "antes_da_janela"
    );
    expect(estadoDoEnvio(EVENTO, new Date("2027-09-01T12:00:00.000Z"), true)).toBe(
      "fora_da_janela"
    );
  });

  it("o interruptor do casal encerra antes do fim da janela", () => {
    const encerrado = {
      ...EVENTO,
      enviosEncerradosEm: new Date("2027-08-22T20:00:00.000Z"),
    };
    expect(estadoDoEnvio(encerrado, new Date("2027-08-22T23:00:00.000Z"), true)).toBe(
      "fora_da_janela"
    );
  });

  it("aparelhos novos bloqueados NÃO derruba quem já está enviando (B14)", () => {
    const bloqueado = { ...EVENTO, novosAparelhosBloqueados: true };
    const durante = new Date("2027-08-22T23:00:00.000Z");
    expect(estadoDoEnvio(bloqueado, durante, true)).toBe("aberto");
    expect(estadoDoEnvio(bloqueado, durante, false)).toBe("aparelho_novo_bloqueado");
  });
});
