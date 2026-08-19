import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "@/components/Providers";
import { CascaDoEditor } from "@/components/painel/site/CascaDoEditor";
import { EditorDaGaleria, type FotoNoEditor } from "@/components/painel/site/EditorDaGaleria";
import { EditorDaHistoria } from "@/components/painel/site/EditorDaHistoria";

/**
 * O AVISO DE ALTERAÇÃO NÃO SALVA (v1.0, V-15).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **AS DUAS METADES QUE ESTE ARQUIVO SEGURA, e a segunda é a que promoveu a
 * história de `Should` para `Must`:**
 *
 * 1. **O aviso não pode aparecer sempre.** Um diálogo que interrompe toda saída
 *    vira mobília: a pessoa aprende a atravessá-lo sem ler, e ele deixa de
 *    funcionar justamente nas duas vezes em que importava. Sem alteração, o
 *    "Voltar para o site" é um link e mais nada.
 *
 * 2. **Envio em curso não é "alteração não salva".** A frase é outra porque o
 *    fato é outro: a foto a caminho já tem linha no banco, sem `armazenada_em`,
 *    e não renderiza no site. Quem sai no meio não perde texto — perde a foto, e
 *    a saída é mandá-la de novo. Um diálogo dizendo "sair sem salvar?" mandaria
 *    a pessoa procurar um botão de salvar que não existe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";

/**
 * `gerarDerivadas` fica pendurada de propósito: o envio entra em "preparando" e
 * **não sai**, que é exatamente o instante que a V-15 precisa descrever — a foto
 * a caminho, a linha sem `armazenada_em`, e alguém tocando em voltar.
 */
vi.mock("@/lib/fila/derivadas", () => ({
  gerarDerivadas: () => new Promise(() => {}),
}));

const empurrados: string[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (destino: string) => {
      empurrados.push(destino);
    },
    replace: () => {},
    refresh: () => {},
  }),
}));

function comCasca(miolo: React.ReactNode) {
  return render(
    <Providers>
      <CascaDoEditor
        eventoId={EVENTO}
        titulo="A nossa história"
        explicacao="Como vocês se conheceram."
        ehDono={false}
        ativa
      >
        {miolo}
      </CascaDoEditor>
    </Providers>
  );
}

/**
 * Devolve `true` quando o clique NÃO foi interrompido — que é o que
 * `fireEvent.click` responde. É a forma honesta de verificar "o link continua
 * sendo um link" sem depender do jsdom navegar, coisa que ele não faz.
 */
function voltar(): boolean {
  return fireEvent.click(screen.getByRole("link", { name: /voltar para o site/i }));
}

beforeEach(() => {
  empurrados.length = 0;
  vi.unstubAllGlobals();
});

describe("sem alteração, o caminho de volta não é interrompido", () => {
  it("clicar em voltar não abre diálogo nenhum", () => {
    comCasca(
      <EditorDaHistoria dados={{ eventoId: EVENTO, titulo: "", texto: "Era uma vez." }} />
    );

    expect(voltar()).toBe(true);

    expect(screen.queryByText(/sair sem salvar/i)).not.toBeInTheDocument();
  });
});

