import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "@/components/Providers";
import { DiaAoVivo } from "@/components/painel/DiaAoVivo";
import { FilaDeAprovacao } from "@/components/painel/FilaDeAprovacao";
import { FotosQueChegaram } from "@/components/painel/FotosQueChegaram";
import { RodapeDoLoop } from "@/components/album/RodapeDoLoop";

/**
 * AS TELAS DA F1.5 A F1.7, MONTADAS — com o texto exato do `gtm.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO PEGA: import quebrado, prop obrigatória que sumiu, hook
 * fora de ordem, e — o que importa mais aqui — **as frases que são promessa**.
 * O vazio da fila é "o estado bom" e não pode virar "0 fotos"; o erro do painel
 * é um travessão e não pode virar zero; as sete linhas existem antes de existir
 * número.
 *
 * O QUE ELE NÃO PEGA: layout. Uma tela que renderiza inteira torta passa aqui em
 * verde.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";

function respondendo(porUrl: (url: string) => unknown) {
  return vi.fn(async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    const corpo = porUrl(url);
    return {
      ok: corpo !== null,
      status: corpo === null ? 500 : 200,
      json: async () => corpo,
    } as Response;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * H-13 · a fila de aprovação
 * ------------------------------------------------------------------ */

const FILA_VAZIA = {
  itens: [],
  cursor: null,
  total: 0,
  mais_antiga_hora: null,
  modo_moderacao: "fila",
};

describe("H-13 · a fila de aprovação", () => {
  it("o vazio é o ESTADO BOM, e não um vazio triste", async () => {
    /**
     * É onde o moderador passa a maior parte da noite. Sem ícone de alerta, sem
     * cor de estado, sem "0 fotos" — a tela precisa dizer que está tudo bem sem
     * parecer quebrada.
     */
    vi.stubGlobal("fetch", respondendo(() => FILA_VAZIA));
    render(
      <Providers>
        <FilaDeAprovacao eventoId={EVENTO} ehDono={false} modoInicial="fila" usuario={null} />
      </Providers>
    );

    expect(await screen.findByText("Nada esperando por você")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Quando chegar foto nova, ela aparece aqui. Nada disso é urgente: as fotos já são suas."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/0 fotos/)).not.toBeInTheDocument();
  });

  it("com a fila vazia **não existe botão de aprovar** — 'Aprovar as 0' seria mentira", async () => {
    vi.stubGlobal("fetch", respondendo(() => FILA_VAZIA));
    render(
      <Providers>
        <FilaDeAprovacao eventoId={EVENTO} ehDono={false} modoInicial="fila" usuario={null} />
      </Providers>
    );
    await screen.findByText("Nada esperando por você");
    expect(screen.queryByRole("button", { name: /Aprovar as/ })).not.toBeInTheDocument();
  });

  it("cheio: o botão traz o número e a linha diz a hora da mais antiga", async () => {
    vi.stubGlobal(
      "fetch",
      respondendo(() => ({
        itens: [
          { id: "a1", rotulo: "Ana Silva", miniatura: null, previa: null },
          { id: "a2", rotulo: null, miniatura: null, previa: null },
        ],
        cursor: null,
        total: 400,
        mais_antiga_hora: "22h14",
        modo_moderacao: "fila",
      }))
    );
    render(
      <Providers>
        <FilaDeAprovacao eventoId={EVENTO} ehDono={false} modoInicial="fila" usuario={null} />
      </Providers>
    );

    expect(
      await screen.findByRole("button", { name: "Aprovar as 400" })
    ).toBeInTheDocument();
    expect(screen.getByText("A mais antiga chegou às 22h14.")).toBeInTheDocument();
    // O subtítulo é a promessa inteira da história.
    expect(
      screen.getByText("Só decide o que aparece no álbum e no telão. Tudo já está com você.")
    ).toBeInTheDocument();
  });

  it("erro: o texto não usa a palavra proibida", async () => {
    vi.stubGlobal("fetch", respondendo(() => null));
    render(
      <Providers>
        <FilaDeAprovacao eventoId={EVENTO} ehDono={false} modoInicial="fila" usuario={null} />
      </Providers>
    );
    const aviso = await screen.findByText("Não conseguimos carregar as fotos agora.");
    expect(aviso).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/falhou/i);
  });
});

