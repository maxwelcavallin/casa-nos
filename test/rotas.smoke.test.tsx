import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { Providers } from "@/components/Providers";
import { PaginaDoEvento } from "@/components/evento/PaginaDoEvento";
import type { EventoPublico, Indicacao } from "@/lib/eventos";

/**
 * TESTE DE FUMAÇA — o piso.
 *
 * POR QUE ELE É O TESTE MAIS IMPORTANTE DO PROJETO: quem mantém este código não
 * roda o site localmente. Sobe para a Vercel e olha lá. Sem este arquivo, a
 * primeira pessoa a descobrir que a página quebrou é o convidado que abriu o
 * link no meio do grupo de WhatsApp.
 *
 * O QUE ELE PEGA: import quebrado, componente usado sem estar importado, prop
 * obrigatória que sumiu, violação de fronteira cliente/servidor, hook fora de
 * ordem, e `dados[0].campo` sem verificação.
 *
 * O QUE ELE NÃO PEGA: layout. Uma página que renderiza inteira torta passa aqui
 * em verde. Verificação de pixel exige navegador, e não existe substituto
 * honesto — quem resolve isso é o olho humano no preview.
 */

declare global {
  interface ImportMeta {
    glob<T = unknown>(padrao: string): Record<string, () => Promise<T>>;
  }
}

// O catálogo é montado pelo Vite, não escrito à mão: listar as páginas
// manualmente significaria alguém criar uma tela e esquecer de incluí-la —
// justamente a tela que nunca foi testada.
const paginas = import.meta.glob<{ default?: unknown }>("../app/**/{page,not-found}.tsx");

function rotaDe(caminho: string): string {
  const r = caminho
    .replace(/^\.\.\/app/, "")
    .replace(/\/(page|not-found)\.tsx$/, "")
    .replace(/\/\([^)]+\)/g, "");
  return r === "" ? "/" : r;
}

const casos = Object.entries(paginas)
  .map(([caminho, importar]) => ({ rota: rotaDe(caminho), caminho, importar }))
  .sort((a, b) => a.caminho.localeCompare(b.caminho));

describe("catálogo de páginas", () => {
  it("o glob encontrou as páginas — se este falhar, o resto é falso positivo", () => {
    expect(casos.length).toBeGreaterThanOrEqual(3);
  });

  for (const { caminho, importar } of casos) {
    /**
     * As páginas deste produto são componentes de SERVIDOR e assíncronos: elas
     * consultam o banco. O React Testing Library não resolve componente
     * assíncrono, e renderizá-las aqui exigiria um banco — então o que se
     * verifica é que o módulo carrega e exporta um componente, que é onde mora
     * a falha mais comum (import quebrado).
     *
     * A montagem de verdade acontece logo abaixo, sobre `PaginaDoEvento`, que é
     * onde a página inteira é composta.
     */
    it(`${caminho} carrega e exporta um componente`, async () => {
      const modulo = await importar();
      expect(modulo.default, `${caminho} não exporta um componente padrão`).toBeTypeOf(
        "function"
      );
    });
  }
});

/* ------------------------------------------------------------------ *
 * A página montada de verdade, nos estados que ela tem hoje
 * ------------------------------------------------------------------ */

const AGORA = new Date("2026-08-18T12:00:00.000Z").getTime();

const BASE: EventoPublico = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "ana-e-max",
  nomeCasal: "Ana Flávia e Maxwel",
  dataEvento: "2027-08-22",
  dataPorExtensoFuso: "America/Sao_Paulo",
  horaEvento: null,
  cidade: "Rio de Janeiro",
  uf: "RJ",
  localNome: null,
  localEndereco: null,
  mapa: null,
};

const COM_REGIAO: EventoPublico = {
  ...BASE,
  mapa: { latitude: -22.97, longitude: -43.37, precisao: "regiao", raioMetros: 4000 },
};

const TUDO_REVELADO: EventoPublico = {
  ...BASE,
  horaEvento: "16:00:00",
  localNome: "Nome do local já divulgado",
  localEndereco: "Rua Exemplo, 100",
  mapa: { latitude: -22.97, longitude: -43.37, precisao: "exato", raioMetros: 300 },
};

const INDICACOES: Indicacao[] = [
  {
    id: "aaaa1111-1111-4111-8111-111111111111",
    eventoId: BASE.id,
    tipo: "hospedagem",
    titulo: "Hotel de exemplo",
    descricao: "Uma linha de descrição.",
    referencia: "Barra da Tijuca",
    url: "https://exemplo.com.br",
    ordem: 1,
  },
];

function montar(evento: EventoPublico, indicacoes: Indicacao[] = []) {
  return render(
    <Providers>
      <PaginaDoEvento evento={evento} indicacoes={indicacoes} agoraMs={AGORA} />
    </Providers>
  );
}

