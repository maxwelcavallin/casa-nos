import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FolhaDeEnvio } from "@/components/album/FolhaDeEnvio";
import { MinhasFotos } from "@/components/album/MinhasFotos";
import { ListaDeConvidados } from "@/components/painel/ListaDeConvidados";
import { MateriaisDoQr } from "@/components/painel/MateriaisDoQr";
import { Providers } from "@/components/Providers";
import { TelaoDoSalao } from "@/components/telao/TelaoDoSalao";

/**
 * AS TELAS DA F1.3 E DA F1.4, MONTADAS.
 *
 * O QUE ELE PEGA: import quebrado, hook fora de ordem, prop obrigatória que
 * sumiu, o texto exato do `gtm.md`, e as promessas de acessibilidade que as
 * histórias escrevem como critério de aceite.
 *
 * O QUE ELE NÃO PEGA: layout. Uma tela que renderiza inteira torta passa aqui em
 * verde — e no telão isso é literalmente invisível, porque não há a quem
 * perguntar. Verificação de pixel exige navegador; verificação de **projeção**
 * exige um projetor e uma sala escura, e as duas estão na lista do ensaio.
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";
const PARTICIPACAO = "22222222-2222-4222-8222-222222222222";
const MIDIA = "33333333-3333-4333-8333-333333333333";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
}));

type Midia = {
  id: string;
  lote_id: string;
  visibilidade: "feed" | "noivos";
  chegada: "chegando" | "ainda_subindo" | "completa";
  miniatura: string | null;
  previa: string | null;
};

function respostaDeMinhas(itens: Midia[], originaisPendentes = 0) {
  return vi.fn(async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    const corpo = url.includes("/minhas")
      ? { itens, cursor: null, total: itens.length, originais_pendentes: originaisPendentes }
      : url.includes("/telao")
        ? { versao: "", fotos: [] }
        : {};
    return new Response(JSON.stringify(corpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", respostaDeMinhas([]));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * H-08 · as minhas fotos
 * ------------------------------------------------------------------ */

function montarMinhas(sobrepor: Partial<React.ComponentProps<typeof MinhasFotos>> = {}) {
  return render(
    <Providers>
      <MinhasFotos
        eventoId={EVENTO}
        slug="ana-e-max"
        participacaoId={PARTICIPACAO}
        faixaLenta={false}
        estadoDoEnvio="aberto"
        abertura={{ dia: "21 de agosto", hora: null }}
        diasDesdeOEvento={0}
        convidados={[]}
        rotuloAtual={null}
        precisaSeIdentificar={false}
        usuario={`g:${PARTICIPACAO}`}
        {...sobrepor}
      />
    </Providers>
  );
}

