import { describe, expect, it } from "vitest";

import { assinarPut, chavesDaMidia, extensaoDe, VALIDADE_DA_URL_SEGUNDOS } from "@/lib/r2";

/**
 * O LAYOUT DAS CHAVES E A ASSINATURA.
 *
 * O layout está fixado no PRD §5.5 e na migration 0006, e **mudar depois é
 * migração de blob**: copiar objeto por objeto, com o produto no ar e sem
 * transação. É a mudança mais cara que este produto tem disponível, e é o tipo
 * de coisa que alguém "arruma" numa tarde achando que está organizando.
 *
 * Por isso o layout é um teste, com os caminhos escritos por extenso.
 */

const CONFIGURACAO = {
  contaOuEndpoint: "https://conta.r2.cloudflarestorage.com",
  balde: "casa-nos",
  chaveDeAcesso: "AKIAIOSFODNN7EXAMPLE",
  segredo: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

const EVENTO = "11111111-1111-4111-8111-111111111111";
const MIDIA = "22222222-2222-4222-8222-222222222222";

describe("o layout das chaves (PRD §5.5)", () => {
  it("é exatamente e/<evento>/m/<midia>/{t,p,o}", () => {
    const chaves = chavesDaMidia(EVENTO, MIDIA, "image/jpeg");
    expect(chaves.miniatura).toBe(`e/${EVENTO}/m/${MIDIA}/t.jpg`);
    expect(chaves.previa).toBe(`e/${EVENTO}/m/${MIDIA}/p.jpg`);
    expect(chaves.original).toBe(`e/${EVENTO}/m/${MIDIA}/o.jpg`);
  });

  it("o prefixo por evento existe — é ele que torna a expiração dos 12 meses configuração", () => {
    const chaves = chavesDaMidia(EVENTO, MIDIA, "image/png");
    for (const chave of Object.values(chaves)) {
      expect(chave.startsWith(`e/${EVENTO}/`)).toBe(true);
    }
  });

  it("a chave contém o midia_id — é daí que sai a promessa de não haver objeto sem linha", () => {
    // Como o `midia_id` só existe depois da linha de intenção, não pode haver
    // objeto no R2 sem linha no banco. É o que transforma a reconciliação num
    // `HEAD` nas chaves esperadas em vez de uma varredura do balde (V3).
    expect(chavesDaMidia(EVENTO, MIDIA, "image/jpeg").previa).toContain(MIDIA);
  });

  it("tipo de arquivo desconhecido não vira extensão livre", () => {
    // A extensão entra numa chave de objeto e o tipo vem do aparelho, ou seja, é
    // entrada de usuário. Sem lista fechada, `image/../../etc` seria travessia
    // de caminho dentro do balde.
    expect(extensaoDe("image/../../etc")).toBe("bin");
    expect(extensaoDe(null)).toBe("bin");
    expect(extensaoDe("image/heic")).toBe("heic");
  });
});

describe("a URL assinada", () => {
  const agora = new Date("2027-08-22T18:30:00.000Z");

  it("carrega os cinco parâmetros da SigV4 e a assinatura", async () => {
    const url = await assinarPut(CONFIGURACAO, `e/${EVENTO}/m/${MIDIA}/p.jpg`, agora);
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Credential=");
    expect(url).toContain("X-Amz-Date=20270822T183000Z");
    expect(url).toContain(`X-Amz-Expires=${VALIDADE_DA_URL_SEGUNDOS}`);
    expect(url).toContain("X-Amz-SignedHeaders=host");
    expect(url).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/);
  });

  it("vale 24 horas, e isso é decisão de produto (P10)", () => {
    // Com uma hora — o padrão que todo mundo copia — a foto de quem ficou sem
    // rede às 23h viraria erro permanente às 00h01, no produto cujo eixo é
    // justamente sobreviver a isso.
    expect(VALIDADE_DA_URL_SEGUNDOS).toBe(24 * 60 * 60);
  });

  it("é determinística: mesma entrada, mesma assinatura", async () => {
    const a = await assinarPut(CONFIGURACAO, "e/x/m/y/p.jpg", agora);
    const b = await assinarPut(CONFIGURACAO, "e/x/m/y/p.jpg", agora);
    expect(a).toBe(b);
  });

  it("chave diferente produz assinatura diferente", async () => {
    const a = await assinarPut(CONFIGURACAO, "e/x/m/y/p.jpg", agora);
    const b = await assinarPut(CONFIGURACAO, "e/x/m/y/t.jpg", agora);
    expect(a).not.toBe(b);
  });

  it("o segredo NÃO aparece na URL", async () => {
    // Óbvio de dizer e fácil de errar com uma interpolação: a URL vai para o
    // navegador do convidado e para o log de qualquer proxy no caminho.
    const url = await assinarPut(CONFIGURACAO, "e/x/m/y/p.jpg", agora);
    expect(url).not.toContain(CONFIGURACAO.segredo);
    expect(url).not.toContain("wJalrXUtnFEMI");
  });

  it("o balde e o caminho entram na URL, sem barra dobrada", async () => {
    const url = await assinarPut(CONFIGURACAO, "e/x/m/y/p.jpg", agora);
    expect(url).toContain("/casa-nos/e/x/m/y/p.jpg?");
    expect(url.replace("https://", "")).not.toContain("//");
  });
});
