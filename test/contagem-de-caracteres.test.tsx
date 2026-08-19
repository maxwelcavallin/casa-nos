import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { Providers } from "@/components/Providers";
import { EditorDaCapa } from "@/components/painel/site/EditorDaCapa";
import { EditorDaHistoria } from "@/components/painel/site/EditorDaHistoria";
import { TETOS_DE_CONTEUDO } from "@/lib/conteudo-do-site";

/**
 * A CONTAGEM ANTES DO TETO, E O CAMPO QUE NÃO TRUNCA (v1.0, V-17).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **AS DUAS METADES, E A SEGUNDA É A QUE DÁ NOME À HISTÓRIA** — *"para não
 * perder a última frase"*:
 *
 * 1. **A contagem só aparece perto do teto.** Um contador piscando "1.187
 *    restantes" desde a primeira letra não informa nada e vira ruído; a partir
 *    de 200 restantes ele passa a ser informação.
 *
 * 2. **O campo não trunca sozinho.** O `maxLength` parece proteção e é o
 *    contrário: colar do WhatsApp um texto de 1.300 caracteres faz o navegador
 *    jogar fora as últimas 100 letras **em silêncio** — sem mensagem, sem sinal,
 *    e a última frase da história do casal some sem ninguém ver. Sem ele, o
 *    texto inteiro entra, a contagem fica vermelha com o número que passou, e
 *    quem recusa é o servidor — com o número.
 *
 * O teste do atributo é literal de propósito: `maxLength` é a primeira coisa que
 * alguém repõe "para proteger o campo", e o estrago que ele causa não aparece em
 * tela nenhuma.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";

function historiaCom(texto: string) {
  render(
    <Providers>
      <EditorDaHistoria dados={{ eventoId: EVENTO, titulo: "", texto }} />
    </Providers>
  );
  return screen.getByLabelText(/como vocês se conheceram/i) as HTMLTextAreaElement;
}

const TETO = TETOS_DE_CONTEUDO.historiaTexto;

describe("a contagem aparece perto do teto, e não antes", () => {
  it("com 300 restantes, não há contagem nenhuma", () => {
    historiaCom("a".repeat(TETO - 300));
    expect(screen.queryByText(/caracteres até o limite/i)).not.toBeInTheDocument();
  });

  it("com 150 restantes, ela aparece com o número", () => {
    historiaCom("a".repeat(TETO - 150));
    expect(screen.getByText("150 caracteres até o limite")).toBeInTheDocument();
  });

  it("no limite exato, ela ainda diz zero — e não some justo no fim", () => {
    historiaCom("a".repeat(TETO));
    expect(screen.getByText("0 caracteres até o limite")).toBeInTheDocument();
  });
});

describe("o campo não trunca — quem recusa é o servidor", () => {
  it("**não existe `maxLength` no campo da história**", () => {
    const campo = historiaCom("");
    expect(
      campo.getAttribute("maxlength"),
      "O `maxLength` voltou ao campo da história. Com ele, colar um texto acima " +
        "do teto perde o fim em silêncio — que é exatamente o que a V-17 existe " +
        "para impedir."
    ).toBeNull();
  });

  it("colar acima do teto mantém o texto inteiro e diz quanto passou", () => {
    const campo = historiaCom("");
    fireEvent.change(campo, { target: { value: "a".repeat(TETO + 100) } });

    expect(campo.value).toHaveLength(TETO + 100);
    expect(screen.getByText("100 caracteres acima do limite")).toBeInTheDocument();
  });

  it("o nome do casal segue a mesma régua — contagem sempre, e sem truncar", () => {
    render(
      <Providers>
        <EditorDaCapa
          dados={{
            eventoId: EVENTO,
            nomeCasal: "Ana Flávia e Maxwel",
            dataEvento: "2027-08-22",
            horaEvento: "",
            horaPublicada: false,
            cidade: "Rio de Janeiro",
            uf: "RJ",
          }}
        />
      </Providers>
    );

    const campo = screen.getByLabelText(/como vocês aparecem no site/i) as HTMLInputElement;
    expect(campo.getAttribute("maxlength")).toBeNull();

    fireEvent.change(campo, { target: { value: "a".repeat(75) } });
    expect(screen.getByText("15 caracteres acima do limite")).toBeInTheDocument();
  });
});
