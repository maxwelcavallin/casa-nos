import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import {
  CATALOGO,
  CHAVES_DE_SECAO,
  chavesLigadas,
  conferirSecoes,
  ehChaveDeSecao,
  listarSecoes,
  ordenarSecoes,
  salvarSecoes,
  secaoDoCatalogo,
  SECOES_COM_EDITOR,
  SECOES_SEM_CONTEUDO,
  type EstadoDaSecao,
} from "@/lib/secoes";

/**
 * O CATÁLOGO DE SEÇÕES — a catraca da V-03.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A decisão do dono é **seções fixas com conteúdo editável**, e ela só se
 * sustenta enquanto três coisas continuarem casando:
 *
 *   o `CHECK` da migration 0012  ←→  o catálogo em `lib/secoes.ts`
 *
 * Se o `CHECK` aceitar uma chave que o catálogo não conhece, uma linha gravada
 * some da tela sem erro. Se o catálogo tiver uma chave que o `CHECK` recusa, o
 * primeiro toque do casal naquela seção responde 500 — no painel, à noite, sem
 * ninguém para explicar.
 *
 * O defeito não aparece em revisão: os dois arquivos são bonitos, e estão longe
 * um do outro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const ANA = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

/* ------------------------------------------------------------------ *
 * 1. O catálogo casa com a migration
 * ------------------------------------------------------------------ */

