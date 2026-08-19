import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorDaGaleria, type FotoNoEditor } from "@/components/painel/site/EditorDaGaleria";
import { Providers } from "@/components/Providers";

/**
 * DOIS TOQUES RÁPIDOS EM SUBIR/DESCER — que é o que acontece no celular.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR, e ele tem duas metades.**
 *
 * 1. **Travar a tela enquanto salva.** É o que o `PainelDoSite` faz, e lá está
 *    certo: sete seções, quase sempre um movimento por vez. Aqui são doze fotos,
 *    e levar a última ao topo são **onze toques seguidos** — com o botão
 *    desabilitado a cada um, isso é onze esperas de rede em cima de alguém que
 *    só queria arrumar a ordem. No celular, um botão que não responde ao segundo
 *    toque não é lido como "está salvando": é lido como "travou".
 *
 * 2. **Disparar um pedido por toque.** Onze `PATCH` concorrentes numa conexão de
 *    celular chegam fora de ordem, e o **penúltimo estado grava por último**. A
 *    tela mostraria uma ordem e o site teria outra, sem erro em lugar nenhum.
 *
 * A saída é a fila de um lugar só: a lista move na hora, e enquanto um pedido
 * está no ar o toque seguinte **substitui o pendente** em vez de abrir outro.
 * Como o corpo é a lista inteira (RV-05), o último pedido descreve o estado
 * final sozinho.
 *
 * **É UM COMPORTAMENTO QUE UMA SIMPLIFICAÇÃO DESFAZ EM DOIS MINUTOS** — "por que
 * essa fila? é só dar `await` em cada toque" —, e o sintoma da simplificação não
 * aparece em nenhuma tela de desenvolvimento, onde a rede responde em 3 ms. Por
 * isso é teste, e não comentário.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";

const FOTOS: FotoNoEditor[] = [
  { id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", urlMiniatura: null, legenda: null, ordem: 1, apareceNoSite: true },
  { id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb", urlMiniatura: null, legenda: null, ordem: 2, apareceNoSite: true },
  { id: "cccccccc-3333-4333-8333-cccccccccccc", urlMiniatura: null, legenda: null, ordem: 3, apareceNoSite: true },
];

type Pedido = { url: string; metodo: string; corpo: unknown };

/** Os pedidos disparados, e o gatilho que solta cada resposta na mão. */
let pedidos: Pedido[] = [];
let soltar: Array<() => void> = [];
let respondeCom: { ok: boolean; status: number } = { ok: true, status: 200 };

function montar(fotos: FotoNoEditor[] = FOTOS) {
  return render(
    <Providers>
      <EditorDaGaleria
        dados={{ eventoId: EVENTO, fotos, envioDisponivel: true }}
      />
    </Providers>
  );
}

