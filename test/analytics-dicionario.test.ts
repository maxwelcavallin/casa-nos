import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { mesParaOGa4 } from "@/lib/analytics";

/**
 * O DICIONÁRIO É O CONTRATO, E ELE FECHA NA F1.6 (H-17).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRÊS COISAS SÃO IRREVERSÍVEIS NO GA4, e as três são baratas de evitar aqui:
 *
 * 1. **Evento que não está no dicionário.** Ele viaja, é aceito, e some do
 *    relatório — `recomendation_opened` com um M é um evento novo e válido.
 * 2. **Parâmetro com texto livre.** Dimensão personalizada envenenada não se
 *    limpa, e o teto de 50 não perdoa uma cheia de lixo (`metricas.md` §13.9).
 * 3. **Passado não preenchido.** O que vazou hoje não se apaga amanhã, e o
 *    casamento não se repete.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const FONTE = fs.readFileSync(path.join(RAIZ, "lib", "analytics.ts"), "utf8");
const DOCUMENTO = fs.readFileSync(path.join(RAIZ, "docs", "analytics.md"), "utf8");

/** O bloco `export type EventosDeAnalytics = { ... }`. */
function blocoDaUniao(): string {
  const inicio = FONTE.indexOf("export type EventosDeAnalytics");
  const fim = FONTE.indexOf("\n};", inicio);
  return FONTE.slice(inicio, fim);
}

