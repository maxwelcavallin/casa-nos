import { afterEach, describe, expect, it } from "vitest";

import {
  assinarDownload,
  assinarPut,
  chavesDaMidia,
  extensaoDe,
  PREFIXO_PRIVADO,
  PREFIXO_PUBLICO,
  urlDeLeitura,
  urlPublicaDeFeed,
  VALIDADE_DA_LEITURA_SEGUNDOS,
  VALIDADE_DA_URL_SEGUNDOS,
} from "@/lib/r2";

/**
 * O LAYOUT DAS CHAVES, A ASSINATURA, E A FRONTEIRA DE PRIVACIDADE (RN-33).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O layout está fixado no PRD §5.5, na migration 0006 e na RN-33, e **mudar
 * depois é migração de blob**: copiar objeto por objeto, com o produto no ar e
 * sem transação. É a mudança mais cara que este produto tem, e é o tipo de coisa
 * que alguém "arruma" numa tarde achando que está organizando.
 *
 * A partir de 19/08/2026 ele carrega uma decisão de segurança: **`pub/` é
 * servido publicamente e `prv/` não é servido por ninguém sem assinatura de 15
 * minutos.** A separação existe porque o produto imprime na tela *"Só os noivos
 * veem esta foto"*, e a primeira redação do ADR 0005 aceitava, de olhos abertos,
 * que quem tivesse a URL exata visse a foto sem sessão. Uma promessa que depende
 * de ninguém descobrir a URL é falsa por construção.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CONFIGURACAO = {
  contaOuEndpoint: "https://conta.r2.cloudflarestorage.com",
  balde: "casa-nos",
  chaveDeAcesso: "AKIAIOSFODNN7EXAMPLE",
  segredo: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

const EVENTO = "11111111-1111-4111-8111-111111111111";
const MIDIA = "22222222-2222-4222-8222-222222222222";

const BASE_PUBLICA = process.env.R2_PUBLIC_BASE;

afterEach(() => {
  if (BASE_PUBLICA === undefined) delete process.env.R2_PUBLIC_BASE;
  else process.env.R2_PUBLIC_BASE = BASE_PUBLICA;
  delete process.env.R2_ENDPOINT;
  delete process.env.R2_BUCKET;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
});

function configurarR2() {
  process.env.R2_ENDPOINT = CONFIGURACAO.contaOuEndpoint;
  process.env.R2_BUCKET = CONFIGURACAO.balde;
  process.env.R2_ACCESS_KEY_ID = CONFIGURACAO.chaveDeAcesso;
  process.env.R2_SECRET_ACCESS_KEY = CONFIGURACAO.segredo;
}

describe("o layout das chaves (PRD §5.5, RN-33)", () => {
  it("mídia `feed`: derivadas em pub/, original em prv/", () => {
    const chaves = chavesDaMidia(EVENTO, MIDIA, "image/jpeg", "feed");
    expect(chaves.miniatura).toBe(`pub/e/${EVENTO}/m/${MIDIA}/t.jpg`);
    expect(chaves.previa).toBe(`pub/e/${EVENTO}/m/${MIDIA}/p.jpg`);
    // O ORIGINAL NUNCA É PÚBLICO, em visibilidade nenhuma: ele carrega EXIF,
    // inclusive GPS (RN-18), e nunca é servido numa grade.
    expect(chaves.original).toBe(`prv/e/${EVENTO}/m/${MIDIA}/o.jpg`);
  });

  it("mídia `noivos`: **tudo** em prv/", () => {
    const chaves = chavesDaMidia(EVENTO, MIDIA, "image/jpeg", "noivos");
    for (const chave of Object.values(chaves)) {
      expect(chave.startsWith(`${PREFIXO_PRIVADO}/`)).toBe(true);
    }
  });

  it("o prefixo por evento existe nos DOIS lados — é ele que torna a expiração dos 12 meses configuração", () => {
    // São duas regras de ciclo de vida agora, uma por prefixo. O README diz.
    for (const visibilidade of ["feed", "noivos"] as const) {
      for (const chave of Object.values(chavesDaMidia(EVENTO, MIDIA, "image/png", visibilidade))) {
        expect(chave).toMatch(new RegExp(`^(${PREFIXO_PUBLICO}|${PREFIXO_PRIVADO})/e/${EVENTO}/`));
      }
    }
  });

  it("a chave contém o midia_id — é daí que sai a promessa de não haver objeto sem linha", () => {
    // Como o `midia_id` só existe depois da linha de intenção, não pode haver
    // objeto no R2 sem linha no banco. É o que transforma a reconciliação num
    // `HEAD` nas chaves esperadas em vez de uma varredura do balde (V3).
    expect(chavesDaMidia(EVENTO, MIDIA, "image/jpeg", "feed").previa).toContain(MIDIA);
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

describe("a fronteira de privacidade — a foto `noivos` não vaza", () => {
  it("o endereço público de uma mídia `feed` aponta para pub/", () => {
    process.env.R2_PUBLIC_BASE = "https://fotos.casa-nos.app";
    expect(urlPublicaDeFeed(EVENTO, MIDIA, "miniatura")).toBe(
      `https://fotos.casa-nos.app/pub/e/${EVENTO}/m/${MIDIA}/t.jpg`
    );
  });

  it("**a leitura de `noivos` NUNCA usa a base pública**", async () => {
    /**
     * O teste que a correção de 19/08/2026 existe para tornar possível. Com a
     * base pública configurada e o R2 configurado, a URL de uma foto `noivos`
     * não pode conter o domínio público em forma nenhuma — nem como prefixo,
     * nem como parâmetro.
     */
    process.env.R2_PUBLIC_BASE = "https://fotos.casa-nos.app";
    configurarR2();

    const url = await urlDeLeitura(EVENTO, MIDIA, "previa", "noivos");
    expect(url).not.toBeNull();
    expect(url).not.toContain("fotos.casa-nos.app");
    expect(url).toContain(`${PREFIXO_PRIVADO}/e/${EVENTO}/`);
    expect(url).toContain("X-Amz-Signature=");
  });

  it("**sem credencial do R2, a foto `noivos` não tem endereço nenhum**", async () => {
    /**
     * O caso que separa "degradar" de "vazar". Sem R2 configurado, a base
     * pública sozinha **não** pode virar a saída de emergência de uma foto
     * privada: a resposta é `null`, a grade renderiza o tile sem imagem, e nada
     * quebra. Uma implementação que caísse para a base pública aqui reabriria o
     * buraco inteiro no primeiro ambiente mal configurado.
     */
    process.env.R2_PUBLIC_BASE = "https://fotos.casa-nos.app";
    expect(await urlDeLeitura(EVENTO, MIDIA, "previa", "noivos")).toBeNull();
    // E a de `feed` continua funcionando — é o lado certo de degradar.
    expect(await urlDeLeitura(EVENTO, MIDIA, "previa", "feed")).not.toBeNull();
  });

  it("a URL assinada de `noivos` vale 15 minutos, e é a mesma vida do download", async () => {
    configurarR2();
    const url = await urlDeLeitura(EVENTO, MIDIA, "miniatura", "noivos");
    expect(url).toContain(`X-Amz-Expires=${VALIDADE_DA_LEITURA_SEGUNDOS}`);
    expect(VALIDADE_DA_LEITURA_SEGUNDOS).toBe(15 * 60);
  });

  it("sem base pública, nem a mídia `feed` tem endereço — e nada quebra", () => {
    delete process.env.R2_PUBLIC_BASE;
    expect(urlPublicaDeFeed(EVENTO, MIDIA, "previa")).toBeNull();
  });
});

