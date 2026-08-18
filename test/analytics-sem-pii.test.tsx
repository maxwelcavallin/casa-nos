import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "@/components/Providers";
import { PaginaDoEvento } from "@/components/evento/PaginaDoEvento";
import { HOST_MASCARADO } from "@/lib/analytics-privacidade";
import type { EventoPublico, Indicacao } from "@/lib/eventos";

/**
 * NENHUMA PII SAI PARA O GA4 — verificado pelo que a página EMPILHA, não pelo
 * que o código parece fazer.
 *
 * O BUG QUE ESTE ARQUIVO EXISTE PARA IMPEDIR DE VOLTAR: o `gtag('config')` não
 * declarava `page_location`, e o gtag então lia a URL do navegador sozinho. A
 * URL é `/e/ana-e-max` e o título é "Ana Flávia e Maxwel · 22 de agosto de
 * 2027". O nome do casal ia para o Google em toda abertura de página, e ninguém
 * tinha pedido esse dado a ninguém. Não havia como perceber lendo o código: o
 * vazamento estava no campo que NÃO estava escrito.
 *
 * POR ISSO A VERIFICAÇÃO É POR OBSERVAÇÃO. O `dataLayer` é literalmente tudo o
 * que a página entrega ao `gtag.js` — a fila que ele consome para montar o hit.
 * O teste monta a tela de verdade, aciona os eventos de verdade, e depois varre
 * a fila inteira atrás das palavras que não podem estar lá. Uma regra de lint
 * ou uma revisão de código não pegariam um campo ausente; uma varredura do que
 * saiu, sim.
 */

const ID_DE_MEDICAO = "G-TESTE0000";

const EVENTO: EventoPublico = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "ana-e-max",
  nomeCasal: "Ana Flávia e Maxwel",
  dataEvento: "2027-08-22",
  dataPorExtensoFuso: "America/Sao_Paulo",
  horaEvento: "16:00:00",
  cidade: "Rio de Janeiro",
  uf: "RJ",
  localNome: "Nome do local já divulgado",
  localEndereco: "Rua Exemplo, 100",
  mapa: { latitude: -22.97, longitude: -43.37, precisao: "regiao", raioMetros: 4000 },
};

const INDICACOES: Indicacao[] = [
  {
    id: "aaaa1111-1111-4111-8111-111111111111",
    eventoId: EVENTO.id,
    tipo: "hospedagem",
    titulo: "Hotel de exemplo",
    descricao: "Uma linha de descrição.",
    referencia: "Barra da Tijuca",
    url: "https://exemplo.com.br",
    ordem: 1,
  },
];

/** O título real da página — o que `lib/metadados.ts` monta e o que vazava. */
const TITULO_REAL = "Ana Flávia e Maxwel · 22 de agosto de 2027";

/**
 * As palavras que não podem sair. Cada uma esteve, ou estaria, num hit real.
 */
const PROIBIDAS = [
  "ana-e-max", // o slug, no `page_location`
  "Ana Flávia", // o nome dela, no `page_title`
  "Maxwel", // o nome dele, no `page_title`
  "anaemax", // o domínio próprio, que é o nome do casal escrito junto
  "localhost", // o host real, seja ele qual for
  TITULO_REAL,
];

const AGORA = new Date("2026-08-18T12:00:00.000Z").getTime();

function montar() {
  return render(
    <Providers>
      <PaginaDoEvento evento={EVENTO} indicacoes={INDICACOES} agoraMs={AGORA} />
    </Providers>
  );
}

/** Tudo o que foi entregue ao gtag, como texto, para uma varredura só. */
function filaComoTexto(): string {
  return (window.dataLayer ?? [])
    .map(item => JSON.stringify(item, (_chave, valor) => valor))
    .join("\n");
}

type Comando = { comando: string; alvo: unknown; parametros: Record<string, unknown> };

