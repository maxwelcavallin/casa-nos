import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "@/components/Providers";
import { PaginaDoEvento } from "@/components/evento/PaginaDoEvento";
import type { Executor } from "@/lib/db";
import { buscarEventoPorDominio, listarIndicacoes, recortePublico } from "@/lib/eventos";

/**
 * A PÁGINA COM O CONTEÚDO REAL DO CASAMENTO, do arquivo de seed até o texto na
 * tela.
 *
 * POR QUE ELE EXISTE: este projeto foi entregue sem credencial de banco, então
 * ninguém conseguiu abrir o site com os dados vindos do Neon antes do deploy. O
 * que dá para verificar sem credencial é todo o resto do caminho — e é bastante:
 * o arquivo de seed, o formato das linhas que ele grava, a consulta, o recorte
 * público e os componentes. O único trecho que fica sem cobertura é a viagem
 * pela rede até o Postgres.
 *
 * As linhas abaixo imitam o que o banco devolve, INCLUSIVE os tipos: `numeric`
 * chega como string, `date` e `time` chegam como texto puro. Imitar com os tipos
 * "bonitinhos" (número, Date) esconderia justamente a classe de bug que o
 * produto mais teme.
 *
 * Ele também é a catraca do arquivo de seed: mudar a data para `22/08/2027`
 * (formato brasileiro) ou apagar a cidade quebra aqui, e não em produção.
 */

/**
 * O INSTANTE DO TESTE, e por que ele precisa ser falso.
 *
 * ACHADO DE 19/08/2026, na Fatia 1: este arquivo passou no dia em que foi
 * escrito e falhou no dia seguinte, sozinho, sem ninguém tocar no código. O
 * `agoraMs` da primeira pintura estava pinado, mas a `ContagemRegressiva` é
 * componente de cliente e recalcula com `Date.now()` depois de montar — então o
 * que o teste conferia era o RELÓGIO DA MÁQUINA, não o produto.
 *
 * O defeito é do teste, não da página: a página está certa em atualizar sozinha.
 * Mas um teste que depende do dia em que roda é pior que nenhum — ele quebra o
 * CI sem defeito nenhum, e a reação natural de quem chega é afrouxar a asserção.
 *
 * `toFake: ["Date"]` congela só o relógio. Os temporizadores continuam reais,
 * porque a Testing Library depende deles para resolver as esperas.
 */
const AGORA = new Date("2026-08-18T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
});

afterEach(() => {
  vi.useRealTimers();
});

const SEED = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "..", "db", "seed", "casamento-ana-e-max.json"),
    "utf8"
  )
);

/** O que `scripts/seed.mjs` grava, do jeito que o driver devolve na leitura. */
function linhaDoBanco() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: SEED.slug,
    nome_casal: SEED.nomeCasal,
    data_evento: SEED.dataEvento,
    hora_evento: SEED.horaEvento,
    hora_publicada: SEED.horaPublicada,
    fuso: SEED.fuso,
    cidade: SEED.cidade,
    uf: SEED.uf,
    local_nome: SEED.localNome,
    local_nome_publicado: SEED.localNomePublicado,
    local_endereco: SEED.localEndereco,
    // `numeric(9,6)` chega como STRING. É assim que o Postgres responde.
    local_latitude: SEED.localLatitude === null ? null : String(SEED.localLatitude.toFixed(6)),
    local_longitude: SEED.localLongitude === null ? null : String(SEED.localLongitude.toFixed(6)),
    local_raio_metros: SEED.localRaioMetros,
    local_revelacao: SEED.localRevelacao,
    publicado: SEED.publicado,
  };
}

function bancoComOSeed(): Executor {
  const evento = linhaDoBanco();
  return (async (strings: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = strings.join(" ? ");
    if (/from evento_dominios/.test(texto)) {
      const dominio = String(valores[0]);
      const cadastrados = SEED.dominios.map((d: { dominio: string }) => d.dominio);
      return cadastrados.includes(dominio) ? [evento] : [];
    }
    if (/from evento_indicacoes/.test(texto)) {
      return SEED.indicacoes.map((ind: Record<string, unknown>, i: number) => ({
        id: `aaaa${i}111-1111-4111-8111-111111111111`,
        evento_id: evento.id,
        ...ind,
        ordem: ind.ordem ?? i + 1,
      }));
    }
    return [];
  }) as unknown as Executor;
}

async function montarComOSeed() {
  const exec = bancoComOSeed();
  const evento = await buscarEventoPorDominio(SEED.dominios[0].dominio, exec);
  if (!evento) throw new Error("O seed não resolveu por domínio.");
  const indicacoes = await listarIndicacoes(evento.id, exec);

  return render(
    <Providers>
      <PaginaDoEvento
        evento={recortePublico(evento)}
        indicacoes={indicacoes}
        agoraMs={AGORA.getTime()}
      />
    </Providers>
  );
}

