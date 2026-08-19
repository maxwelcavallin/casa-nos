import { describe, expect, it } from "vitest";

import { casosDeHora } from "@/test/conteudo-comum";
import {
  atualizarMomento,
  atualizarPergunta,
  buscarHistoria,
  conferirHistoria,
  conferirMomento,
  conferirPergunta,
  contarMomentos,
  contarPerguntas,
  excluirMomento,
  excluirPergunta,
  listarPerguntas,
  MAXIMO_DE_MOMENTOS,
  MAXIMO_DE_PERGUNTAS,
  perguntasRespondidas,
  salvarHistoria,
  TETOS_DE_CONTEUDO,
  type Pergunta,
} from "@/lib/conteudo-do-site";
import type { Executor } from "@/lib/db";
import { paragrafos } from "@/lib/texto";

/**
 * AS TRÊS SEÇÕES NOVAS DA v1.0 (V-07, V-08 e V-09).
 *
 * **RODA COM `TZ=UTC`** (`vitest.config.mts`), que é como a Vercel roda. O
 * gêmeo `conteudo-do-site.brasilia.test.ts` roda as mesmas asserções de hora com
 * o processo em Brasília — e as duas exigem o mesmo resultado.
 */

const ANA = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

/* ================================================================== *
 * V-07 — a história
 * ================================================================== */

describe("a nossa história", () => {
  it("aceita título opcional e texto", () => {
    const { dados, erros } = conferirHistoria({
      titulo: "Como tudo começou",
      texto: "A gente se conheceu numa fila.",
    });
    expect(erros).toEqual([]);
    expect(dados).toEqual({
      titulo: "Como tudo começou",
      texto: "A gente se conheceu numa fila.",
    });
  });

  it("título vazio é nulo, e o site usa o padrão da seção", () => {
    const { dados } = conferirHistoria({ titulo: "   ", texto: "Texto." });
    expect(dados?.titulo).toBeNull();
  });

  it("**estourar 1.200 responde com quantos foram enviados e qual é o teto**", () => {
    const longo = "a".repeat(TETOS_DE_CONTEUDO.historiaTexto + 140);
    const { dados, erros } = conferirHistoria({ texto: longo });
    expect(dados).toBeNull();
    // "Longo demais" não diz quantos cortar. O número, sim.
    expect(erros[0].mensagem).toContain(String(longo.length));
    expect(erros[0].mensagem).toContain(String(TETOS_DE_CONTEUDO.historiaTexto));
  });

  it("**texto vazio APAGA a história, e não é erro**", async () => {
    /**
     * O casal que escreveu e se arrependeu precisa poder voltar ao estado
     * anterior — e o estado anterior é "a seção não renderiza" (RV-02), não "a
     * seção mostra uma caixa vazia". Recusar o vazio deixaria um texto errado no
     * ar para sempre.
     */
    const { dados, erros } = conferirHistoria({ texto: "   " });
    expect(erros).toEqual([]);
    expect(dados?.texto).toBe("");

    const escritas: string[] = [];
    const exec = (async (strings: TemplateStringsArray) => {
      escritas.push(strings.join(" ? ").replace(/\s+/g, " "));
      return [];
    }) as unknown as Executor;

    expect(await salvarHistoria(ANA, { titulo: null, texto: "" }, exec)).toBeNull();
    // Exclusão lógica, e não `insert` de uma linha em branco: uma linha com
    // `texto = ''` faria a seção "existir e não mostrar nada".
    expect(escritas[0]).toMatch(/update evento_historia set excluido_em/);
  });
});

describe("o texto do casal é texto puro (RV-07)", () => {
  it("linha em branco vira parágrafo; uma quebra só, não", () => {
    // Transformar cada Enter em parágrafo produziria um texto todo picado — é
    // como se digita num campo sem pensar em marcação.
    expect(paragrafos("um\ndois")).toEqual(["um\ndois"]);
    expect(paragrafos("um\n\ndois")).toEqual(["um", "dois"]);
    expect(paragrafos("um\r\n\r\ndois")).toEqual(["um", "dois"]);
    expect(paragrafos("  \n\n  ")).toEqual([]);
  });

  it("**HTML colado do WhatsApp sai como texto, e não como marcação**", () => {
    /**
     * A saída é um array de STRINGS, e não uma string com `<br>`. Uma função que
     * devolvesse HTML obrigaria quem a usa a injetá-lo com
     * `dangerouslySetInnerHTML` — e a decisão de não ter texto formatado estaria
     * desfeita pela porta dos fundos.
     */
    const blocos = paragrafos("<b>oi</b>\n\n<script>alert(1)</script>");
    expect(blocos).toEqual(["<b>oi</b>", "<script>alert(1)</script>"]);
    for (const bloco of blocos) expect(typeof bloco).toBe("string");
  });
});

