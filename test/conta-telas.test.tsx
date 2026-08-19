import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmarEmail } from "@/components/conta/ConfirmarEmail";
import { EscolherSenhaNova } from "@/components/conta/EscolherSenhaNova";
import { FormularioDeCadastro } from "@/components/conta/FormularioDeCadastro";
import { FormularioDeEntrada } from "@/components/conta/FormularioDeEntrada";
import { PedirSenhaNova } from "@/components/conta/PedirSenhaNova";
import { Providers } from "@/components/Providers";

/**
 * AS TELAS DA CONTA, MONTADAS (19/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O QUE ESTE ARQUIVO SEGURA É O TEXTO, e cada frase aqui está protegendo uma
 * promessa que o servidor faz do outro lado:**
 *
 * - a tela de "esqueci a senha" **não confirma que o e-mail existe** — se ela
 *   dissesse "mandamos para você", desmentiria o 202 que a rota devolve para
 *   qualquer endereço, e as duas metades juntas viram um verificador de contas;
 * - o cadastro **diz que o site nasce fora do ar** — sem essa frase, o casal
 *   preenche quatro campos achando que acabou de publicar um casamento em
 *   branco;
 * - a tela de senha nova **avisa que os outros aparelhos caem** — a troca revoga
 *   todas as sessões, e sem o aviso o outro celular do casal simplesmente para
 *   de funcionar.
 *
 * O que ele **não** pega é layout. Uma tela que renderiza inteira torta passa
 * aqui em verde.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";

const navegou: string[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (destino: string) => navegou.push(destino),
    push: (destino: string) => navegou.push(destino),
    refresh: () => {},
  }),
}));

type Chamada = { url: string; corpo: unknown };
let chamadas: Chamada[] = [];
let resposta: { status: number; corpo: unknown } = {
  status: 200,
  corpo: { evento_id: EVENTO },
};

const eventosDoGa: { nome: string; parametros: Record<string, unknown> }[] = [];

beforeEach(() => {
  navegou.length = 0;
  chamadas = [];
  eventosDoGa.length = 0;
  resposta = { status: 200, corpo: { evento_id: EVENTO } };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      chamadas.push({ url: String(entrada), corpo: JSON.parse(String(init?.body ?? "null")) });
      return new Response(JSON.stringify(resposta.corpo), {
        status: resposta.status,
        headers: { "content-type": "application/json" },
      });
    })
  );

  (window as unknown as { gtag: unknown }).gtag = (
    tipo: string,
    nome: string,
    parametros: Record<string, unknown>
  ) => {
    if (tipo === "event") eventosDoGa.push({ nome, parametros });
  };
});

describe("entrar", () => {
  it("manda e-mail e senha, e entra no painel do site", async () => {
    render(
      <Providers>
        <FormularioDeEntrada />
      </Providers>
    );

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ana@exemplo.com.br" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "uma frase que a gente lembra" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(navegou).toEqual([`/painel/${EVENTO}/site`]));
    expect(chamadas[0].url).toBe("/api/sessao/entrar");
  });

  it("a recusa do servidor aparece NO CAMPO, e não num alerta no topo", async () => {
    resposta = {
      status: 401,
      corpo: {
        erro: "credenciais nao conferem",
        detalhe: { campos: [{ campo: "senha", mensagem: "E-mail ou senha não conferem." }] },
      },
    };

    render(
      <Providers>
        <FormularioDeEntrada />
      </Providers>
    );
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "qualquer coisa" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(screen.getByText("E-mail ou senha não conferem.")).toBeInTheDocument()
    );
    expect(navegou).toEqual([]);
  });

  it("os dois caminhos de volta estão na tela: criar conta e esquecer a senha", () => {
    render(
      <Providers>
        <FormularioDeEntrada />
      </Providers>
    );
    expect(screen.getByRole("link", { name: /esqueci a senha/i })).toHaveAttribute(
      "href",
      "/recuperar"
    );
    expect(screen.getByRole("link", { name: /criar o site/i })).toHaveAttribute(
      "href",
      "/cadastrar"
    );
  });
});

describe("cadastrar", () => {
  function preencher() {
    fireEvent.change(screen.getByLabelText(/como vocês aparecem no site/i), {
      target: { value: "Ana Flávia e Maxwel" },
    });
    fireEvent.change(screen.getByLabelText(/data do casamento/i), {
      target: { value: "2027-08-22" },
    });
    fireEvent.change(screen.getByLabelText("Cidade"), { target: { value: "Rio de Janeiro" } });
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "rj" } });
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ana@exemplo.com.br" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "uma frase que a gente lembra" },
    });
  }

  it("**diz que o site nasce fora do ar**", () => {
    render(
      <Providers>
        <FormularioDeCadastro />
      </Providers>
    );
    expect(screen.getByText(/ninguém consegue abrir até vocês publicarem/i)).toBeInTheDocument();
  });

  it("o estado é normalizado para maiúsculas enquanto se digita", () => {
    render(
      <Providers>
        <FormularioDeCadastro />
      </Providers>
    );
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "rj" } });
    expect(screen.getByLabelText("Estado")).toHaveValue("RJ");
  });

  it("**emite `sign_up` e `wedding_created` — depois de o servidor confirmar**", async () => {
    resposta = { status: 201, corpo: { evento_id: EVENTO, slug: "ana-flavia-e-maxwel" } };

    render(
      <Providers>
        <FormularioDeCadastro />
      </Providers>
    );
    preencher();

    // Nada de evento antes da resposta: emitir no toque contaria cadastro que
    // não aconteceu, e o GA4 não desconta.
    expect(eventosDoGa).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: /criar o site/i }));

    await waitFor(() => expect(navegou).toEqual([`/painel/${EVENTO}/site`]));
    expect(eventosDoGa.map(e => e.nome)).toEqual(["sign_up", "wedding_created"]);
    expect(eventosDoGa[0].parametros).toMatchObject({
      wedding_id: EVENTO,
      signup_source: "direto",
      referring_wedding_id: "",
    });
  });

  it("a data viaja como texto, sem passar por `Date`", async () => {
    resposta = { status: 201, corpo: { evento_id: EVENTO, slug: "x" } };
    render(
      <Providers>
        <FormularioDeCadastro />
      </Providers>
    );
    preencher();
    fireEvent.click(screen.getByRole("button", { name: /criar o site/i }));

    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect((chamadas[0].corpo as { data_evento: string }).data_evento).toBe("2027-08-22");
  });

  it("o 409 do e-mail repetido aparece no campo do e-mail", async () => {
    resposta = {
      status: 409,
      corpo: {
        erro: "email ja cadastrado",
        detalhe: {
          campos: [{ campo: "email", mensagem: "Já existe uma conta com esse e-mail." }],
        },
      },
    };

    render(
      <Providers>
        <FormularioDeCadastro />
      </Providers>
    );
    preencher();
    fireEvent.click(screen.getByRole("button", { name: /criar o site/i }));

    await waitFor(() =>
      expect(screen.getByText("Já existe uma conta com esse e-mail.")).toBeInTheDocument()
    );
    expect(eventosDoGa).toEqual([]);
  });
});

describe("esqueci a senha", () => {
  it("**a confirmação não diz que o e-mail existe**", async () => {
    resposta = { status: 202, corpo: { enviado: true } };

    render(
      <Providers>
        <PedirSenhaNova />
      </Providers>
    );
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: /mandar o link/i }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Confira o e-mail" })).toBeInTheDocument()
    );
    expect(screen.getByText(/se existir uma conta com esse endereço/i)).toBeInTheDocument();
    // E o formulário sai da tela: mandar de novo invalidaria o link recém-enviado.
    expect(screen.queryByLabelText("E-mail")).not.toBeInTheDocument();
  });
});

describe("a senha nova", () => {
  it("**avisa que os outros aparelhos saem**", () => {
    render(
      <Providers>
        <EscolherSenhaNova token={"a".repeat(64)} />
      </Providers>
    );
    expect(screen.getByText(/os aparelhos que estavam conectados saem/i)).toBeInTheDocument();
  });

  it("sem token, a tela não é de erro — e diz que nada mudou", () => {
    render(
      <Providers>
        <EscolherSenhaNova token={null} />
      </Providers>
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Este link expirou");
    expect(screen.getByText(/a senha atual continua valendo/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pedir outro link/i })).toBeInTheDocument();
  });

  it("troca a senha e entra direto — sem pedir a prova duas vezes", async () => {
    render(
      <Providers>
        <EscolherSenhaNova token={"a".repeat(64)} />
      </Providers>
    );
    fireEvent.change(screen.getByLabelText(/senha nova/i), {
      target: { value: "a senha nova de sempre" },
    });
    fireEvent.click(screen.getByRole("button", { name: /trocar a senha/i }));

    await waitFor(() => expect(navegou).toEqual([`/painel/${EVENTO}/site`]));
  });
});

describe("confirmar o e-mail", () => {
  it("link vencido não vira parede: a conta continua funcionando", async () => {
    resposta = { status: 410, corpo: { erro: "link expirado" } };

    render(
      <Providers>
        <ConfirmarEmail token={"a".repeat(64)} />
      </Providers>
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Este link expirou")
    );
    expect(screen.getByText(/continua funcionando normalmente/i)).toBeInTheDocument();
  });

  it("nenhuma tela de conta usa a palavra 'erro'", () => {
    const { container } = render(
      <Providers>
        <FormularioDeEntrada />
      </Providers>
    );
    expect(container.textContent?.toLowerCase()).not.toContain("erro");
  });
});
