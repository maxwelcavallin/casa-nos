import { render, screen, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { AlbumDoConvidado } from "@/components/album/AlbumDoConvidado";
import { EntrarNoPainel } from "@/components/painel/EntrarNoPainel";
import { Providers } from "@/components/Providers";
import { TelaDoDia, type DadosDoDia } from "@/components/painel/TelaDoDia";

/**
 * AS TELAS DA F1.1 E DA F1.2, MONTADAS.
 *
 * O QUE ELE PEGA: import quebrado, hook fora de ordem, prop obrigatória que
 * sumiu, e — o que mais importa aqui — o texto exato do `gtm.md` e as promessas
 * de acessibilidade que a H-05 escreve como critério de aceite.
 *
 * O QUE ELE NÃO PEGA: layout. Uma tela que renderiza inteira torta passa aqui em
 * verde. Verificação de pixel exige navegador, e não existe substituto honesto —
 * quem resolve isso é o olho humano no preview da plataforma.
 *
 * SEM INDEXEDDB, DE PROPÓSITO: o jsdom não tem, e o álbum tem que abrir do mesmo
 * jeito (é o Firefox em janela privada). Se o botão de mandar dependesse da fila
 * para existir, este arquivo falharia — e é essa dependência que a H-05 proíbe.
 */

/**
 * O roteador do App Router não existe fora de uma página do Next, e
 * `EntrarNoPainel` usa `replace` para entrar no painel sem tela intermediária.
 * O que este arquivo verifica dali é o TEXTO do caminho triste, não a navegação
 * do caminho feliz — a navegação é responsabilidade do Next.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
}));

const EVENTO = "11111111-1111-4111-8111-111111111111";
const PARTICIPACAO = "22222222-2222-4222-8222-222222222222";

function montarAlbum(sobrepor: Partial<React.ComponentProps<typeof AlbumDoConvidado>> = {}) {
  return render(
    <Providers>
      <AlbumDoConvidado
        eventoId={EVENTO}
        nomeCasal="Ana Flávia e Maxwel"
        participacaoId={PARTICIPACAO}
        faixaLenta={false}
        estadoDoEnvio="aberto"
        usuario={`g:${PARTICIPACAO}`}
        {...sobrepor}
      />
    </Providers>
  );
}

describe("Álbum — o botão de enviar não espera nada", () => {
  it("o botão de mandar está na tela, sólido, sem rede nenhuma", () => {
    montarAlbum();
    expect(screen.getByRole("button", { name: "Mandar minhas fotos" })).toBeInTheDocument();
  });

  it("as duas regiões nomeadas existem, e são o mapa da tela para quem não a vê", () => {
    montarAlbum();
    expect(screen.getByRole("region", { name: "Mandar fotos" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Fotos da festa" })).toBeInTheDocument();
  });

  it("o atalho é o PRIMEIRO focável da página e leva à região do botão", () => {
    /**
     * O critério do `po`: com 6.000 cards, chegar ao botão custa no máximo dois
     * passos de teclado. `Tab` revela este link; `Enter` leva à região. Se ele
     * deixar de ser o primeiro focável, o custo vira "role a grade inteira".
     */
    const { container } = montarAlbum();
    const focaveis = container.querySelectorAll(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    expect(focaveis[0]).toHaveTextContent("Pular para mandar minhas fotos");
    expect(focaveis[0]).toHaveAttribute("href", "#mandar-fotos");
  });

  it("o texto do atalho repete as palavras do botão, verbatim", () => {
    // Prometer "enviar foto" e aterrissar em "mandar minhas fotos" faria quem
    // não vê a tela ouvir uma promessa e chegar noutra, sem poder conferir.
    montarAlbum();
    const atalho = screen.getByText("Pular para mandar minhas fotos");
    const botao = screen.getByRole("button", { name: "Mandar minhas fotos" });
    expect(atalho.textContent?.toLowerCase()).toContain(
      botao.textContent!.toLowerCase()
    );
  });

  it("o estado vazio fala com a voz da marca e NÃO nomeia o que não existe", () => {
    montarAlbum();
    expect(screen.getByText("Seja a primeira foto da festa")).toBeInTheDocument();
    expect(
      screen.getByText("O que você mandar aparece aqui e no telão, em segundos.")
    ).toBeInTheDocument();
    expect(screen.getByText("Não precisa instalar nada.")).toBeInTheDocument();

    for (const proibida of [/Nenhuma foto ainda/i, /Ainda não há fotos/i, /Aguardando/i]) {
      expect(screen.queryByText(proibida)).not.toBeInTheDocument();
    }
  });

  it("fora da janela: a frase específica, e o botão some", () => {
    montarAlbum({ estadoDoEnvio: "fora_da_janela" });
    expect(screen.getByText("Os envios deste casamento foram encerrados.")).toBeInTheDocument();
    expect(screen.getByText("As fotos que chegaram continuam aqui.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mandar minhas fotos" })).not.toBeInTheDocument();
  });

  it("aparelho novo bloqueado: outra frase, e o feed continua visível", () => {
    montarAlbum({ estadoDoEnvio: "aparelho_novo_bloqueado" });
    expect(
      screen.getByText("Este álbum não está mais recebendo fotos novas.")
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Fotos da festa" })).toBeInTheDocument();
  });

  it("nenhuma tela do convidado usa a palavra proibida", () => {
    const { container } = montarAlbum();
    // "Falhou" não entra em estado nenhum: não falhou, adiou.
    expect(container.textContent?.toLowerCase()).not.toContain("falhou");
    // E nada de jargão de fila para o convidado (RN-07).
    expect(container.textContent?.toLowerCase()).not.toContain("aprovação");
  });

  it("o título da tela não carrega nome de convidado (RN-31)", () => {
    // O nome do casal pode aparecer — o site é deles. Rótulo de convidado, não:
    // é PII de terceiro, e ele nem escolheu estar ali.
    montarAlbum();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ana Flávia e Maxwel");
  });
});

