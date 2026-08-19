import { render, screen, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AlbumDoConvidado } from "@/components/album/AlbumDoConvidado";
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
 * O roteador do App Router não existe fora de uma página do Next, e as telas do
 * álbum navegam. A navegação em si é responsabilidade do Next; o que este
 * arquivo verifica é o texto.
 *
 * **A TELA DE ENTRAR SAIU DAQUI EM 19/08/2026**: o link mágico foi substituído
 * por e-mail e senha, e as telas de conta têm arquivo próprio
 * (`test/conta.test.tsx`).
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
}));

const EVENTO = "11111111-1111-4111-8111-111111111111";
const PARTICIPACAO = "22222222-2222-4222-8222-222222222222";

/**
 * O FEED AGORA É REAL, E O TESTE PRECISA DIZER O QUE ELE DEVOLVE.
 *
 * A F1.4 ligou a grade do feed (H-11): o álbum busca `/api/eventos/[id]/feed` na
 * montagem. Sem uma resposta, o `catch` do gancho acende a mensagem de erro — e
 * os testes de estado vazio passariam a testar o estado de erro, em verde,
 * dizendo o contrário do que verificam.
 *
 * Aqui o feed responde **vazio**, que é o estado real do álbum até a primeira
 * foto chegar — e é o estado que o PRD chama de "a tela mais importante do
 * produto".
 */
function responderFeedVazio() {
  return vi.fn(async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    const corpo = url.includes("/novidades")
      ? { quantas: 0, ate: new Date(0).toISOString() }
      : { itens: [], cursor: null };
    return new Response(JSON.stringify(corpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", responderFeedVazio());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function montarAlbum(sobrepor: Partial<React.ComponentProps<typeof AlbumDoConvidado>> = {}) {
  return render(
    <Providers>
      <AlbumDoConvidado
        eventoId={EVENTO}
        slug="ana-e-max"
        nomeCasal="Ana Flávia e Maxwel"
        participacaoId={PARTICIPACAO}
        faixaLenta={false}
        estadoDoEnvio="aberto"
        abertura={{ dia: "21 de agosto", hora: null }}
        diasDesdeOEvento={0}
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

  it("o estado vazio fala com a voz da marca e NÃO nomeia o que não existe", async () => {
    montarAlbum();
    expect(await screen.findByText("Seja a primeira foto da festa")).toBeInTheDocument();
    expect(
      screen.getByText("O que você mandar aparece aqui e no telão, em segundos.")
    ).toBeInTheDocument();
    expect(screen.getByText("Não precisa instalar nada.")).toBeInTheDocument();

    for (const proibida of [/Nenhuma foto ainda/i, /Ainda não há fotos/i, /Aguardando/i]) {
      expect(screen.queryByText(proibida)).not.toBeInTheDocument();
    }
  });

  it("fora da janela: a frase específica, e o botão some", async () => {
    montarAlbum({ estadoDoEnvio: "fora_da_janela" });
    expect(
      await screen.findByText("Os envios deste casamento foram encerrados.")
    ).toBeInTheDocument();
    expect(screen.getByText("As fotos que chegaram continuam aqui.")).toBeInTheDocument();
    // O botão SOME; ele não fica desabilitado. Botão desabilitado sem
    // explicação é a pessoa achando que o celular dela é o problema.
    expect(screen.queryByRole("button", { name: "Mandar minhas fotos" })).not.toBeInTheDocument();
  });

  /**
   * A PRECEDÊNCIA DA JANELA (`gtm.md` §5.1): quando ela não está aberta, a
   * mensagem da janela **substitui** o estado vazio.
   *
   * `Seja a primeira foto da festa` sem botão é pior que um vazio — convida para
   * uma ação que não existe. E os dois instantes opostos têm textos opostos: quem
   * chegou cedo fez a coisa certa, e o texto dele termina numa ação.
   */
  it("antes da janela: o convite some, e o texto termina numa ação", async () => {
    montarAlbum({
      estadoDoEnvio: "antes_da_janela",
      abertura: { dia: "21 de agosto", hora: null },
    });
    expect(await screen.findByText("Você chegou antes da festa")).toBeInTheDocument();
    expect(
      screen.getByText(
        "As fotos abrem em 21 de agosto. Este link é o mesmo no dia: guarde e volte."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Seja a primeira foto da festa")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Os envios deste casamento foram encerrados.")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mandar minhas fotos" })).not.toBeInTheDocument();
  });

  it("antes da janela, com hora configurada, o horário aparece", async () => {
    montarAlbum({
      estadoDoEnvio: "antes_da_janela",
      abertura: { dia: "21 de agosto", hora: "18:00" },
    });
    expect(
      await screen.findByText(
        "As fotos abrem em 21 de agosto, às 18:00. Este link é o mesmo no dia: guarde e volte."
      )
    ).toBeInTheDocument();
  });

  it("aparelho novo bloqueado: outra frase, e o feed continua visível", async () => {
    montarAlbum({ estadoDoEnvio: "aparelho_novo_bloqueado" });
    expect(
      await screen.findByText("Este álbum não está mais recebendo fotos novas.")
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Fotos da festa" })).toBeInTheDocument();
  });

  it("nenhuma tela do convidado usa a palavra proibida", async () => {
    const { container } = montarAlbum();
    await screen.findByText("Seja a primeira foto da festa");
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
  it("as duas réguas de linha existem no DOM", async () => {
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
    await screen.findByText("Seja a primeira foto da festa");
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
