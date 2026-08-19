import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "@/components/Providers";
import { EditorDasPerguntas } from "@/components/painel/site/EditorDasPerguntas";
import { PERGUNTAS_SUGERIDAS } from "@/lib/conteudo-do-site";

/**
 * A OFERTA DAS CINCO, NA TELA (v1.0, V-16).
 *
 * O que este arquivo segura é a **borda** da história, não o caminho feliz:
 * quando a oferta aparece, quando ela some, e o que ela promete. As cinco
 * entrando no banco são assunto de `perguntas-sugeridas.test.ts`.
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";

let pedidos: { url: string; corpo: unknown }[] = [];

beforeEach(() => {
  pedidos = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      pedidos.push({ url: String(entrada), corpo: JSON.parse(String(init?.body ?? "null")) });
      const enviadas = (JSON.parse(String(init?.body ?? "{}")) as { perguntas?: string[] })
        .perguntas as unknown as { pergunta: string }[] | undefined;
      return new Response(
        JSON.stringify({
          perguntas: (enviadas ?? []).map((p, i) => ({
            id: `id-${i}`,
            pergunta: p.pergunta,
            resposta: null,
            ordem: i + 1,
          })),
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      );
    })
  );
});

function montar(houvePergunta: boolean) {
  return render(
    <Providers>
      <EditorDasPerguntas dados={{ eventoId: EVENTO, perguntas: [], houvePergunta }} />
    </Providers>
  );
}

describe("a seção que nunca teve pergunta", () => {
  it("oferece as cinco, e diz que elas não vão ao ar sem resposta", () => {
    montar(false);

    expect(screen.getByRole("button", { name: /começar com essas cinco/i })).toBeInTheDocument();
    /**
     * A segunda metade da frase é o que faz a oferta ser aceitável. Sem ela,
     * "usar as cinco" soa como publicar cinco perguntas em branco no site do
     * casamento — e quem entende assim não toca no botão, que é a leitura errada
     * da coisa certa.
     */
    expect(screen.getByText(/nenhuma aparece no site enquanto vocês não responderem/i)).toBeInTheDocument();
  });

  it("aceitar manda **uma** requisição com os cinco itens, todos sem resposta", async () => {
    montar(false);

    fireEvent.click(screen.getByRole("button", { name: /começar com essas cinco/i }));

    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].url).toContain("/site/perguntas");
    const corpo = pedidos[0].corpo as { perguntas: { pergunta: string; resposta: null }[] };
    expect(corpo.perguntas.map(p => p.pergunta)).toEqual([...PERGUNTAS_SUGERIDAS]);
    expect(corpo.perguntas.every(p => p.resposta === null)).toBe(true);
  });

  it("depois de aceitar, as cinco aparecem marcadas como sem resposta e a oferta some", async () => {
    montar(false);

    fireEvent.click(screen.getByRole("button", { name: /começar com essas cinco/i }));

    await waitFor(() => expect(screen.getByText("Qual é o traje?")).toBeInTheDocument());
    expect(screen.getAllByText("sem resposta")).toHaveLength(5);
    expect(screen.getByText(/5 perguntas estão sem resposta e não aparecem no site/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /começar com essas cinco/i })).not.toBeInTheDocument();
  });
});

describe("a seção que já teve pergunta e ficou vazia", () => {
  it("**não oferece as cinco de novo** — a recusa do casal vale", () => {
    montar(true);

    expect(screen.queryByRole("button", { name: /começar com essas cinco/i })).not.toBeInTheDocument();
    // O caminho de escrever continua ali, e vira a ação principal.
    expect(screen.getByRole("button", { name: /escrever a primeira/i })).toBeInTheDocument();
  });
});

describe("a lista vazia tem um caminho de escrever, e não dois", () => {
  it("o botão de baixo não aparece quando o estado vazio está na tela", () => {
    montar(false);

    /**
     * Dois botões para a mesma ação a dois centímetros de distância — e o de
     * baixo dizendo "outra" numa tela onde não existe nenhuma. Com a oferta das
     * cinco, viravam três.
     */
    expect(screen.queryByRole("button", { name: /escrever outra/i })).not.toBeInTheDocument();
  });
});