/* ------------------------------------------------------------------ *
 * H-14 · o painel de mídias
 * ------------------------------------------------------------------ */

const RESUMO = { armazenadas: 6000, em_alta_resolucao: 5412 };
const GRADE = { itens: [], cursor: null, rotulos_repetidos: [] };

function montarPainel(sobrepor: Partial<React.ComponentProps<typeof FotosQueChegaram>> = {}) {
  return render(
    <Providers>
      <FotosQueChegaram
        eventoId={EVENTO}
        ehDono={false}
        podeExcluir
        festaAcabou={false}
        antesDaFesta={false}
        diasDesdeOEvento={0}
        usuario={null}
        {...sobrepor}
      />
    </Providers>
  );
}

describe("H-14 · o que chegou", () => {
  it("os dois números aparecem SEPARADOS, e nunca somados", async () => {
    vi.stubGlobal(
      "fetch",
      respondendo(url => (url.includes("/resumo") ? RESUMO : GRADE))
    );
    montarPainel();

    expect(await screen.findByText("6.000")).toBeInTheDocument();
    expect(screen.getByText("5.412")).toBeInTheDocument();
    // 6.000 + 5.412 nunca é escrito em lugar nenhum.
    expect(screen.queryByText("11.412")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "As fotos chegam em segundos numa versão menor, e a versão grande vem depois. Nenhuma foto se perde nesse caminho."
      )
    ).toBeInTheDocument();
  });

  it("**erro no lugar do número, e nunca um zero**", async () => {
    /**
     * "Melhor não mostrar do que mostrar errado o número de fotos do casamento
     * de alguém." Um `0` aqui é indistinguível de uma festa que não começou.
     */
    vi.stubGlobal(
      "fetch",
      respondendo(url => (url.includes("/resumo") ? null : GRADE))
    );
    montarPainel();

    expect(await screen.findAllByText("Não conseguimos contar agora")).toHaveLength(2);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    // O travessão está lá, e é `aria-hidden`: quem usa leitor de tela ouve o
    // motivo, não um traço solto.
    expect(document.body.textContent).toContain("—");
  });

  it("antes da festa o vazio é LISTA DE PREPARO, nunca 'nenhuma foto'", async () => {
    vi.stubGlobal(
      "fetch",
      respondendo(url => (url.includes("/resumo") ? RESUMO : GRADE))
    );
    montarPainel({ antesDaFesta: true });

    expect(await screen.findByText("Ainda não é o dia")).toBeInTheDocument();
    expect(screen.getByText("Imprimir o cartão de mesa")).toBeInTheDocument();
    expect(screen.getByText("Mandar uma foto de teste")).toBeInTheDocument();
    /**
     * **O vazio não nomeia o que não existe.** A frase proibida é a que nomeia a
     * ausência ("nenhuma foto ainda"), e não a palavra "foto" — a legenda dos
     * números diz "Nenhuma foto se perde nesse caminho", que é uma promessa e
     * não um vazio, e ela continua na tela.
     */
    expect(document.body.textContent).not.toMatch(/nenhuma foto (ainda|por|aqui)/i);
    expect(document.body.textContent).toContain("Nenhuma foto se perde nesse caminho.");
  });

  it("os três filtros, e três é o teto", async () => {
    vi.stubGlobal(
      "fetch",
      respondendo(url => (url.includes("/resumo") ? RESUMO : GRADE))
    );
    montarPainel();
    await screen.findByText("6.000");

    // Selo e filtro usam a palavra IDÊNTICA (`gtm.md` §3.3).
    for (const rotulo of ["Todas", "Só para os noivos", "Esperando aprovação"]) {
      expect(screen.getByRole("button", { name: rotulo })).toBeInTheDocument();
    }
    // "Só para você" morreu: num painel que DOIS noivos abrem, "você" não diz
    // qual dos dois.
    expect(screen.queryByText("Só para você")).not.toBeInTheDocument();
  });

  it("**o aviso de rótulos repetidos não existe durante a festa**", async () => {
    /**
     * H-23: ele aparece só depois de `fim_festa_em`. O painel inteiro obedece à
     * promessa de que o casal não trabalha durante o próprio casamento.
     */
    const comRepetidos = {
      ...GRADE,
      rotulos_repetidos: [
        { rotulo: "Ana Silva", participacoes: [{ id: "p1", midias: 9 }, { id: "p2", midias: 2 }] },
      ],
    };
    vi.stubGlobal(
      "fetch",
      respondendo(url => (url.includes("/resumo") ? RESUMO : comRepetidos))
    );
    montarPainel({ festaAcabou: false });
    await screen.findByText("6.000");
    expect(screen.queryByText(/Quer renomear um deles/)).not.toBeInTheDocument();
  });

  it("depois da festa, o aviso aparece com a frase do `gtm.md`", async () => {
    const comRepetidos = {
      ...GRADE,
      rotulos_repetidos: [
        { rotulo: "Ana Silva", participacoes: [{ id: "p1", midias: 9 }, { id: "p2", midias: 2 }] },
      ],
    };
    vi.stubGlobal(
      "fetch",
      respondendo(url => (url.includes("/resumo") ? RESUMO : comRepetidos))
    );
    montarPainel({ festaAcabou: true });

    expect(
      await screen.findByText("Dois aparelhos mandaram fotos como Ana Silva. Quer renomear um deles?")
    ).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ *
 * H-19 · o painel do dia
 * ------------------------------------------------------------------ */

const SETE_ROTULOS = [
  "Convidados que participaram",
  "Fotos guardadas",
  "Esperando aprovação",
  "Erros",
  "Como estão mandando",
  "Aprovações durante a festa",
  "Alcance do loop",
];

describe("H-19 · o dia ao vivo", () => {
  it("as sete linhas existem ANTES de existir número", async () => {
    vi.stubGlobal(
      "fetch",
      respondendo(() => ({
        comecou: false,
        participacao: { ok: true, valor: { presentesContagem: 184 } },
        midias: { ok: true, valor: { armazenadas: 0, emAltaResolucao: 0 } },
        fila: { ok: true, valor: { pendentes: 0, idadeDoMaisVelhoMinutos: null } },
        erros: { ok: true, valor: { rede: 0, portal: 0, servidor: 0, arquivo: 0 } },
        distribuicao: { ok: true, valor: {} },
        moderacoes: { ok: true, valor: 0 },
        loop: { ok: true, valor: { alcancaram: 0, leads: 0, leadsComData: 0 } },
        telao: { ok: true, valor: { links: 0, ultimoUsoMinutos: null } },
      }))
    );
    render(
      <Providers>
        <DiaAoVivo eventoId={EVENTO} usuario={null} />
      </Providers>
    );

    for (const rotulo of SETE_ROTULOS) {
      expect(await screen.findByText(rotulo)).toBeInTheDocument();
    }
    // "Ainda não começou" é verdade; zero seria mentira.
    await waitFor(() =>
      expect(screen.getAllByText("Ainda não começou")).toHaveLength(SETE_ROTULOS.length)
    );
  });

  it("a linha que falha mostra erro; as outras seis continuam", async () => {
    vi.stubGlobal(
      "fetch",
      respondendo(() => ({
        comecou: true,
        participacao: { ok: false },
        midias: { ok: true, valor: { armazenadas: 4000, emAltaResolucao: 3612 } },
        fila: { ok: true, valor: { pendentes: 400, idadeDoMaisVelhoMinutos: 46 } },
        erros: { ok: true, valor: { rede: 37, portal: 0, servidor: 2, arquivo: 0 } },
        distribuicao: {
          ok: true,
          valor: { fracaoFesta: 0.91, fracaoNoivos: 0.09, fracaoMexeram: 0.04 },
        },
        moderacoes: { ok: true, valor: 6 },
        loop: { ok: true, valor: { alcancaram: 312, leads: 9, leadsComData: 9 } },
        telao: { ok: true, valor: { links: 1, ultimoUsoMinutos: 0 } },
      }))
    );
    render(
      <Providers>
        <DiaAoVivo eventoId={EVENTO} usuario={null} />
      </Providers>
    );

    expect(await screen.findByText("Não conseguimos ler agora")).toBeInTheDocument();
    expect(screen.getByText("4.000")).toBeInTheDocument();
    expect(screen.getByText("3.612 em alta resolução")).toBeInTheDocument();
    expect(screen.getByText("37 de rede · 2 de servidor")).toBeInTheDocument();
    expect(screen.getByText("91% para a festa")).toBeInTheDocument();
    // O sinal do telão fica no cabeçalho: **não é o oitavo número**.
    expect(screen.getByText("O telão falou com a gente agora.")).toBeInTheDocument();
  });

  it("**`portal` ganha linha própria, com a ação junto**", async () => {
    /**
     * `rede` e `portal` pedem ações opostas. Ver o número de portal sem saber o
     * que fazer com ele é o mesmo que não vê-lo.
     */
    vi.stubGlobal(
      "fetch",
      respondendo(() => ({
        comecou: true,
        participacao: { ok: false },
        midias: { ok: false },
        fila: { ok: false },
        erros: { ok: true, valor: { rede: 12, portal: 3, servidor: 0, arquivo: 0 } },
        distribuicao: { ok: false },
        moderacoes: { ok: false },
        loop: { ok: false },
        telao: { ok: false },
      }))
    );
    render(
      <Providers>
        <DiaAoVivo eventoId={EVENTO} usuario={null} />
      </Providers>
    );

    expect(
      await screen.findByText(
        "3 de portal cativo — trocar a rede ou usar o QR do plano B"
      )
    ).toBeInTheDocument();
  });

  it("sem contagem de presentes, a linha 1 diz onde resolver — e não mostra número", async () => {
    vi.stubGlobal(
      "fetch",
      respondendo(() => ({
        comecou: true,
        participacao: {
          ok: true,
          valor: {
            slotsPublicaram: 118,
            slotsPresentes: 184,
            presentesContagem: null,
            participacaoSlots: 0.64,
            pisoPessoas: null,
            tetoPessoas: null,
          },
        },
        midias: { ok: false },
        fila: { ok: false },
        erros: { ok: false },
        distribuicao: { ok: false },
        moderacoes: { ok: false },
        loop: { ok: false },
        telao: { ok: false },
      }))
    );
    render(
      <Providers>
        <DiaAoVivo eventoId={EVENTO} usuario={null} />
      </Providers>
    );

    expect(await screen.findByText("Denominador ainda não informado")).toBeInTheDocument();
    // A ausência do denominador NÃO é erro nosso, e não pode parecer um.
    expect(screen.queryByText("118 de 184")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ *
 * H-16 e H-22 · o rodapé do loop
 * ------------------------------------------------------------------ */

describe("H-16 · o CTA do loop", () => {
  beforeEach(() => {
    // `IntersectionObserver` não existe no jsdom. O componente já trata a
    // ausência (o evento simplesmente não dispara), e é isso que se afirma.
    vi.stubGlobal("fetch", respondendo(() => ({})));
  });

  it("**não existe antes do primeiro envio concluído**", () => {
    /**
     * `escopo-core.md` §11.4, como renderização: nada de aquisição antes do
     * primeiro envio concluído, e nada acima do botão de enviar.
     */
    const { container } = render(
      <Providers>
        <RodapeDoLoop
          eventoId={EVENTO}
          nomeCasal="Ana Flávia e Maxwel"
          temMidiaArmazenada={false}
          aoAvisar={() => {}}
        />
      </Providers>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("com foto armazenada, a chamada e o link guardado aparecem — nessa ordem", () => {
    render(
      <Providers>
        <RodapeDoLoop
          eventoId={EVENTO}
          nomeCasal="Ana Flávia e Maxwel"
          temMidiaArmazenada
          aoAvisar={() => {}}
        />
      </Providers>
    );
    expect(screen.getByText("Vai casar?")).toBeInTheDocument();
    const cta = screen.getByRole("button", { name: "Quero isso no meu casamento" });
    const guardar = screen.getByRole("button", { name: "Guardar o seu álbum" });
    // O CTA é sobre o casamento da pessoa; o link guardado é sobre as fotos que
    // ela acabou de mandar. Invertê-los faria a tela terminar em outro assunto.
    expect(cta.compareDocumentPosition(guardar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