beforeEach(() => {
  pedidos = [];
  soltar = [];
  respondeCom = { ok: true, status: 200 };

  vi.stubGlobal("fetch", (url: string, opcoes: RequestInit = {}) => {
    pedidos.push({
      url,
      metodo: opcoes.method ?? "GET",
      corpo: opcoes.body ? JSON.parse(String(opcoes.body)) : null,
    });
    /**
     * A RESPOSTA FICA PRESA ATÉ ALGUÉM SOLTAR. É o que torna a corrida
     * observável: com uma promessa já resolvida, o segundo toque aconteceria
     * depois de o primeiro pedido ter terminado, e o teste mediria um cenário
     * que não existe no celular de ninguém.
     */
    return new Promise(resolve => {
      soltar.push(() =>
        resolve({
          ok: respondeCom.ok,
          status: respondeCom.status,
          json: async () => ({ fotos: [] }),
        } as Response)
      );
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * As fotos na ordem em que a tela as desenha, lidas pelos rótulos dos botões.
 *
 * `hidden: true` porque o `Dialog` do MUI marca o resto da página com
 * `aria-hidden` enquanto está montado, e a transição de saída dura mais que a
 * asserção. Sem isto, um teste que apaga uma foto não encontra a lista de volta
 * — e o erro apontaria para a lista, não para o diálogo.
 */
function ordemNaTela(): string[] {
  return screen
    .getAllByRole("button", { name: /^Subir a foto/, hidden: true })
    .map(botao => botao.getAttribute("aria-label")!);
}

describe("a ordem move na hora, e os pedidos se fundem", () => {
  it("**dois toques rápidos movem duas vezes na tela, e não esperam a rede**", async () => {
    montar();

    // A primeira foto desce duas posições, em dois toques, sem nenhuma resposta
    // ter chegado — a rede continua presa.
    fireEvent.click(screen.getByRole("button", { name: "Descer a foto 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Descer a foto 2" }));

    // Três fotos continuam na tela, e nenhuma esperou.
    expect(ordemNaTela()).toHaveLength(3);
    expect(pedidos.length, "cada toque abriu o seu próprio pedido").toBe(1);
  });

  it("**o segundo toque não abre um segundo pedido concorrente**", async () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Descer a foto 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Descer a foto 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir a foto 3" }));

    /**
     * Três toques, **um** pedido no ar. Os outros dois viraram um pendente só —
     * e ele descreve o estado final, porque o corpo é a lista inteira.
     */
    expect(pedidos).toHaveLength(1);

    soltar[0]();

    // Solto o primeiro, sai o segundo: o pendente. E só ele.
    await waitFor(() => expect(pedidos).toHaveLength(2));
    expect(pedidos[1].metodo).toBe("PATCH");
    expect(pedidos[1].url).toContain(`/api/eventos/${EVENTO}/site/galeria`);
  });

  it("**o último pedido descreve o que está na tela** — a lista inteira, com 1..N", async () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Descer a foto 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Descer a foto 2" }));
    soltar[0]();
    await waitFor(() => expect(pedidos).toHaveLength(2));

    const corpo = pedidos[1].corpo as { fotos: Array<{ id: string; ordem: number }> };

    // A lista INTEIRA (RV-05), e não só as duas que mudaram.
    expect(corpo.fotos).toHaveLength(3);
    // A ordem é REESCRITA de 1 a N, e não trocada entre duas linhas: uma galeria
    // que nunca foi reordenada tem os números de chegada, e um envio que morreu
    // no meio pode ter deixado empates.
    expect(corpo.fotos.map(f => f.ordem)).toEqual([1, 2, 3]);
    // A que estava em primeiro desceu duas: ela é a última do corpo.
    expect(corpo.fotos[2].id).toBe(FOTOS[0].id);
  });

  it("**os botões de mover NÃO são desabilitados enquanto salva**", () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Descer a foto 1" }));

    /**
     * A divergência deliberada com o `PainelDoSite`. Lá o botão desabilitado
     * custa uma espera por movimento em sete seções; aqui custaria onze esperas
     * para levar a décima segunda foto ao topo — e um botão que não responde ao
     * segundo toque é lido como defeito, não como cuidado.
     *
     * Os únicos desabilitados continuam sendo os das pontas: a primeira não sobe
     * e a última não desce.
     */
    const descer = screen.getAllByRole("button", { name: /^Descer a foto/ });
    expect(descer[0]).not.toBeDisabled();
    expect(descer[1]).not.toBeDisabled();
    expect(descer[2], "a última foto oferece um botão de descer que não desce").toBeDisabled();

    const subir = screen.getAllByRole("button", { name: /^Subir a foto/ });
    expect(subir[0], "a primeira foto oferece um botão de subir que não sobe").toBeDisabled();
    expect(subir[1]).not.toBeDisabled();
  });

  it("**falhando, a tela volta à última ordem que o servidor confirmou, e diz isso**", async () => {
    montar();
    respondeCom = { ok: false, status: 500 };

    const antes = ordemNaTela();
    fireEvent.click(screen.getByRole("button", { name: "Descer a foto 1" }));
    soltar[0]();

    /**
     * A mensagem diz **em que estado o site ficou**, que é a regra das falhas
     * deste produto: quem vê um erro e não sabe se gravou pela metade aperta de
     * novo, e a segunda tentativa é a que faz estrago.
     */
    await screen.findByText(/A ordem no site continua a de antes/);
    expect(ordemNaTela()).toEqual(antes);
  });
});

describe("a legenda salva por botão, e o botão só existe quando há o que salvar", () => {
  it("**sem mudança, não há botão de salvar** — doze botões acesos ensinam a ignorá-los", () => {
    montar();
    expect(screen.queryByRole("button", { name: "Salvar legenda" })).toBeNull();
  });

  it("digitar faz o botão aparecer, e ele manda `PATCH` na foto", async () => {
    montar();

    const campos = screen.getAllByLabelText("Legenda");
    fireEvent.change(campos[0], { target: { value: "Nossa primeira viagem." } });

    const botao = await screen.findByRole("button", { name: "Salvar legenda" });
    fireEvent.click(botao);

    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].metodo).toBe("PATCH");
    expect(pedidos[0].url).toContain(`/site/galeria/${FOTOS[0].id}`);
    expect(pedidos[0].corpo).toEqual({ legenda: "Nossa primeira viagem." });
  });

  it("**limpar o campo manda `null`, e não `\"\"`**", async () => {
    montar([{ ...FOTOS[0], legenda: "Uma legenda antiga." }]);

    fireEvent.change(screen.getByLabelText("Legenda"), { target: { value: "" } });
    fireEvent.click(await screen.findByRole("button", { name: "Salvar legenda" }));

    await waitFor(() => expect(pedidos).toHaveLength(1));
    /**
     * `""` e `null` são a mesma intenção — a foto volta a não ter legenda — e o
     * servidor trata as duas igual. Mandar `""` mesmo assim ensinaria a próxima
     * tela a mandar `""` para um campo onde a diferença importa.
     */
    expect(pedidos[0].corpo).toEqual({ legenda: null });
  });
});

describe("apagar diz o que faz antes de fazer", () => {
  it("**a caixa nomeia a consequência, e não pergunta se a pessoa tem certeza**", async () => {
    montar();

    fireEvent.click(screen.getAllByRole("button", { name: "Apagar" })[0]);

    /**
     * É a única exclusão da v1.0 que apaga byte, e a caixa é a mesma promessa que
     * a confirmação de tirar o site do ar aponta (RV-21): o endereço da foto
     * para de responder. Quem chega aqui vindo de lá precisa reconhecer as
     * palavras.
     */
    await screen.findByText(/O arquivo sai do ar de verdade e não volta/);
    expect(screen.getByText(/inclusive para quem já tinha guardado o link/)).toBeTruthy();

    // Nada foi pedido ainda: a caixa é um passo, e não dois — mas ela é um.
    expect(pedidos).toEqual([]);
  });

  it("**o balde recusando: 502, a foto continua na lista, e o texto diz as duas metades**", async () => {
    montar();
    respondeCom = { ok: false, status: 502 };

    fireEvent.click(screen.getAllByRole("button", { name: "Apagar" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Apagar a foto" }));
    soltar[0]();

    await screen.findByText(/A foto continua no site, e nada foi apagado pela metade/);
    // As três continuam lá. Uma foto que some da tela sobre um arquivo que não
    // saiu é a mentira que a rota responde 502 para não contar.
    expect(ordemNaTela()).toHaveLength(3);
  });

  it("**a falha no meio manda apertar de novo, porque é isso que conserta**", async () => {
    montar();
    respondeCom = { ok: false, status: 500 };

    fireEvent.click(screen.getAllByRole("button", { name: "Apagar" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Apagar a foto" }));
    soltar[0]();

    /**
     * Entre o arquivo sair do balde e a linha ser marcada, o processo pode
     * morrer. Daqui não dá para saber de que lado a falha ficou — o que dá para
     * dizer é o que resolve os dois casos, e é apertar apagar de novo: apagar o
     * que já não existe atravessa o balde sem fazer nada e chega à linha.
     */
    await screen.findByText(/Toque em apagar de novo/);
    expect(ordemNaTela()).toHaveLength(3);
  });
});