function comandos(): Comando[] {
  return (window.dataLayer ?? []).map(item => {
    const args = Array.from(item as ArrayLike<unknown>);
    return {
      comando: String(args[0]),
      alvo: args[1],
      parametros: (args[2] ?? {}) as Record<string, unknown>,
    };
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", ID_DE_MEDICAO);
  window.dataLayer = [];
  delete window.gtag;
  delete window.__ga4Configurado;
  window.history.replaceState({}, "", `/e/${EVENTO.slug}`);
  document.title = TITULO_REAL;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a guarda do próprio teste", () => {
  /**
   * Sem estas duas afirmações, o arquivo passaria em verde no dia em que
   * alguém trocasse a URL do teste por `/` e o título por "casa-nos" — e o
   * produto voltaria a vazar com o CI aplaudindo. O teste precisa provar que o
   * ambiente que ele monta CONTÉM aquilo que ele procura.
   */
  it("a página realmente tem o nome do casal na URL e no título", () => {
    expect(window.location.pathname).toContain("ana-e-max");
    expect(document.title).toContain("Ana Flávia");
  });

  it("a fila recebeu comandos — se ficar vazia, o resto é falso positivo", () => {
    montar();
    expect(comandos().length).toBeGreaterThanOrEqual(3);
  });
});

describe("o que a página entrega ao GA4", () => {
  it("nenhuma palavra proibida aparece na fila inteira", () => {
    montar();

    // Os dois eventos que o produto tem hoje, acionados de verdade: o hit de
    // evento também carrega campos de página, e também precisa estar limpo.
    fireEvent.click(screen.getByRole("link", { name: /Abrir a região no mapa/ }));
    fireEvent.click(screen.getByRole("link", { name: /Abrir o site de Hotel de exemplo/ }));

    const fila = filaComoTexto();
    for (const proibida of PROIBIDAS) {
      expect(fila, `"${proibida}" saiu para o GA4:\n${fila}`).not.toContain(proibida);
    }
  });

  it("o primeiro comando é o consentimento negado, antes de qualquer hit", () => {
    montar();
    const primeiro = comandos()[0];

    // Ordem importa: `default` empilhado depois do `config` chega tarde, e o
    // primeiro `page_view` já saiu sob o padrão do gtag, que é `granted`.
    expect(primeiro.comando).toBe("consent");
    expect(primeiro.alvo).toBe("default");
    expect(primeiro.parametros).toMatchObject({
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  });

  it("o config manda os três campos de página, todos mascarados", () => {
    montar();
    const config = comandos().find(c => c.comando === "config");
    expect(config, "nenhum comando `config` na fila").toBeDefined();

    expect(config?.parametros.page_location).toBe(
      `https://${HOST_MASCARADO}/e/${EVENTO.id}`
    );
    expect(config?.parametros.page_title).toBe(`/e/${EVENTO.id}`);
    // Vazio, mas PRESENTE: omitir o campo faz o gtag ler `document.referrer`.
    expect(config?.parametros).toHaveProperty("page_referrer");
    expect(config?.parametros.wedding_id).toBe(EVENTO.id);
  });

  it("todo evento carrega os campos de página mascarados, não só o config", () => {
    montar();
    fireEvent.click(screen.getByRole("link", { name: /Abrir a região no mapa/ }));

    const evento = comandos().find(c => c.comando === "event" && c.alvo === "map_opened");
    expect(evento, "o evento map_opened não chegou à fila").toBeDefined();
    expect(evento?.parametros.page_location).toBe(
      `https://${HOST_MASCARADO}/e/${EVENTO.id}`
    );
    expect(evento?.parametros.page_title).toBe(`/e/${EVENTO.id}`);
    expect(evento?.parametros.map_precision).toBe("regiao");
  });

  it("sem id de medição, nada é enfileirado — nem um comando", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "");
    window.dataLayer = [];
    delete window.__ga4Configurado;
    delete window.gtag;

    montar();
    expect(window.dataLayer).toHaveLength(0);
  });

  it("montar duas vezes não configura duas vezes — page_view não dobra", () => {
    montar();
    const depoisDaPrimeira = comandos().filter(c => c.comando === "config").length;
    montar();
    const depoisDaSegunda = comandos().filter(c => c.comando === "config").length;

    expect(depoisDaPrimeira).toBe(1);
    expect(depoisDaSegunda).toBe(1);
  });
});
