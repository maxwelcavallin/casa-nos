import { describe, expect, it } from "vitest";

import { ehIdNumerico, ehSlug, ehUuid, normalizarDominio } from "@/lib/ids";

/**
 * Os verificadores que impedem um 500 onde deveria haver um 404.
 *
 * `ehUuid` e `ehIdNumerico` ainda não têm chamador no produto — a primeira rota
 * de API nasce na Fatia 1. Estão testados desde já porque o caro é descobrir
 * que o verificador estava errado DEPOIS de confiar nele: um regex que recusa
 * uuid válido faria toda entidade responder "não encontrado".
 */

describe("ehUuid", () => {
  it("aceita uuid de verdade", () => {
    expect(ehUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(ehUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("recusa o que faria o Postgres estourar com 22P02", () => {
    for (const lixo of ["", "lixo", "11111111-1111-4111-8111", "undefined", null, 42]) {
      expect(ehUuid(lixo), String(lixo)).toBe(false);
    }
  });
});

describe("ehIdNumerico", () => {
  it("aceita inteiro em texto", () => {
    expect(ehIdNumerico("1")).toBe(true);
    expect(ehIdNumerico("9007199254740991")).toBe(true);
  });

  it("recusa o que vira NaN numa coluna integer", () => {
    for (const lixo of ["", " ", "1.5", "-1", "1e3", "abc", "NaN", null]) {
      expect(ehIdNumerico(lixo), String(lixo)).toBe(false);
    }
  });
});

describe("ehSlug", () => {
  it("aceita o formato que o produto usa", () => {
    expect(ehSlug("ana-e-max")).toBe(true);
    expect(ehSlug("bea2028")).toBe(true);
  });

  it("recusa travessia de caminho, hífen solto e caixa alta", () => {
    for (const lixo of ["", "a", "../etc", "Ana-E-Max", "-ana", "ana-", "ana--max", "ana max", "a".repeat(61)]) {
      expect(ehSlug(lixo), String(lixo)).toBe(false);
    }
  });
});

describe("normalizarDominio", () => {
  it("www, porta e caixa alta apontam para o mesmo casamento", () => {
    expect(normalizarDominio("www.anaemax.com.br")).toBe("anaemax.com.br");
    expect(normalizarDominio("AnaEMax.com.br:3000")).toBe("anaemax.com.br");
    expect(normalizarDominio("localhost:3000")).toBe("localhost");
  });

  it("host ausente ou malformado não vira consulta", () => {
    for (const lixo of [null, undefined, "", "  ", "casa nos", "http://anaemax.com.br"]) {
      expect(normalizarDominio(lixo), String(lixo)).toBeNull();
    }
  });
});