describe("As minhas fotos — o título é literal, e as duas perguntas convivem", () => {
  it("o título não carrega nome de ninguém (§17.6, RN-31)", async () => {
    /**
     * "As minhas fotos", sempre — nunca "as fotos do Tio Carlos". Nome de
     * convidado é PII de **terceiro**, e ele nem escolheu estar ali. Como o
     * título não contém dado do usuário, ele tem comprimento fixo e o teste de
     * estresse de 40/60 caracteres não se aplica ao cabeçalho.
     */
    montarMinhas();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "As minhas fotos"
    );
    expect(screen.getByText("Só você vê esta tela.")).toBeInTheDocument();
  });

  it("o vazio explica o que é a tela e oferece a ação", async () => {
    montarMinhas();
    expect(await screen.findByText("Aqui ficam as suas fotos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mandar minhas fotos" })).toBeInTheDocument();
  });

  it("cada foto responde às DUAS perguntas, e a de destino em 100% delas", async () => {
    vi.stubGlobal(
      "fetch",
      respostaDeMinhas(
        [
          {
            id: MIDIA,
            lote_id: "l1",
            visibilidade: "noivos",
            chegada: "chegando",
            miniatura: null,
            previa: null,
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            lote_id: "l1",
            visibilidade: "feed",
            chegada: "ainda_subindo",
            miniatura: null,
            previa: null,
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            lote_id: "l1",
            visibilidade: "feed",
            chegada: "completa",
            miniatura: null,
            previa: null,
          },
        ],
        1
      )
    );
    montarMinhas();

    /**
     * O `aria-label` do card é o **único portador escrito** de `Ainda subindo`
     * na grade — no tile de 104 px o chip fica só com o glifo, porque a
     * assimetria de largura é o sinal mais forte em escala de cinza (§15.7).
     * Quem editar estes rótulos está mexendo em acessibilidade, não em texto.
     */
    expect(
      await screen.findByRole("button", { name: /só para os noivos, chegando/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /na festa, ainda subindo/i })
    ).toBeInTheDocument();
    // Terminal: sem selo visível, **mas com a resposta de destino no rótulo**.
    // Ausência não é sinal para quem não vê a tela.
    expect(screen.getByRole("button", { name: /^foto, na festa$/i })).toBeInTheDocument();
  });

  it("o resumo do topo aparece só com original pendente, e diz a condição", async () => {
    vi.stubGlobal(
      "fetch",
      respostaDeMinhas(
        [
          {
            id: MIDIA,
            lote_id: "l1",
            visibilidade: "feed",
            chegada: "ainda_subindo",
            miniatura: null,
            previa: null,
          },
        ],
        1
      )
    );
    montarMinhas();
    expect(
      await screen.findByText(
        "Suas fotos já estão com os noivos. Uma delas ainda tem uma versão maior, que chega quando você abrir este link de novo."
      )
    ).toBeInTheDocument();
  });

  it("sem pendência, o slot do topo NÃO existe — nem como `0 fotos`", async () => {
    montarMinhas();
    await screen.findByText("Aqui ficam as suas fotos");
    expect(screen.queryByText(/versão maior/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 fotos/)).not.toBeInTheDocument();
  });

  it("nunca fala de fila de aprovação, e nunca usa `falhou` (RN-07)", async () => {
    const { container } = montarMinhas();
    await screen.findByText("Aqui ficam as suas fotos");
    const texto = container.textContent?.toLowerCase() ?? "";
    expect(texto).not.toContain("aprova");
    expect(texto).not.toContain("falhou");
  });

  it("a precedência da janela substitui o vazio, e o botão some", async () => {
    montarMinhas({ estadoDoEnvio: "antes_da_janela" });
    expect(await screen.findByText("Você chegou antes da festa")).toBeInTheDocument();
    expect(screen.queryByText("Aqui ficam as suas fotos")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mandar minhas fotos" })
    ).not.toBeInTheDocument();
  });

  it("o atalho de teclado é o primeiro focável, e leva à região da ação", async () => {
    const { container } = montarMinhas();
    await screen.findByText("Aqui ficam as suas fotos");
    const focaveis = container.querySelectorAll(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    expect(focaveis[0]).toHaveTextContent("Pular para mandar minhas fotos");
    expect(screen.getByRole("region", { name: "Mandar fotos" })).toBeInTheDocument();
    // A região da GRADE herda o nome do `h1` desta tela, e não se chama
    // "Fotos da festa": quem navega por rotor ouviria o nome de outra tela.
    expect(screen.getByRole("region", { name: "As minhas fotos" })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ *
 * H-10 · a folha de envio, e as oito proibições de neutralidade
 * ------------------------------------------------------------------ */

describe("A folha de envio — os dois botões SÃO a escolha", () => {
  function montarFolha(sobrepor: Partial<React.ComponentProps<typeof FolhaDeEnvio>> = {}) {
    return render(
      <Providers>
        <FolhaDeEnvio
          aberta
          aoFechar={() => {}}
          previas={[{ chave: "a", url: null }, { chave: "b", url: null }]}
          videosRecusados={0}
          aoEscolher={() => {}}
          {...sobrepor}
        />
      </Providers>
    );
  }

  it("os dois botões existem, com o texto exato e a mesma largura", () => {
    montarFolha();
    const festa = screen.getByRole("button", { name: "Mandar para a festa" });
    const noivos = screen.getByRole("button", { name: "Mandar só para os noivos" });
    expect(festa).toBeInTheDocument();
    expect(noivos).toBeInTheDocument();
    // `contained` × `outlined`: o secundário perde peso por UMA coisa só, não
    // ter preenchimento. É a menor diferença que ainda comunica hierarquia.
    expect(festa.className).toMatch(/contained/);
    expect(noivos.className).toMatch(/outlined/);
    // Nunca `text` — a H-10 proíbe "link cinza".
    expect(noivos.className).not.toMatch(/MuiButton-text/);
  });

  it("nenhum dos dois tem ícone, selo ou prova social (§16.5b)", () => {
    montarFolha();
    for (const botao of document.querySelectorAll(".MuiButton-root")) {
      expect(botao.querySelector("svg")).toBeNull();
    }
    const texto = document.body.textContent ?? "";
    for (const empurrao of ["recomendado", "mais usado", "a maioria", "pessoas mandaram"]) {
      expect(texto.toLowerCase()).not.toContain(empurrao);
    }
  });

  it("nenhum dos dois recebe foco inicial — o foco é o título", () => {
    // Botão focado é botão sugerido, e isso contaminaria a razão entre os dois
    // cliques, que é o instrumento da hipótese central do produto.
    montarFolha();
    expect(screen.getByRole("button", { name: "Mandar para a festa" })).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "Mandar só para os noivos" })).not.toHaveFocus();
  });

  it("a explicação vem ANTES dos botões e a ressalva DEPOIS", () => {
    montarFolha();
    // A folha é um `Drawer`, e o conteúdo dele vive num portal fora do
    // contêiner do `render`. A ordem que interessa é a do documento.
    const texto = document.body.textContent ?? "";
    const explicacao = texto.indexOf("Foto da festa aparece no telão");
    const primario = texto.indexOf("Mandar para a festa");
    const ressalva = texto.indexOf("Dá para mudar depois");
    expect(explicacao).toBeGreaterThanOrEqual(0);
    // A explicação é lida antes da decisão; a ressalva é reparo para quem errou,
    // não permissão para escolher no chute.
    expect(explicacao).toBeLessThan(primario);
    expect(ressalva).toBeGreaterThan(primario);
  });

  it("vídeo no lote: as fotos seguem, e a frase não culpa quem escolheu", () => {
    montarFolha({ videosRecusados: 1 });
    expect(
      screen.getByText(
        "Por enquanto só foto. Mandamos as 2 fotos deste lote e o vídeo ficou de fora."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mandar para a festa" })).toBeInTheDocument();
  });

  it("lote só com vídeo: os botões NÃO somem, ficam no lugar sem fazer nada", async () => {
    // Botão que some troca a folha de forma e move a decisão de lugar.
    const aoEscolher = vi.fn();
    montarFolha({ previas: [], videosRecusados: 1, aoEscolher });
    const festa = screen.getByRole("button", { name: "Mandar para a festa" });
    expect(festa).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(festa);
    expect(aoEscolher).not.toHaveBeenCalled();
    expect(
      screen.getByText("Por enquanto só foto. Escolha as fotos e a gente manda.")
    ).toBeInTheDocument();
  });

  it("escolher um dos dois devolve a visibilidade correspondente", async () => {
    const aoEscolher = vi.fn();
    montarFolha({ aoEscolher });
    fireEvent.click(screen.getByRole("button", { name: "Mandar só para os noivos" }));
    expect(aoEscolher).toHaveBeenCalledWith("noivos");
  });
});

/* ------------------------------------------------------------------ *
 * H-03 · a lista de convidados
 * ------------------------------------------------------------------ */

describe("Painel — a lista de convidados", () => {
  function montarLista(sobrepor: Partial<React.ComponentProps<typeof ListaDeConvidados>["dados"]> = {}) {
    return render(
      <Providers>
        <ListaDeConvidados
          dados={{
            eventoId: EVENTO,
            convidados: [],
            festaTerminou: false,
            ehDono: false,
            ...sobrepor,
          }}
        />
      </Providers>
    );
  }

  it("o vazio abre com a caixa de colar e o exemplo de duas linhas", () => {
    montarLista();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cole a sua lista aqui");
    const caixa = screen.getByLabelText("Sua lista de convidados");
    // O exemplo é `placeholder` de CONTEÚDO; o rótulo é de verdade e fica acima
    // — `placeholder` não é rótulo, ele some quando a pessoa digita.
    expect(caixa).toHaveAttribute("placeholder", "Ana Paula Ribeiro\nFamília Silva, 4");
    expect(screen.getByRole("button", { name: "Criar a lista" })).toBeInTheDocument();
  });

  it("cheio: as duas grandezas aparecem separadas, e nunca somadas", () => {
    montarLista({
      convidados: [
        { id: "1", nome: "Ana Paula Ribeiro", pessoasNoSlot: 1, ausente: null },
        { id: "2", nome: "Família Silva", pessoasNoSlot: 4, ausente: null },
      ],
    });
    expect(screen.getByText("2 nomes na lista")).toBeInTheDocument();
    expect(screen.getByText("5 pessoas ao todo")).toBeInTheDocument();
    // 7 seria a soma das duas. Ela não existe em lugar nenhum da tela.
    expect(screen.queryByText(/\b7\b/)).not.toBeInTheDocument();
  });

  it("`Não foi` só existe depois da festa", () => {
    const antes = montarLista({
      convidados: [{ id: "1", nome: "Tio Carlos", pessoasNoSlot: 1, ausente: null }],
      festaTerminou: false,
    });
    expect(within(antes.container).queryByRole("button", { name: "Não foi" })).toBeNull();

    montarLista({
      convidados: [{ id: "1", nome: "Tio Carlos", pessoasNoSlot: 1, ausente: null }],
      festaTerminou: true,
    });
    expect(screen.getByRole("button", { name: "Não foi" })).toBeInTheDocument();
  });

  it("a pergunta de apagar contém o NOME e diz a consequência", async () => {
    montarLista({
      convidados: [{ id: "1", nome: "Ana Silva", pessoasNoSlot: 1, ausente: null }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    expect(screen.getByText("Apagar Ana Silva da lista?")).toBeInTheDocument();
    // A consequência que a noiva não teria como adivinhar: um slot excluído que
    // já tem mídia **continua contando** na medição da janela do evento.
    expect(
      screen.getByText("Se ela já mandou fotos, elas continuam no álbum e continuam contando.")
    ).toBeInTheDocument();
  });

  it("o selo do dono só aparece para o dono", () => {
    const semDono = montarLista();
    expect(within(semDono.container).queryByText("Visão do dono")).toBeNull();
    montarLista({ ehDono: true });
    expect(screen.getByText("Visão do dono")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ *
 * H-04 · os materiais
 * ------------------------------------------------------------------ */

describe("Painel — o código para imprimir", () => {
  function montarMateriais(
    sobrepor: Partial<React.ComponentProps<typeof MateriaisDoQr>["dados"]> = {}
  ) {
    return render(
      <Providers>
        <MateriaisDoQr
          dados={{
            eventoId: EVENTO,
            nomeCasal: "Ana Flávia e Maxwel",
            endereco: "casa-nos.app/e/ana-e-max/album",
            abreEm: "21 de agosto",
            origem: "https://casa-nos.app",
            teloes: [],
            podeConfigurar: true,
            ehDono: false,
            ...sobrepor,
          }}
        />
      </Providers>
    );
  }

  it("os três materiais, com os títulos e os apoios exatos", () => {
    montarMateriais();
    for (const titulo of ["Cartão de mesa", "Cartaz", "Arte do telão"]) {
      expect(screen.getByRole("heading", { name: titulo })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: "Baixar" })).toHaveLength(3);
  });

  it("a frase extra existe SÓ no cartaz", () => {
    // Em `mesa` e em `telao` o espaço dela é vazio — vazio mesmo, não uma versão
    // curta. É regra do componente, não escolha de quem monta a tela.
    montarMateriais();
    expect(screen.getAllByText("O fotógrafo não estava na sua mesa.")).toHaveLength(1);
  });

  it("o endereço por extenso está em todos os três", () => {
    // É a única retentativa que o passo 1 do fluxo tem quando o QR não lê.
    montarMateriais();
    expect(screen.getAllByText("casa-nos.app/e/ana-e-max/album").length).toBeGreaterThanOrEqual(3);
  });

  it("a linha que salva o teste do casal semanas antes", () => {
    montarMateriais();
    expect(
      screen.getByText(
        "Pode testar agora: quem ler o código antes de 21 de agosto vê a data em que os envios abrem."
      )
    ).toBeInTheDocument();
  });

  /**
   * O LINK DO TELÃO NASCE AQUI, e sem ele a H-12 não tem porta.
   *
   * A H-02 pede revogar o link e o `gtm.md` dá o texto do diálogo; **nenhum dos
   * dois diz onde ele é criado**. Ficou registrado como buraco na F1.1 e é
   * fechado aqui, onde o QR e os links vivem juntos.
   */
  it("o casal gera o link do telão, e o endereço aparece UMA vez", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ acesso: { id: "a1" }, token: "f".repeat(64) }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
      )
    );
    montarMateriais();
    fireEvent.click(screen.getByRole("button", { name: "Gerar o link" }));
    expect(
      await screen.findByText(`https://casa-nos.app/telao/${"f".repeat(64)}`)
    ).toBeInTheDocument();
    // O token existe uma vez só — o banco guarda o hash. A tela diz isso, para
    // ninguém procurar o endereço depois.
    expect(screen.getByText(/não aparece de novo/)).toBeInTheDocument();
  });

  it("cancelar pergunta, e a pergunta diz a consequência", () => {
    montarMateriais({ teloes: [{ id: "a1" }] });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar este link" }));
    expect(screen.getByText("Cancelar este link?")).toBeInTheDocument();
    expect(
      screen.getByText("A tela do salão para de receber fotos novas. Você pode gerar outro.")
    ).toBeInTheDocument();
  });

  it("o moderador NÃO vê o que a rota nega", () => {
    /**
     * Ele vê os materiais (`evento.materiais.ver`) e não configura o evento —
     * criar e revogar link é `evento.configurar`, que é só do casal. A rota já
     * recusa; a tela não oferece um botão que devolve 403.
     */
    montarMateriais({ podeConfigurar: false });
    expect(screen.queryByRole("button", { name: /Gerar o link/ })).toBeNull();
    expect(screen.queryByText("Link do telão")).toBeNull();
    // E ele continua vendo os três materiais, que é o que a permissão dele dá.
    expect(screen.getAllByRole("button", { name: "Baixar" })).toHaveLength(3);
  });

  it("nenhum `&` renderizado, em nenhuma tela (§17.5)", () => {
    const { container } = montarMateriais();
    expect(container.textContent).not.toContain("&");
    expect(container.textContent).toContain("Ana Flávia e Maxwel");
  });
});

/* ------------------------------------------------------------------ *
 * H-12 · o telão
 * ------------------------------------------------------------------ */

describe("O telão — o vazio é a arte, e o erro é invisível", () => {
  function montarTelao() {
    return render(
      <Providers>
        <TelaoDoSalao
          eventoId={EVENTO}
          nomeCasal="Ana Flávia e Maxwel"
          endereco="casa-nos.app/e/ana-e-max/album"
          urlDoQr="data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E"
          versaoInicial=""
          token={"a".repeat(64)}
        />
      </Providers>
    );
  }

  it("o primeiro quadro JÁ É a arte do vazio — não existe carregando", () => {
    // Nunca branco, nunca logo girando. O primeiro quadro e os primeiros 20
    // minutos são a mesma imagem, e a ausência de um estado de carregamento é a
    // especificação.
    montarTelao();
    expect(screen.getByText("Ana Flávia e Maxwel")).toBeInTheDocument();
    expect(screen.getByText("Aponte a câmera")).toBeInTheDocument();
    expect(screen.getByText("Suas fotos aparecem aqui")).toBeInTheDocument();
    expect(screen.getByText("feito com casa-nos")).toBeInTheDocument();
  });

  it("com o servidor devolvendo erro, a parede continua igual e muda", async () => {
    /**
     * ESTE É O COMPORTAMENTO QUE A H-12 EXIGE, e ele é difícil de acreditar sem
     * ver: 500 do servidor, e a tela **não muda nada**. Sem ícone, sem aviso,
     * sem "reconectando". Uma mensagem de erro projetada num casamento é
     * incidente, não estado.
     */
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("erro", { status: 500 }))
    );
    const { container } = montarTelao();
    await new Promise(resolver => setTimeout(resolver, 0));
    expect(screen.getByText("Aponte a câmera")).toBeInTheDocument();
    const texto = container.textContent?.toLowerCase() ?? "";
    for (const proibido of ["erro", "reconect", "tentar de novo", "falhou", "offline"]) {
      expect(texto, `a parede contou que algo deu errado: "${proibido}"`).not.toContain(
        proibido
      );
    }
  });

  it("com a rede caída, idem — e nada estoura", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    const { container } = montarTelao();
    await new Promise(resolver => setTimeout(resolver, 0));
    expect(screen.getByText("Aponte a câmera")).toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toContain("rede");
  });

  it("nada clicável na parede", () => {
    const { container } = montarTelao();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("a[href]")).toHaveLength(0);
  });

  it("o telão NÃO conta o estado da janela, nem antes nem depois", () => {
    // A única superfície sem o par da §5.1. Quem olha para ele antes da festa é
    // o casal testando, e a resposta para o casal mora no painel.
    const { container } = montarTelao();
    expect(container.textContent).not.toContain("Você chegou antes da festa");
    expect(container.textContent).not.toContain("foram encerrados");
  });
});