describe("o catálogo e o `CHECK` da migration dizem a mesma coisa", () => {
  const migracao = fs.readFileSync(
    path.join(RAIZ, "db", "migrations", "0012_secoes_do_site.sql"),
    "utf8"
  );

  /** As chaves entre aspas dentro do `check (chave in (...))`. */
  function chavesDoCheck(): string[] {
    const bloco = /check\s*\(chave in \(([\s\S]*?)\)\)/.exec(migracao);
    expect(bloco, "o `CHECK` da 0012 mudou de forma e o varredor não o achou").toBeTruthy();
    return [...(bloco as RegExpExecArray)[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);
  }

  it("toda chave do `CHECK` tem entrada no catálogo", () => {
    const semCatalogo = chavesDoCheck().filter(c => !ehChaveDeSecao(c));
    expect(
      semCatalogo,
      "Estas chaves são aceitas pelo banco e o código não as conhece: " +
        semCatalogo.join(", ") +
        ". Uma linha gravada com elas some da tela sem erro nenhum."
    ).toEqual([]);
  });

  it("toda chave do catálogo é aceita pelo `CHECK`", () => {
    const doCheck = new Set(chavesDoCheck());
    const recusadas = CHAVES_DE_SECAO.filter(c => !doCheck.has(c));
    expect(
      recusadas,
      "Estas seções existem no código e o banco recusa: " +
        recusadas.join(", ") +
        ". O primeiro toque do casal nelas responde 500."
    ).toEqual([]);
  });

  it("são sete, e são estas", () => {
    // Lista travada: seção nova é uma decisão visível num diff, com componente e
    // editor no mesmo commit — não um efeito colateral.
    expect([...CHAVES_DE_SECAO]).toEqual([
      "capa",
      "onde",
      "programacao",
      "historia",
      "perguntas",
      "indicacoes",
      "rodape",
    ]);
  });

  it("a ordem padrão não tem empate", () => {
    // Empate na ordem padrão faria duas seções trocarem de lugar entre cargas,
    // e o casal veria o site se reorganizando sozinho.
    const ordens = CATALOGO.map(s => s.ordemPadrao);
    expect(new Set(ordens).size).toBe(ordens.length);
  });

  it("só `capa` e `rodape` são indesligáveis, e só elas têm posição fixa", () => {
    expect(CATALOGO.filter(s => !s.podeDesligar).map(s => s.chave)).toEqual([
      "capa",
      "rodape",
    ]);
    expect(CATALOGO.filter(s => s.posicaoFixa !== null).map(s => s.chave)).toEqual([
      "capa",
      "rodape",
    ]);
  });

  it("toda seção tem nome e explicação escritos", () => {
    // Seção sem explicação vira um nome solto no painel, e a Marina não sabe o
    // que entra ali sem abrir.
    const mudas = CATALOGO.filter(s => !s.nome.trim() || !s.explicacao.trim());
    expect(mudas.map(s => s.chave)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 1b. Toda seção tem componente que a desenha e editor que a escreve
 * ------------------------------------------------------------------ */

describe("toda chave do catálogo tem componente e editor", () => {
  it("catálogo = com editor + sem conteúdo, sem sobra e sem sobreposição", () => {
    /**
     * O critério da V-03: **toda chave do `CHECK` tem entrada no catálogo, um
     * componente que a desenha e um editor**. Uma seção no catálogo e fora dos
     * dois conjuntos vira um nome no painel que não abre nada — e o casal toca
     * nele, não acontece nada, e não há erro para investigar.
     *
     * `SECOES_SEM_CONTEUDO` existe para o teste distinguir "não tem editor
     * porque não precisa" (o rodapé) de "não tem editor porque alguém
     * esqueceu" — diferença que uma soma de conjuntos não conta.
     */
    /**
     * **CATRACA EM MODO CONTAGEM** (`qualidade.md` §2), com a lista escrita.
     *
     * Estas três seções existem no catálogo desde a `0012` porque a ordem
     * precisa conhecê-las e porque o `CHECK` já as aceita — mas o conteúdo delas
     * é a migration `0013`, e os editores são a V1.4. Enquanto isso, elas
     * aparecem no painel marcadas como "falta preencher", **sem link**, e o
     * endereço delas responde 404.
     *
     * Catraca que nasce proibindo trabalho existente é desligada no primeiro
     * dia. Esta nasce com a dívida escrita e vira proibição quando a lista
     * esvaziar — o que é o critério de término da V1.4.
     */
    const PENDENTES: ReadonlySet<string> = new Set([
      "programacao",
      "historia",
      "perguntas",
    ]);

    const cobertas = new Set([...SECOES_COM_EDITOR, ...SECOES_SEM_CONTEUDO]);
    const descobertas = CHAVES_DE_SECAO.filter(
      c => !cobertas.has(c) && !PENDENTES.has(c)
    );

    // A lista de pendentes não guarda seção que já tem editor: sobrando, ela
    // abriria um buraco na catraca por um motivo que ninguém reconstrói depois.
    const jaResolvidas = [...PENDENTES].filter(c => (cobertas as Set<string>).has(c));
    expect(
      jaResolvidas,
      `Estas seções já têm editor e continuam na lista de pendentes: ${jaResolvidas.join(", ")}`
    ).toEqual([]);

    expect(
      descobertas,
      "Estas seções existem no catálogo e não têm editor nem declaração de que " +
        "não precisam de um:\n" +
        descobertas.map(c => `  - ${c}`).join("\n") +
        "\n\nOu escreva o editor, ou declare em SECOES_SEM_CONTEUDO com o motivo."
    ).toEqual([]);

    const nosDois = [...SECOES_COM_EDITOR].filter(c => SECOES_SEM_CONTEUDO.has(c));
    expect(nosDois, "Seção em SECOES_COM_EDITOR e em SECOES_SEM_CONTEUDO").toEqual([]);
  });

  it("cada seção com editor tem um componente que a desenha no site", () => {
    /**
     * O outro lado do critério. Um editor que grava conteúdo que nenhum
     * componente desenha é a pior forma de trabalho perdido: o casal escreve, o
     * campo salva, e o site continua igual.
     *
     * `capa` e `onde` são desenhadas por `HeroDoCasamento` e `SecaoOnde`, que
     * `PaginaDoEvento` monta fora do laço de seções (a capa é fixa). As demais
     * aparecem no `switch` por chave.
     */
    const pagina = fs.readFileSync(
      path.join(RAIZ, "components", "evento", "PaginaDoEvento.tsx"),
      "utf8"
    );
    const FORA_DO_LACO: Record<string, RegExp> = {
      capa: /<HeroDoCasamento/,
      rodape: /<RodapeDoCasamento/,
    };

    const semDesenho = CHAVES_DE_SECAO.filter(chave => {
      const fixa = FORA_DO_LACO[chave];
      if (fixa) return !fixa.test(pagina);
      // As seções que ainda não têm editor também ainda não desenham, e é o
      // certo: desenhar sem conteúdo seria um espaço em branco no site.
      if (!SECOES_COM_EDITOR.has(chave)) return false;
      return !new RegExp(`case "${chave}":`).test(pagina);
    });

    expect(
      semDesenho,
      "Estas seções têm editor e nenhum componente as desenha no site:\n" +
        semDesenho.map(c => `  - ${c}`).join("\n") +
        "\n\nO casal escreve, o campo salva, e o site continua igual."
    ).toEqual([]);
  });

  it("a tela `[secao]` recusa chave sem editor", () => {
    // A tela lê o mesmo conjunto. Se ela tivesse a própria lista, as duas
    // divergiriam — e o painel viraria um nome em link para um 404.
    const tela = fs.readFileSync(
      path.join(RAIZ, "app", "painel", "[eventoId]", "site", "[secao]", "page.tsx"),
      "utf8"
    );
    expect(tela).toMatch(/if \(!ehChaveDeSecao\(secao\)\) notFound\(\);/);
    expect(tela).toMatch(/if \(!SECOES_COM_EDITOR\.has\(secao\)\) notFound\(\);/);
  });
});

/* ------------------------------------------------------------------ *
 * 2. A validação de chave — lista de permitidos, não expressão regular
 * ------------------------------------------------------------------ */

describe("`ehChaveDeSecao` recusa o que não está no catálogo", () => {
  it("aceita as sete", () => {
    for (const chave of CHAVES_DE_SECAO) expect(ehChaveDeSecao(chave)).toBe(true);
  });

  it("recusa o que uma expressão regular deixaria passar", () => {
    // O motivo de a validação ser lista de permitidos: `/^[a-z]+$/` aceitaria
    // as quatro abaixo, a consulta voltaria vazia e o casal veria uma tela em
    // branco em vez de 404.
    for (const lixo of ["programacaozinha", "CAPA", "capa ", "", "__proto__", null, 7]) {
      expect(ehChaveDeSecao(lixo), `${String(lixo)} passou`).toBe(false);
    }
  });

  it("`secaoDoCatalogo` estoura alto para chave fora do catálogo", () => {
    // Impossível pelo tipo. O `throw` é para o dia em que alguém acrescentar uma
    // chave no union e esquecer o catálogo: falhar alto é melhor que renderizar
    // uma seção sem nome.
    expect(() =>
      secaoDoCatalogo("inventada" as unknown as (typeof CHAVES_DE_SECAO)[number])
    ).toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * 3. A ordem — e o empate desfeito pela chave, nunca pelo id
 * ------------------------------------------------------------------ */

function estado(
  chave: (typeof CHAVES_DE_SECAO)[number],
  ativa: boolean,
  ordem: number
): EstadoDaSecao {
  return { ...secaoDoCatalogo(chave), ativa, ordem };
}

describe("a ordem das seções", () => {
  it("`capa` primeiro e `rodape` último, mesmo com a ordem invertida", () => {
    const ordenadas = ordenarSecoes([
      estado("rodape", true, -50),
      estado("onde", true, 3),
      estado("capa", true, 900),
      estado("historia", true, 1),
    ]);
    expect(ordenadas.map(s => s.chave)).toEqual(["capa", "historia", "onde", "rodape"]);
  });

  it("**empate é desfeito pela chave, nunca pelo id**", () => {
    /**
     * RV-04. Todo evento novo pode ter empates — as linhas nascem com `ordem`
     * default 0 se alguém gravar sem ordem. Desempatar por `id` (uuid, aleatório)
     * faria a ordem do site mudar a cada inserção: o casal veria as seções
     * trocando de lugar sozinhas, sem ter tocado em nada, e não haveria erro
     * nenhum para investigar.
     */
    const empatadas = ["perguntas", "historia", "onde"] as const;
    const primeira = ordenarSecoes(empatadas.map(c => estado(c, true, 0)));
    const segunda = ordenarSecoes([...empatadas].reverse().map(c => estado(c, true, 0)));
    expect(primeira.map(s => s.chave)).toEqual(segunda.map(s => s.chave));
    expect(primeira.map(s => s.chave)).toEqual(["historia", "onde", "perguntas"]);
  });

  it("`chavesLigadas` devolve só as ligadas, em ordem", () => {
    const ligadas = chavesLigadas([
      estado("capa", true, 0),
      estado("onde", true, 2),
      estado("historia", false, 1),
      estado("rodape", true, 99),
    ]);
    expect(ligadas).toEqual(["capa", "onde", "rodape"]);
  });
});

/* ------------------------------------------------------------------ *
 * 4. A validação da escrita
 * ------------------------------------------------------------------ */

describe("o que a rota aceita gravar", () => {
  it("aceita a lista inteira", () => {
    const { mudancas, recusas } = conferirSecoes([
      { chave: "onde", ativa: true, ordem: 1 },
      { chave: "historia", ativa: false, ordem: 2 },
    ]);
    expect(recusas).toEqual([]);
    expect(mudancas).toEqual([
      { chave: "onde", ativa: true, ordem: 1 },
      { chave: "historia", ativa: false, ordem: 2 },
    ]);
  });

  it("**recusa desligar a capa e o rodapé, com o motivo** (RV-06)", () => {
    /**
     * O interruptor delas não existe na tela. Esta é a segunda tranca, para o
     * `PATCH` montado à mão — e ela responde com o motivo escrito, não com um
     * 400 genérico que a tela traduziria como "erro".
     */
    const { mudancas, recusas } = conferirSecoes([
      { chave: "capa", ativa: false, ordem: 0 },
      { chave: "rodape", ativa: false, ordem: 99 },
    ]);
    expect(mudancas).toEqual([]);
    expect(recusas.map(r => r.chave)).toEqual(["capa", "rodape"]);
    expect(recusas[0].motivo).toMatch(/nome de vocês e a data/);
  });

  it("recusa chave desconhecida e chave repetida", () => {
    const { recusas } = conferirSecoes([
      { chave: "precos", ativa: true, ordem: 1 },
      { chave: "onde", ativa: true, ordem: 1 },
      { chave: "onde", ativa: false, ordem: 2 },
    ]);
    expect(recusas.map(r => r.chave)).toEqual(["precos", "onde"]);
    // A repetida importa: com ela, duas ordens para a mesma seção, e a última
    // venceria em silêncio.
    expect(recusas[1].motivo).toMatch(/duas vezes/);
  });

  it("recusa ordem que não é inteiro", () => {
    const { recusas } = conferirSecoes([{ chave: "onde", ativa: true, ordem: "primeira" }]);
    expect(recusas).toHaveLength(1);
  });

  it("recusa corpo que não é lista", () => {
    for (const lixo of [null, undefined, {}, "onde", 3]) {
      expect(conferirSecoes(lixo).recusas.length, `${String(lixo)} passou`).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 5. Inquilino A não lê o B
 * ------------------------------------------------------------------ */

type Linha = { evento_id: string; chave: string; ativa: boolean; ordem: number };

function bancoFalso(linhas: Linha[]) {
  const registro: Array<{ texto: string; valores: unknown[] }> = [];
  const exec = (async (strings: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = strings.join(" ? ").replace(/\s+/g, " ");
    registro.push({ texto, valores });
    if (/from evento_secoes/.test(texto)) {
      const [eventoId] = valores;
      return linhas.filter(l => l.evento_id === eventoId);
    }
    if (/insert into evento_secoes/.test(texto)) return [];
    throw new Error(`Consulta não prevista: ${texto}`);
  }) as unknown as Executor;
  return { exec, registro };
}

describe("as seções de um casamento não vazam para o outro", () => {
  const LINHAS: Linha[] = [
    { evento_id: ANA, chave: "historia", ativa: false, ordem: 3 },
    { evento_id: OUTRO, chave: "historia", ativa: true, ordem: 1 },
    { evento_id: OUTRO, chave: "onde", ativa: false, ordem: 2 },
  ];

  it("o estado lido é o do evento pedido", async () => {
    const { exec } = bancoFalso(LINHAS);
    const daAna = await listarSecoes(ANA, exec);
    expect(daAna.find(s => s.chave === "historia")?.ativa).toBe(false);
    // A seção `onde` do OUTRO está desligada; a da Ana não tem linha e portanto
    // segue o padrão do catálogo — ligada.
    expect(daAna.find(s => s.chave === "onde")?.ativa).toBe(true);
  });

  it("a consulta carrega o `evento_id`", async () => {
    const { exec, registro } = bancoFalso(LINHAS);
    await listarSecoes(ANA, exec);
    expect(registro[0].texto).toMatch(/where evento_id = \?/);
    expect(registro[0].valores).toEqual([ANA]);
  });

  it("a escrita carrega o `evento_id` do servidor", async () => {
    const { exec, registro } = bancoFalso([]);
    await salvarSecoes(OUTRO, [{ chave: "onde", ativa: false, ordem: 1 }], exec);
    expect(registro[0].valores[0]).toBe(OUTRO);
  });

  it("evento sem nenhuma linha renderiza o catálogo padrão", async () => {
    /**
     * A `0012` não semeia nada, de propósito: **linha ausente significa o padrão
     * do catálogo**. Um evento recém-criado precisa renderizar certo sem que
     * ninguém tenha tocado no painel.
     */
    const { exec } = bancoFalso([]);
    const secoes = await listarSecoes("33333333-3333-4333-8333-333333333333", exec);
    expect(secoes).toHaveLength(7);
    expect(secoes.every(s => s.ativa)).toBe(true);
    expect(secoes.map(s => s.chave)).toEqual([
      "capa",
      "onde",
      "programacao",
      "historia",
      "perguntas",
      "indicacoes",
      "rodape",
    ]);
  });

  it("chave gravada que o catálogo não conhece mais é ignorada, e não quebra", async () => {
    // Uma seção removida do produto deixaria linhas antigas no banco. Derrubar a
    // página do casal por causa delas seria o pior desfecho possível.
    const { exec } = bancoFalso([
      { evento_id: ANA, chave: "secao-que-nao-existe-mais", ativa: true, ordem: 1 },
    ]);
    const secoes = await listarSecoes(ANA, exec);
    expect(secoes).toHaveLength(7);
  });

  it("**a escrita é UMA instrução, com a lista inteira** (RV-05)", async () => {
    /**
     * N requisições parciais numa conexão de celular à noite deixam a ordem
     * inconsistente no meio — e o driver HTTP do Neon não abraça o arquivo numa
     * transação, então não há como voltar atrás.
     */
    const { exec, registro } = bancoFalso([]);
    await salvarSecoes(
      ANA,
      CHAVES_DE_SECAO.map((chave, i) => ({ chave, ativa: true, ordem: i })),
      exec
    );
    expect(
      registro,
      "A gravação das sete seções virou mais de uma requisição."
    ).toHaveLength(1);
    expect(registro[0].texto).toMatch(/on conflict \(evento_id, chave\) do update/);
  });
});