describe("o bloco de convite tem altura DERIVADA da grade", () => {
  it("as duas réguas de linha existem no DOM", () => {
    /**
     * A correção do `lead-design`: 216 px é a altura de duas linhas **enquanto**
     * a grade tiver três colunas de 104. Num aparelho estreito ela cai para duas
     * colunas, os tiles ficam mais altos, e o número fixo passa a reservar menos
     * espaço do que o conteúdo vai ocupar — a tela PULA quando a primeira foto
     * chega, justamente no aparelho mais apertado.
     *
     * As duas células invisíveis são a derivação: elas ocupam as linhas 1 e 2 da
     * mesma grade, com proporção 1:1, e o navegador calcula a altura.
     */
    const { container } = montarAlbum();
    expect(container.querySelectorAll("[data-regua-da-grade]")).toHaveLength(2);
  });

  it("nenhum 216 literal no componente da grade", () => {
    const fonte = fs.readFileSync(
      path.resolve(import.meta.dirname, "..", "components", "album", "GradeMidias.tsx"),
      "utf8"
    );
    const semComentarios = fonte
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(
      /\b216\b/.test(semComentarios),
      "voltou um 216 fixo. A altura do convite sai da grade, não de um número."
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Painel — o dia
 * ------------------------------------------------------------------ */

const DIA: DadosDoDia = {
  eventoId: EVENTO,
  nomeCasal: "Ana Flávia e Maxwel",
  dataPorExtenso: "domingo, 22 de agosto de 2027",
  envioAbreEm: "2027-08-21T00:00",
  envioFechaEm: "2027-08-29T23:59",
  inicioFestaEm: "",
  fimFestaEm: "",
  modoModeracao: "direto",
  presentesContagem: "",
  moderadores: [],
  temTelao: false,
  pareceNovo: true,
  ehDono: false,
  festaTerminou: false,
};

function montarDia(sobrepor: Partial<DadosDoDia> = {}) {
  return render(
    <Providers>
      <TelaDoDia dados={{ ...DIA, ...sobrepor }} />
    </Providers>
  );
}

describe("Painel — o dia", () => {
  it("o título é literal e o nome do casal mora numa linha à parte", () => {
    montarDia();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("O dia do casamento");
    expect(screen.getByText("Ana Flávia e Maxwel")).toBeInTheDocument();
  });

  it("evento novo mostra a lista de preparo, não 'nada configurado'", () => {
    montarDia({ pareceNovo: true });
    expect(screen.getByText("Três coisas antes da festa")).toBeInTheDocument();
    expect(screen.getByText("Imprimir o código para as mesas")).toBeInTheDocument();
  });

  it("o modo `direto` vem pré-selecionado, com a consequência escrita", () => {
    montarDia();
    expect(screen.getByRole("radio", { name: /Na hora/ })).toBeChecked();
    expect(
      screen.getByText(/As fotos aparecem assim que chegam\. Você pode tirar qualquer uma depois\./)
    ).toBeInTheDocument();
  });

  it("fila sem moderador desabilita salvar, com o motivo AO LADO (nunca em tooltip)", () => {
    montarDia({ modoModeracao: "fila", moderadores: [] });
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    // Ao lado, como texto: tooltip não existe no celular, e este painel abre no
    // celular da noiva na véspera.
    expect(screen.getByText("Escolha quem aprova para poder salvar.")).toBeInTheDocument();
  });

  it("fila COM moderador libera o salvar", () => {
    montarDia({ modoModeracao: "fila", moderadores: [{ id: "a1", rotulo: "Padrinho João" }] });
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    expect(screen.getByText("Padrinho João")).toBeInTheDocument();
  });

  it("a contagem de presentes só aparece depois da festa", () => {
    montarDia({ festaTerminou: false });
    expect(screen.queryByLabelText("Quantas pessoas foram")).not.toBeInTheDocument();

    montarDia({ festaTerminou: true });
    expect(screen.getByLabelText("Quantas pessoas foram")).toBeInTheDocument();
  });

  it("o selo do dono aparece só para o dono, e não é fechável", () => {
    const semDono = montarDia({ ehDono: false });
    expect(within(semDono.container).queryByText("Visão do dono")).not.toBeInTheDocument();

    montarDia({ ehDono: true });
    expect(screen.getByText("Visão do dono")).toBeInTheDocument();
    // Sem botão de fechar: um selo que some é um selo que não cumpre a função.
    expect(screen.queryByRole("button", { name: /fechar/i })).not.toBeInTheDocument();
  });

  it("todo campo tem `label` de verdade — placeholder não é rótulo", () => {
    montarDia({ festaTerminou: true });
    for (const rotulo of ["Começa", "Termina", "Quantas pessoas foram"]) {
      expect(screen.getAllByLabelText(rotulo).length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Entrar
 * ------------------------------------------------------------------ */

describe("Entrar — link expirado nunca é tela de erro", () => {
  it("sem token: a mensagem com saída, e o botão que manda outro", () => {
    render(
      <Providers>
        <EntrarNoPainel token={null} />
      </Providers>
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Este link expirou");
    expect(
      screen.getByText(
        "Os links de acesso valem 30 minutos e servem uma vez. A gente manda outro agora."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mandar um link novo" })).toBeInTheDocument();
  });

  it("não usa a palavra 'erro' em lugar nenhum", () => {
    const { container } = render(
      <Providers>
        <EntrarNoPainel token={null} />
      </Providers>
    );
    expect(container.textContent?.toLowerCase()).not.toContain("erro");
  });
});