describe("a URL assinada", () => {
  const agora = new Date("2027-08-22T18:30:00.000Z");

  it("carrega os cinco parâmetros da SigV4 e a assinatura", async () => {
    const url = await assinarPut(CONFIGURACAO, `pub/e/${EVENTO}/m/${MIDIA}/p.jpg`, agora);
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Credential=");
    expect(url).toContain("X-Amz-Date=20270822T183000Z");
    expect(url).toContain(`X-Amz-Expires=${VALIDADE_DA_URL_SEGUNDOS}`);
    expect(url).toContain("X-Amz-SignedHeaders=host");
    expect(url).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/);
  });

  it("vale 24 horas para o `PUT`, e isso é decisão de produto (P10)", () => {
    // Com uma hora — o padrão que todo mundo copia — a foto de quem ficou sem
    // rede às 23h viraria erro permanente às 00h01, no produto cujo eixo é
    // justamente sobreviver a isso.
    expect(VALIDADE_DA_URL_SEGUNDOS).toBe(24 * 60 * 60);
  });

  it("é determinística: mesma entrada, mesma assinatura", async () => {
    const a = await assinarPut(CONFIGURACAO, "pub/e/x/m/y/p.jpg", agora);
    const b = await assinarPut(CONFIGURACAO, "pub/e/x/m/y/p.jpg", agora);
    expect(a).toBe(b);
  });

  it("**prefixo diferente produz assinatura diferente** — a cópia não é reaproveitável", async () => {
    const publica = await assinarPut(CONFIGURACAO, "pub/e/x/m/y/p.jpg", agora);
    const privada = await assinarPut(CONFIGURACAO, "prv/e/x/m/y/p.jpg", agora);
    expect(publica).not.toBe(privada);
  });

  it("o segredo NÃO aparece na URL", async () => {
    // Óbvio de dizer e fácil de errar com uma interpolação: a URL vai para o
    // navegador do convidado e para o log de qualquer proxy no caminho.
    const url = await assinarPut(CONFIGURACAO, "pub/e/x/m/y/p.jpg", agora);
    expect(url).not.toContain(CONFIGURACAO.segredo);
    expect(url).not.toContain("wJalrXUtnFEMI");
  });

  it("o balde e o caminho entram na URL, sem barra dobrada", async () => {
    const url = await assinarPut(CONFIGURACAO, "pub/e/x/m/y/p.jpg", agora);
    expect(url).toContain("/casa-nos/pub/e/x/m/y/p.jpg?");
    expect(url.replace("https://", "")).not.toContain("//");
  });

  it("o download assina o nome do arquivo JUNTO — quem tem o link não o reescreve", async () => {
    /**
     * `response-content-disposition` entra **dentro** da assinatura. Fora dela,
     * qualquer um com o link trocaria o nome do arquivo que a pessoa baixa — e
     * o nome é a única coisa que ela vê antes de salvar.
     */
    const url = await assinarDownload(
      CONFIGURACAO,
      EVENTO,
      MIDIA,
      "image/jpeg",
      "noivos",
      "original",
      agora
    );
    expect(url).toContain("response-content-disposition=");
    expect(url).toContain(`X-Amz-Expires=${VALIDADE_DA_LEITURA_SEGUNDOS}`);
    expect(url).toContain("prv/");

    const semNome = await assinarDownload(
      CONFIGURACAO,
      EVENTO,
      MIDIA,
      "image/png",
      "noivos",
      "original",
      agora
    );
    // Extensão diferente → nome diferente → assinatura diferente.
    expect(semNome).not.toBe(url);
  });
});