/* ================================================================== *
 * V-08 — a programação
 * ================================================================== */

describe("a programação do dia, em UTC", () => {
  casosDeHora();

  it("recusa hora fora do formato", () => {
    const { erros } = conferirMomento(
      { titulo: "X", hora: "quatro da tarde" },
      { parcial: false }
    );
    expect(erros.map(e => e.campo)).toContain("hora");
  });

  it("exige título na criação", () => {
    const { erros } = conferirMomento({ hora: "16:00" }, { parcial: false });
    expect(erros.map(e => e.campo)).toContain("titulo");
  });

  it("recusa título e descrição acima do teto, com o número", () => {
    const { erros } = conferirMomento(
      {
        titulo: "t".repeat(TETOS_DE_CONTEUDO.momentoTitulo + 1),
        descricao: "d".repeat(TETOS_DE_CONTEUDO.momentoDescricao + 1),
      },
      { parcial: false }
    );
    expect(erros.map(e => e.campo).sort()).toEqual(["descricao", "titulo"]);
    for (const erro of erros) expect(erro.mensagem).toMatch(/\d+/);
  });
});

/* ================================================================== *
 * V-09 — as perguntas
 * ================================================================== */

describe("as perguntas que a noiva responde trinta vezes", () => {
  const COM_RESPOSTA: Pergunta = {
    id: "p1",
    pergunta: "Qual é o traje?",
    resposta: "Esporte fino.",
    ordem: 1,
  };
  const SEM_RESPOSTA: Pergunta = {
    id: "p2",
    pergunta: "Posso levar criança?",
    resposta: null,
    ordem: 2,
  };

  it("**pergunta sem resposta não vai para o site**", () => {
    /**
     * É o que torna seguro sugerir as cinco perguntas da persona (V-16): elas
     * nascem sem resposta e ficam invisíveis. Sem esta regra, o casal publicaria
     * cinco perguntas em branco para 150 pessoas.
     */
    expect(perguntasRespondidas([COM_RESPOSTA, SEM_RESPOSTA])).toEqual([COM_RESPOSTA]);
    // Resposta em branco conta como sem resposta: o casal que apagou o texto e
    // salvou quis tirá-la do ar.
    expect(perguntasRespondidas([{ ...COM_RESPOSTA, resposta: "" }])).toEqual([]);
  });

  it("nenhuma respondida: a seção não tem o que mostrar", () => {
    expect(perguntasRespondidas([SEM_RESPOSTA])).toEqual([]);
  });

  it("aceita pergunta sem resposta, e isso é um estado e não um erro", () => {
    const { dados, erros } = conferirPergunta(
      { pergunta: "Tem estacionamento?", resposta: null },
      { parcial: false }
    );
    expect(erros).toEqual([]);
    expect(dados.resposta).toBeNull();
  });

  it("apagar a resposta é diferente de apagar a pergunta", () => {
    // `PATCH { resposta: null }` devolve a pergunta ao estado "sugerida". O
    // `DELETE` apaga tudo. Confundir os dois faria o casal perder a pergunta ao
    // tentar só tirá-la do ar.
    const { dados } = conferirPergunta({ resposta: "" }, { parcial: true });
    expect(dados.resposta).toBeNull();
    expect(dados.pergunta).toBeUndefined();
  });

  it("recusa pergunta e resposta acima do teto, com o número", () => {
    const { erros } = conferirPergunta(
      {
        pergunta: "p".repeat(TETOS_DE_CONTEUDO.pergunta + 1),
        resposta: "r".repeat(TETOS_DE_CONTEUDO.resposta + 1),
      },
      { parcial: false }
    );
    expect(erros.map(e => e.campo).sort()).toEqual(["pergunta", "resposta"]);
  });
});

/* ================================================================== *
 * Inquilino A não lê nem escreve no B
 * ================================================================== */

type Linha = Record<string, unknown>;