describe("a página do casamento, montada", () => {
  it("estado de hoje: nomes, data por extenso e contagem — sem local e sem horário", () => {
    montar(BASE);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ana Flávia e Maxwel"
    );
    expect(screen.getByText("Save the date")).toBeInTheDocument();
    expect(screen.getByText("domingo, 22 de agosto de 2027")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByText(/Vai ser em Rio de Janeiro/)).toBeInTheDocument();
    expect(screen.getByText(/falta confirmar o local e o horário/)).toBeInTheDocument();
  });

  it("um h1 só na página — hierarquia de heading correta", () => {
    montar(TUDO_REVELADO, INDICACOES);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("mapa de região: desenha o mapa e NÃO promete endereço nem nome", () => {
    const { container } = montar(COM_REGIAO);
    expect(
      screen.getByRole("img", {
        name: "Mapa da região aproximada do casamento, sem o local exato",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir a região no mapa/ })).toBeInTheDocument();
    expect(screen.queryByText(/Rua/)).not.toBeInTheDocument();

    // Sem iframe: o mapa é montado com tiles aqui. Enquanto era embed do OSM, o
    // círculo ficava preso ao centro do CONTÊINER, e o centro geográfico ficava
    // acima dele pela metade da altura da barra de atribuição — uma barra que
    // muda de altura com a largura da tela.
    expect(container.querySelector("iframe")).toBeNull();

    // O crédito da licença é obrigatório e precisa estar VIVO. Dentro do embed
    // ele existia com os links mortos, porque o iframe não recebia toque.
    const credito = screen.getByRole("link", { name: /colaboradores do OpenStreetMap/ });
    expect(credito).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  });

  it("mapa de região: todas as tiles pendem do mesmo ponto do contêiner", () => {
    const { container } = montar(COM_REGIAO);
    const tiles = [...container.querySelectorAll("img")].filter(i =>
      (i.getAttribute("src") ?? "").includes("tile.openstreetmap.org")
    );
    expect(tiles.length).toBeGreaterThan(0);

    // Toda tile é posicionada a partir de 50%/50% e deslocada por margem — a
    // mesma âncora da área destacada. É daí que vem a centralização em qualquer
    // largura: as duas coisas penduram do mesmo prego, não de dois ajustes que
    // precisam concordar. (A aritmética disso é provada em test/mapa.test.ts.)
    for (const tile of tiles) {
      expect(tile.style.position).toBe("absolute");
      expect(tile.style.left).toBe("50%");
      expect(tile.style.top).toBe("50%");
    }

    const area = container.querySelector("[data-area-da-regiao]");
    expect(area, "a área da região não foi desenhada").not.toBeNull();
    expect(container.querySelector("[data-pin-do-local]")).toBeNull();
  });

  it("com tudo revelado: nome do local, endereço, horário e pin", () => {
    montar(TUDO_REVELADO);
    expect(screen.getByText("Nome do local já divulgado")).toBeInTheDocument();
    expect(screen.getByText("Rua Exemplo, 100")).toBeInTheDocument();
    expect(screen.getByText(/começa às 16h/)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Mapa com o local do casamento" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/falta confirmar/)).not.toBeInTheDocument();
  });

  it("sem indicação cadastrada, a seção inteira some — nem título, nem card vazio", () => {
    montar(BASE, []);
    expect(screen.queryByText("Onde ficar")).not.toBeInTheDocument();
    expect(screen.queryByText("Dicas")).not.toBeInTheDocument();
  });

  it("com indicação, ela aparece com link que diz para onde vai", () => {
    montar(BASE, INDICACOES);
    expect(screen.getByText("Onde ficar")).toBeInTheDocument();
    expect(screen.getByText("Hotel de exemplo")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Abrir o site de Hotel de exemplo" });
    expect(link).toHaveAttribute("href", "https://exemplo.com.br");
    // Link externo sem `rel` é brecha de segurança (a aba aberta ganha acesso
    // ao `window.opener`), e num site que lista hotel de terceiro isso importa.
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("aguenta nome longo de casal sem estourar — o caso dos quatro nomes", () => {
    const longo = { ...BASE, nomeCasal: "Ana Flávia Rodrigues Cavalcanti e Maxwel Antônio Cavallin" };
    montar(longo);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(longo.nomeCasal);
  });

  it("data no passado vira uma frase, não um número negativo", () => {
    const passado = { ...BASE, dataEvento: "2020-01-04" };
    montar(passado);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText(/Casamos em sábado, 4 de janeiro de 2020/)).toBeInTheDocument();
  });

  it("o rodapé cita o nome do produto uma vez, como texto", () => {
    montar(BASE);
    expect(screen.getAllByText(/casa-nos/)).toHaveLength(1);
  });
});