/** Os nomes de evento declarados na união. */
function eventosDeclarados(): string[] {
  return [...blocoDaUniao().matchAll(/^ {2}([a-z_]+):\s*\{/gm)].map(a => a[1]);
}

/**
 * Os 16 eventos da Fatia 1 (`metricas.md` §6), menos `sign_up` e
 * `wedding_created`, que vão para a Fatia 2 (V8) — e mais os três que já estavam
 * no ar desde a Fatia 0.
 *
 * `page_view` não está aqui porque ele sai do `config`, não do `enviarEvento`.
 * `couple_activated` não está porque **não é evento de GA4**: é marco derivado
 * em SQL (`metricas.md` §6.3).
 */
const ESPERADOS = [
  // Fatia 0, no ar
  "map_opened",
  "recommendation_opened",
  // Fatia 1 — o convidado
  "media_upload_started",
  "media_upload_succeeded",
  "media_upload_retried",
  "media_upload_abandoned",
  "media_picker_opened",
  "guest_identified",
  "media_visibility_changed",
  "album_opened",
  "growth_cta_viewed",
  "growth_cta_clicked",
  "growth_lead_captured",
  // Fatia 1 — o casal
  "guest_list_imported",
  "qr_material_downloaded",
  "media_moderated",
  /**
   * v1.0, V-11 — o site vai ao ar. É o primeiro evento do produto que não é da
   * Fatia 1, e ele entra com a história que o emite, não antes: um nome
   * declarado e nunca emitido fica no relatório com zero ocorrências para
   * sempre, e daqui a um ano alguém gasta uma tarde procurando o que quebrou.
   */
  "site_published",
];

describe("a união de tipos é o dicionário", () => {
  it("declara exatamente os eventos da Fatia 1, e nenhum a mais", () => {
    expect([...eventosDeclarados()].sort()).toEqual([...ESPERADOS].sort());
  });

  it("todo evento declarado está escrito em `docs/analytics.md`", () => {
    /**
     * O documento é a fonte em linguagem de negócio; a união é a executável.
     * Um evento que existe só no código é um evento que ninguém sabe ler em três
     * meses — e a regra do `metricas.md` §6 é literal: *"nada existe fora desta
     * tabela"*.
     */
    const ausentes = eventosDeclarados().filter(nome => !DOCUMENTO.includes(`\`${nome}\``));
    expect(
      ausentes,
      "Estes eventos existem no código e não estão em docs/analytics.md:\n" +
        ausentes.map(n => `  - ${n}`).join("\n")
    ).toEqual([]);
  });

  it("os eventos da Fatia 2 e 3 **não** estão declarados", () => {
    // Valor morto tem o mesmo prazo do valor que falta: dimensão registrada com
    // um valor que o produto não emite fica no relatório para sempre, com zero
    // ocorrências, e daqui a um ano alguém gasta uma tarde procurando o que
    // quebrou.
    for (const nome of ["sign_up", "wedding_created", "rsvp_submitted", "purchase"]) {
      expect(eventosDeclarados()).not.toContain(nome);
    }
  });
});

describe("nenhum parâmetro recebe texto livre (§13.9)", () => {
  /**
   * Os únicos campos de tipo `string` aceitos, com o motivo de cada um. Qualquer
   * outro precisa ser união de literais — ou seja, uma lista fechada que o `tsc`
   * confere.
   */
  const STRINGS_PERMITIDAS: Record<string, string> = {
    wedding_id:
      "uuid do evento. Dado de inquilino, não de pessoa, e é dele que sai a máscara da URL.",
    expected_month:
      "AAAA-MM, e passa por `mesParaOGa4` antes de sair — validado no envio, não no tipo.",
  };

  it("todo campo `string` do dicionário está na lista, com motivo", () => {
    const bloco = blocoDaUniao();
    const campos = [...bloco.matchAll(/^ {4}([a-z_]+)\??:\s*(.+?);$/gm)].map(a => ({
      nome: a[1],
      tipo: a[2].trim(),
    }));

    const livres = campos
      .filter(campo => campo.tipo === "string")
      .filter(campo => !(campo.nome in STRINGS_PERMITIDAS))
      .map(campo => campo.nome);

    expect(
      livres,
      "Estes parâmetros aceitam texto livre:\n" +
        livres.map(n => `  - ${n}`).join("\n") +
        "\n\nParâmetro do dicionário é lista fechada (união de literais). Texto\n" +
        "livre digitado por usuário numa dimensão do GA4 é dado envenenado que\n" +
        "não se limpa, e o teto de 50 dimensões não perdoa uma cheia de lixo.\n" +
        "Se houver motivo real, declare em STRINGS_PERMITIDAS com a explicação."
    ).toEqual([]);
  });

  it("`expected_month` só passa no formato — e o resto vira vazio", () => {
    /**
     * A última barreira antes do GA4. O campo é um seletor, mas o valor
     * atravessa estado de React, `localStorage` e uma resposta de API antes de
     * chegar aqui, e qualquer um dos três pode ter sido adulterado no aparelho.
     */
    expect(mesParaOGa4("2027-04")).toBe("2027-04");
    expect(mesParaOGa4("2027-13")).toBe("");
    expect(mesParaOGa4("casamento da Júlia em abril")).toBe("");
    expect(mesParaOGa4(undefined)).toBe("");
    expect(mesParaOGa4(42)).toBe("");
  });

  it("nenhum campo do dicionário se chama como PII", () => {
    /**
     * Nome, telefone, e-mail e rótulo não entram em parâmetro nenhum (RN-24). O
     * rótulo de convidado é PII de **terceiro**: ele nem escolheu estar ali.
     *
     * Os COMENTÁRIOS saem antes da varredura, e é de propósito: o comentário de
     * `growth_lead_captured` **precisa** dizer "o WhatsApp não está aqui, e
     * nunca estará". Documentar a proibição não é cometê-la — e uma catraca que
     * reprovasse a própria explicação seria desligada no primeiro dia.
     */
    const bloco = blocoDaUniao()
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .toLowerCase();
    for (const proibido of [
      "nome",
      "name:",
      "telefone",
      "phone",
      "email",
      "contato",
      "whatsapp",
      "rotulo",
      "label:",
    ]) {
      expect(bloco, `o dicionário tem um campo "${proibido}"`).not.toContain(proibido);
    }
  });
});

describe("o quarto valor de `error_kind`", () => {
  it("`portal` viaja com o próprio nome, dos dois lados", () => {
    /**
     * `rede` é a internet que caiu — a resposta certa é não fazer nada. `portal`
     * é a internet que **mentiu**, e é o único erro que produz perda silenciosa.
     * A palavra tem que ser a mesma no banco e no relatório (`metricas.md` §5,
     * regra 3), senão os dois chamam coisas diferentes pelo mesmo nome.
     */
    expect(blocoDaUniao()).toMatch(
      /error_kind:\s*"rede"\s*\|\s*"portal"\s*\|\s*"servidor"\s*\|\s*"arquivo"/
    );

    const migration = fs.readFileSync(
      path.join(RAIZ, "db", "migrations", "0011_portal_cativo.sql"),
      "utf8"
    );
    expect(migration).toMatch(/check \(tipo_erro in \('rede', 'portal', 'servidor', 'arquivo'\)\)/);
  });

  it("a ressalva do portal está escrita onde alguém vai lê-la", () => {
    /**
     * Num portal cativo a requisição para o `/g/collect` também é interceptada:
     * **o evento que descreve o portal é o que o portal engole**. Este valor é
     * subnotificado por construção no GA4 — quando aparece já é diagnóstico,
     * quando não aparece não prova nada. A contagem que vale é a do Postgres.
     *
     * O comentário é a única coisa que impede a próxima pessoa de olhar o GA4,
     * ver zero, e concluir que não houve portal.
     */
    expect(FONTE).toMatch(/o portal engole/);
    expect(
      fs.readFileSync(path.join(RAIZ, "lib", "medicao.ts"), "utf8")
    ).toMatch(/o portal engole/);
  });
});

/**
 * OS SILÊNCIOS DA v1.0 (V-13).
 *
 * Um evento com zero ocorrências no relatório é indistinguível de um evento
 * quebrado, e a diferença entre os dois custa uma tarde a quem investiga. Os
 * três silêncios desta versão são decisões — não esquecimentos —, e a única
 * defesa contra alguém "consertá-los" daqui a seis meses é o motivo estar
 * escrito no lugar onde o evento seria procurado.
 */
describe("os silêncios da v1.0 estão escritos no dicionário", () => {
  it("`wedding_created` não é emitido, e o documento diz por quê", () => {
    expect(DOCUMENTO).toMatch(/`wedding_created` não é emitido/);
    expect(DOCUMENTO).toMatch(/db:bootstrap/);
  });

  it("os zeros do álbum são a flag desligada, e não instrumentação quebrada", () => {
    expect(DOCUMENTO).toMatch(/álbum continuam declarados e não são emitidos/);
    expect(DOCUMENTO).toMatch(/album_ativo/);
  });

  it("a galeria não emite evento, e a decisão vira pergunta e não invenção", () => {
    /**
     * O caso mais fácil de errar dos três: a história tinha um botão de envio na
     * mão, e nomear `photo_uploaded` ali custaria trinta segundos. O nome entra
     * no relatório para sempre, com o parâmetro que a pressa daquele dia
     * escolher — por isso vira Q-V8 para quem escreve métrica, e não decisão de
     * quem estava implementando o botão.
     */
    expect(DOCUMENTO).toMatch(/galeria do casal \(V-18 e V-19\) não emite evento/);
    expect(DOCUMENTO).toMatch(/Q-V8/);
    expect(eventosDeclarados()).not.toContain("photo_uploaded");
  });

  it("a prévia não emite `page_view`, e a palavra dela é legível de propósito", () => {
    expect(DOCUMENTO).toMatch(/prévia \(V-10\) não emite `page_view`/);
  });
});