function bancoFalso(linhas: Linha[]) {
  const registro: Array<{ texto: string; valores: unknown[] }> = [];
  const exec = (async (strings: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = strings.join(" ? ").replace(/\s+/g, " ");
    registro.push({ texto, valores });

    if (/count\(\*\)/.test(texto)) {
      const [eventoId] = valores;
      const tabela = /evento_programacao/.test(texto) ? "programacao" : "perguntas";
      return [
        { quantas: linhas.filter(l => l.evento_id === eventoId && l.tabela === tabela).length },
      ];
    }
    if (/from evento_historia/.test(texto)) {
      const [eventoId] = valores;
      return linhas.filter(l => l.evento_id === eventoId && l.tabela === "historia");
    }
    if (/from evento_perguntas/.test(texto)) {
      const [eventoId] = valores;
      return linhas.filter(l => l.evento_id === eventoId && l.tabela === "perguntas");
    }
    if (/update evento_(programacao|perguntas)/.test(texto)) {
      // O `where` sempre termina com o id e o evento_id, nesta ordem.
      const eventoId = valores[valores.length - 1];
      const itemId = valores[valores.length - 2];
      const achada = linhas.find(l => l.id === itemId && l.evento_id === eventoId);
      return achada ? [achada] : [];
    }
    throw new Error(`Consulta não prevista: ${texto}`);
  }) as unknown as Executor;
  return { exec, registro };
}

const LINHAS: Linha[] = [
  {
    tabela: "historia",
    evento_id: ANA,
    titulo: "A da Ana",
    texto: "Texto da Ana",
    id: "h1",
  },
  { tabela: "historia", evento_id: OUTRO, titulo: null, texto: "Texto do outro", id: "h2" },
  {
    tabela: "perguntas",
    evento_id: ANA,
    id: "aaaa1111-1111-4111-8111-111111111111",
    pergunta: "Da Ana?",
    resposta: "Sim",
    ordem: 1,
  },
  {
    tabela: "perguntas",
    evento_id: OUTRO,
    id: "bbbb1111-1111-4111-8111-111111111111",
    pergunta: "Do outro?",
    resposta: "Sim",
    ordem: 1,
  },
  {
    tabela: "programacao",
    evento_id: OUTRO,
    id: "cccc1111-1111-4111-8111-111111111111",
    hora: "16:00:00",
    titulo: "Do outro",
    descricao: null,
    ordem: 1,
  },
];

describe("o conteúdo de um casamento não vaza para o outro", () => {
  it("a história lida é a do evento pedido", async () => {
    const { exec, registro } = bancoFalso(LINHAS);
    const historia = await buscarHistoria(ANA, exec);
    expect(historia?.texto).toBe("Texto da Ana");
    expect(registro[0].valores).toEqual([ANA]);
  });

  it("as perguntas lidas são as do evento pedido", async () => {
    const { exec } = bancoFalso(LINHAS);
    const perguntas = await listarPerguntas(ANA, exec);
    expect(perguntas.map(p => p.pergunta)).toEqual(["Da Ana?"]);
  });

  it("**editar o momento de outro evento devolve nada — a rota vira 404**", async () => {
    const { exec } = bancoFalso(LINHAS);
    expect(
      await atualizarMomento(
        ANA,
        "cccc1111-1111-4111-8111-111111111111",
        { titulo: "Sequestrado" },
        exec
      )
    ).toBeNull();
  });

  it("editar a pergunta de outro evento devolve nada", async () => {
    const { exec } = bancoFalso(LINHAS);
    expect(
      await atualizarPergunta(
        ANA,
        "bbbb1111-1111-4111-8111-111111111111",
        { resposta: "Não" },
        exec
      )
    ).toBeNull();
  });

  it("apagar item de outro evento devolve falso", async () => {
    const { exec } = bancoFalso(LINHAS);
    expect(
      await excluirMomento(ANA, "cccc1111-1111-4111-8111-111111111111", exec)
    ).toBe(false);
    expect(
      await excluirPergunta(ANA, "bbbb1111-1111-4111-8111-111111111111", exec)
    ).toBe(false);
    expect(
      await excluirPergunta(ANA, "aaaa1111-1111-4111-8111-111111111111", exec)
    ).toBe(true);
  });

  it("**os tetos são contados POR EVENTO**", async () => {
    // Contar sem filtro faria o décimo segundo momento de um casamento bloquear
    // o primeiro do outro, e ninguém entenderia por quê.
    const { exec } = bancoFalso(LINHAS);
    expect(await contarMomentos(ANA, exec)).toBe(0);
    expect(await contarMomentos(OUTRO, exec)).toBe(1);
    expect(await contarPerguntas(ANA, exec)).toBe(1);
    expect(MAXIMO_DE_MOMENTOS).toBe(12);
    expect(MAXIMO_DE_PERGUNTAS).toBe(15);
  });
});