describe("a página de anaemax.com.br, com o conteúdo do arquivo de seed", () => {
  it("mostra os nomes do casal", async () => {
    await montarComOSeed();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ana Flávia e Maxwel"
    );
  });

  it("mostra 22 de agosto de 2027, um domingo — e não o dia 21", async () => {
    await montarComOSeed();
    expect(screen.getByText("domingo, 22 de agosto de 2027")).toBeInTheDocument();
    expect(screen.queryByText(/21 de agosto/)).not.toBeInTheDocument();
  });

  it("conta os dias que faltam", async () => {
    await montarComOSeed();
    const contador = screen.getByRole("timer");
    // De 18/08/2026 12h UTC até 22/08/2027 03h UTC: 368 dias e um resto.
    expect(contador.getAttribute("aria-label")).toMatch(/^Faltam 368 dias, /);
  });

  it("diz a cidade e assume que o local e o horário ainda não foram definidos", async () => {
    await montarComOSeed();
    expect(screen.getByText(/falta confirmar o local e o horário/)).toBeInTheDocument();
  });

  it("mostra o mapa da REGIÃO, sem marcador e sem endereço", async () => {
    const { container } = await montarComOSeed();
    expect(
      screen.getByRole("img", {
        name: "Mapa da região aproximada do casamento, sem o local exato",
      })
    ).toBeInTheDocument();

    // Nenhum pin desenhado sobre as tiles: o que marca a região é a área, e o
    // ponto guardado é o centro aproximado de 4 km, não o endereço. (O ícone do
    // BOTÃO "abrir a região" é outro elemento e continua existindo — por isso a
    // busca é dentro do mapa, e não na página inteira.)
    const mapa = container.querySelector("[data-mapa]")!;
    expect(mapa.querySelector("[data-pin-do-local]")).toBeNull();
    expect(mapa.querySelector("[data-area-da-regiao]")).not.toBeNull();

    // E o link externo também não pode cravar pin: `mlat`/`mlon` fazem o
    // OpenStreetMap marcar o ponto — apontaria com ar de precisão para o lugar
    // errado.
    const link = screen.getByRole("link", { name: /Abrir a região no mapa/ });
    expect(link.getAttribute("href")).not.toContain("mlat");
  });

  it("as tiles pedidas são do zoom de bairro, não do zoom de rua", async () => {
    const { container } = await montarComOSeed();
    const zooms = [...container.querySelectorAll("img")]
      .map(i => (i.getAttribute("src") ?? "").match(/tile\.openstreetmap\.org\/(\d+)\//))
      .filter(Boolean)
      .map(m => Number(m![1]));

    expect(zooms.length).toBeGreaterThan(0);
    // Zoom de rua entregaria o que a região existe para esconder.
    for (const z of zooms) expect(z).toBeLessThanOrEqual(13);
  });

  it("não existe nome de local no HTML — nem escondido", async () => {
    const { container } = await montarComOSeed();
    // Enquanto `localNomePublicado` for false, nenhum nome de local pode estar
    // no documento. Renderizar e esconder com CSS deixaria o nome no
    // código-fonte, e o primeiro convidado curioso o encontraria.
    expect(SEED.localNomePublicado).toBe(false);
    expect(container.innerHTML).not.toMatch(/Mans[aã]o/i);
  });

  it("sem indicação cadastrada, a seção inteira não aparece", async () => {
    await montarComOSeed();
    expect(SEED.indicacoes).toHaveLength(0);
    expect(screen.queryByText("Onde ficar")).not.toBeInTheDocument();
  });
});

describe("o arquivo de seed continua válido", () => {
  it("a data está no formato de coluna `date`, e não no formato brasileiro", () => {
    expect(SEED.dataEvento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("não anuncia horário sem ter horário", () => {
    if (SEED.horaPublicada) expect(SEED.horaEvento).not.toBeNull();
  });

  it("não publica nome de local vazio", () => {
    if (SEED.localNomePublicado) expect(SEED.localNome).toBeTruthy();
  });

  it("tem coordenada quando promete mapa", () => {
    if (SEED.localRevelacao !== "oculto") {
      expect(typeof SEED.localLatitude).toBe("number");
      expect(typeof SEED.localLongitude).toBe("number");
    }
  });

  it("o domínio está sem www e em minúsculas, como a consulta espera", () => {
    for (const d of SEED.dominios) {
      expect(d.dominio).toBe(d.dominio.toLowerCase());
      expect(d.dominio.startsWith("www.")).toBe(false);
    }
  });
});
