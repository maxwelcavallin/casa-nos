import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { PaginaDoEvento } from "@/components/evento/PaginaDoEvento";
import { Providers } from "@/components/Providers";
import type { EventoPublico, Indicacao } from "@/lib/eventos";
import { CHAVES_DE_SECAO, type ChaveDeSecao } from "@/lib/secoes";

/**
 * O QUE O SITE MOSTRA, E O QUE ELE **NÃO DEIXA VAZAR** (v1.0, RV-01 e RV-02).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RV-01 tem duas metades, e a segunda é a que se esquece:
 *
 *   1. Seção desligada não RENDERIZA.
 *   2. O conteúdo dela **não viaja no HTML**.
 *
 * "Não renderizar" não esconde nada de quem abre o código-fonte da página. O
 * casal que desliga "onde ficar" porque ainda não fechou os hotéis, e mesmo
 * assim entrega a lista a quem apertar Ctrl+U, não teve o que pediu.
 *
 * O corte de verdade acontece antes, no servidor: a página **não busca** o
 * conteúdo de uma seção desligada. Este arquivo verifica as duas pontas — o
 * componente, montando de verdade, e a página, lendo o código.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const AGORA = new Date("2026-08-19T12:00:00.000Z").getTime();

const EVENTO: EventoPublico = {
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

const INDICACOES: Indicacao[] = [
  {
    id: "aaaa1111-1111-4111-8111-111111111111",
    eventoId: EVENTO.id,
    tipo: "hospedagem",
    titulo: "Hotel Segredo do Casal",
    descricao: "Café da manhã incluso",
    referencia: "8 min do local",
    url: "https://exemplo.invalid/hotel",
    ordem: 1,
  },
];

function montar(secoes: readonly ChaveDeSecao[], indicacoes: Indicacao[] = INDICACOES) {
  return render(
    <Providers>
      <PaginaDoEvento
        evento={EVENTO}
        indicacoes={indicacoes}
        agoraMs={AGORA}
        secoes={secoes}
      />
    </Providers>
  );
}

describe("seção desligada some do site", () => {
  it("com tudo ligado, a indicação aparece", () => {
    montar(CHAVES_DE_SECAO);
    expect(screen.getByText("Hotel Segredo do Casal")).toBeInTheDocument();
  });

  it("**desligada, o nome do hotel não existe no HTML** (RV-01)", () => {
    const { container } = montar(["capa", "onde", "rodape"]);

    expect(screen.queryByText("Hotel Segredo do Casal")).toBeNull();
    // A varredura do HTML inteiro é o ponto: `queryByText` sozinho não distingue
    // "não desenhou" de "desenhou escondido".
    expect(
      container.innerHTML,
      "O conteúdo de uma seção desligada apareceu no HTML. Esconder na " +
        "renderização não esconde de quem abre o código-fonte."
    ).not.toContain("Hotel Segredo do Casal");
    expect(container.innerHTML).not.toContain("exemplo.invalid");
  });

  it("desligar `onde` tira a seção e o texto dela", () => {
    const { container } = montar(["capa", "indicacoes", "rodape"]);
    expect(container.innerHTML).not.toContain("Vai ser em Rio de Janeiro");
  });

  it("**seção ligada e vazia também não renderiza** (RV-02)", () => {
    // O comportamento que `SecaoIndicacoes` já tinha, e que passou a valer para
    // todas: uma seção vazia num convite não informa nada e ainda sugere que
    // alguém esqueceu de preencher.
    const { container } = montar(CHAVES_DE_SECAO, []);
    expect(container.innerHTML).not.toContain("Onde ficar");
  });

  it("a capa e o rodapé aparecem sempre", () => {
    // Elas não são condicionais no componente (RV-06): escrever o `if` delas
    // daria a impressão de que podem ser desligadas.
    montar(["capa", "rodape"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ana Flávia e Maxwel");
  });
});

describe("a ordem do casal é a ordem do site", () => {
  it("trocar a ordem das seções troca a ordem no HTML", () => {
    /**
     * Se as seções fossem sete `&&` em sequência, a ordem seria a do código e
     * reordenar no painel não teria efeito nenhum — sem erro, sem sintoma, e o
     * casal concluindo que o botão não funciona.
     */
    const { container: a } = montar(["capa", "onde", "indicacoes", "rodape"]);
    const posicaoOndeAntes = a.innerHTML.indexOf("Rio de Janeiro");
    const posicaoHotelAntes = a.innerHTML.indexOf("Hotel Segredo do Casal");
    expect(posicaoOndeAntes).toBeLessThan(posicaoHotelAntes);

    const { container: b } = montar(["capa", "indicacoes", "onde", "rodape"]);
    const posicaoOndeDepois = b.innerHTML.indexOf("Rio de Janeiro");
    const posicaoHotelDepois = b.innerHTML.indexOf("Hotel Segredo do Casal");
    expect(posicaoHotelDepois).toBeLessThan(posicaoOndeDepois);
  });
});

describe("a página não BUSCA o conteúdo de seção desligada", () => {
  /**
   * A metade que o teste de DOM não alcança. Uma página que buscasse tudo e
   * passasse adiante só o que está ligado continuaria certa na tela — e voltaria
   * a errar no dia em que alguém acrescentasse um campo ao recorte público.
   */
  const PAGINAS = ["app/page.tsx", "app/e/[slug]/page.tsx"];

  it("as duas páginas públicas condicionam a busca das indicações", () => {
    const semCondicao = PAGINAS.filter(relativo => {
      const fonte = fs.readFileSync(path.join(RAIZ, relativo), "utf8");
      return !/ligadas\.includes\("indicacoes"\)\s*\?\s*await listarIndicacoes/.test(fonte);
    });

    expect(
      semCondicao,
      "Estas páginas buscam o conteúdo mesmo com a seção desligada:\n" +
        semCondicao.map(p => `  - ${p}`).join("\n") +
        "\n\nO corte é no servidor, antes da consulta — não na renderização."
    ).toEqual([]);
  });

  it("as duas páginas resolvem as seções antes de montar", () => {
    const semSecoes = PAGINAS.filter(relativo => {
      const fonte = fs.readFileSync(path.join(RAIZ, relativo), "utf8");
      return !/chavesLigadas\(/.test(fonte) || !/secoes=\{ligadas\}/.test(fonte);
    });
    expect(semSecoes).toEqual([]);
  });
});