describe("com texto digitado e não salvo", () => {
  it("voltar pergunta antes, e diz o que se perde", () => {
    comCasca(
      <EditorDaHistoria dados={{ eventoId: EVENTO, titulo: "", texto: "Era uma vez." }} />
    );

    fireEvent.change(screen.getByLabelText(/como vocês se conheceram/i), {
      target: { value: "Era uma vez, e mais um parágrafo." },
    });

    voltar();

    expect(screen.getByRole("heading", { name: "Sair sem salvar?" })).toBeInTheDocument();
    // A frase diz o que acontece com o SITE, e não só com o formulário: é a
    // pergunta que a pessoa está realmente fazendo ao ver o diálogo.
    expect(screen.getByText(/o site continua como está hoje/i)).toBeInTheDocument();
    // Nada de navegação enquanto ela não decidir.
    expect(empurrados).toEqual([]);
  });

  it("continuar editando não sai", () => {
    comCasca(<EditorDaHistoria dados={{ eventoId: EVENTO, titulo: "", texto: "" }} />);

    fireEvent.change(screen.getByLabelText(/como vocês se conheceram/i), {
      target: { value: "Uma frase." },
    });

    voltar();
    fireEvent.click(screen.getByRole("button", { name: /continuar editando/i }));
    expect(empurrados).toEqual([]);
  });

  it("sair sem salvar sai — a decisão da pessoa é respeitada de primeira", () => {
    comCasca(<EditorDaHistoria dados={{ eventoId: EVENTO, titulo: "", texto: "" }} />);

    fireEvent.change(screen.getByLabelText(/como vocês se conheceram/i), {
      target: { value: "Uma frase." },
    });

    voltar();
    fireEvent.click(screen.getByRole("button", { name: /sair sem salvar/i }));
    expect(empurrados).toEqual([`/painel/${EVENTO}/site`]);
  });

  it("depois de salvar, o aviso some — o servidor passou a ter o que está na tela", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
    );

    comCasca(<EditorDaHistoria dados={{ eventoId: EVENTO, titulo: "", texto: "" }} />);

    fireEvent.change(screen.getByLabelText(/como vocês se conheceram/i), {
      target: { value: "Uma frase." },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar a história/i }));

    await waitFor(() => expect(screen.getByText(/Salvo\./)).toBeInTheDocument());

    /**
     * A cascata precisa assentar antes do clique: o editor publica "limpo", a
     * casca re-renderiza, e só então o `onClick` do link é o novo. No navegador
     * isso acontece antes de qualquer dedo chegar à tela; aqui, sem este
     * respiro, o teste clicaria no manipulador da renderização anterior e
     * reprovaria um comportamento correto.
     */
    await act(async () => {});

    expect(voltar()).toBe(true);
    expect(screen.queryByRole("heading", { name: "Sair sem salvar?" })).not.toBeInTheDocument();
  });
});

describe("no editor da galeria, a legenda digitada conta como alteração", () => {
  const FOTO: FotoNoEditor[] = [
    {
      id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
      urlMiniatura: null,
      legenda: null,
      ordem: 1,
      apareceNoSite: true,
    },
  ];

  it("a foto já está publicada, e por isso a legenda por salvar avisa", () => {
    comCasca(
      <EditorDaGaleria dados={{ eventoId: EVENTO, fotos: FOTO, envioDisponivel: true }} />
    );

    fireEvent.change(screen.getByLabelText(/legenda/i), {
      target: { value: "Na praia, no primeiro dia." },
    });

    voltar();
    expect(screen.getByRole("heading", { name: "Sair sem salvar?" })).toBeInTheDocument();
  });

  it("sem nada digitado, a galeria não interrompe a saída", () => {
    comCasca(
      <EditorDaGaleria dados={{ eventoId: EVENTO, fotos: FOTO, envioDisponivel: true }} />
    );

    expect(voltar()).toBe(true);
    expect(screen.queryByRole("heading", { name: "Sair sem salvar?" })).not.toBeInTheDocument();
  });
});

describe("envio em curso não é alteração não salva — é outra perda, e outra frase", () => {
  it("a frase fala da foto, e não de salvar", async () => {
    comCasca(
      <EditorDaGaleria dados={{ eventoId: EVENTO, fotos: [], envioDisponivel: true }} />
    );

    const campo = document.querySelector('input[type="file"]') as HTMLInputElement;
    const arquivo = new File(["conteudo"], "nos-dois.jpg", { type: "image/jpeg" });
    Object.defineProperty(campo, "files", { value: [arquivo] });
    fireEvent.change(campo);

    await act(async () => {});

    expect(voltar()).toBe(false);
    expect(
      screen.getByRole("heading", { name: "O envio ainda não terminou" })
    ).toBeInTheDocument();

    /**
     * A diferença que a história pede por escrito: aqui não existe botão de
     * salvar que resolva. A saída é mandar a foto de novo, e o texto diz isso —
     * dizer "sair sem salvar?" mandaria a pessoa procurar um botão inexistente.
     */
    expect(screen.getByText(/precisam mandá-la de novo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /esperar o envio/i })).toBeInTheDocument();
    expect(screen.queryByText(/sair sem salvar/i)).not.toBeInTheDocument();
  });
});
