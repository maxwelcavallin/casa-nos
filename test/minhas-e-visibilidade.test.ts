import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXPLICACAO_DO_SELO,
  ROTULO_DO_SELO,
  seloDeChegada,
} from "@/components/album/SeloEstado";
import { linhaDeVersaoMaior, TETO_DA_LINHA_AGREGADA } from "@/components/album/ResumoDoTopo";
import { TETO_DA_LINHA_POR_ITEM } from "@/components/album/FolhaDaFoto";
import { pode } from "@/lib/autorizacao";
import type { Executor } from "@/lib/db";
import { paginaDeMinhas } from "@/lib/feed";
import { trocarVisibilidade } from "@/lib/midias";
import type { Sessao } from "@/lib/sessao";

/**
 * "AS MINHAS FOTOS" E A VISIBILIDADE (H-08, H-10, RN-32).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE ARQUIVO GUARDA TRÊS COISAS QUE O CÓDIGO SOZINHO NÃO SEGURA:
 *
 *  1. **As duas perguntas viajam em campos separados.** Juntá-las num "estado"
 *     obriga a interface a desjuntar, e é assim que uma das duas some — sempre a
 *     mesma, "quem vê isso?", porque o progresso do envio é o que parece
 *     urgente.
 *  2. **`midias.visibilidade` tem um caminho de escrita só.** A matriz é a
 *     segunda tranca; a primeira é estrutural, e ela depende de ninguém escrever
 *     um `update midias set visibilidade` novo daqui a um ano.
 *  3. **Nenhuma palavra terminal no eixo de chegada**, e os dois tetos de
 *     caracteres. Texto que estoura o teto quebra o layout numa tela que 200
 *     pessoas abrem ao mesmo tempo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const EVENTO = "11111111-1111-4111-8111-111111111111";

/* ------------------------------------------------------------------ *
 * 1. As duas perguntas, em campos separados
 * ------------------------------------------------------------------ */

function bancoDeMinhas(linhas: Array<Record<string, unknown>>) {
  return (async (partes: TemplateStringsArray) => {
    const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
    if (/count\(\*\)::int as total/.test(texto)) {
      return [
        {
          total: linhas.length,
          pendentes: linhas.filter(
            l => l.previa_armazenada_em !== null && l.original_armazenada_em === null
          ).length,
        },
      ];
    }
    return linhas;
  }) as unknown as Executor;
}

const AGORA = new Date("2027-08-22T23:00:00.000Z");

function linha(sobrepor: Record<string, unknown> = {}) {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    lote_id: "88888888-8888-4888-8888-888888888888",
    visibilidade: "feed",
    previa_armazenada_em: null,
    original_armazenada_em: null,
    criada_em: AGORA,
    // O banco de verdade nunca devolve isto para `/minhas`. Ele está aqui para
    // provar que, mesmo se devolvesse, a serialização não o deixa passar.
    aprovacao: "pendente",
    ...sobrepor,
  };
}

describe("o contrato de /minhas — duas perguntas, dois campos", () => {
  it("visibilidade e chegada são campos DIFERENTES, nunca um `estado` só", async () => {
    const pagina = await paginaDeMinhas(
      EVENTO,
      "part",
      null,
      40,
      bancoDeMinhas([linha({ visibilidade: "noivos" })])
    );
    const item = pagina.itens[0];
    expect(item.visibilidade).toBe("noivos");
    expect(item.chegada).toBe("chegando");
    expect(Object.keys(item)).not.toContain("estado");
  });

  it("os três valores de chegada, e só o último é terminal", async () => {
    const banco = bancoDeMinhas([
      linha({ id: "a1111111-1111-4111-8111-111111111111" }),
      linha({
        id: "a2222222-2222-4222-8222-222222222222",
        previa_armazenada_em: AGORA,
      }),
      linha({
        id: "a3333333-3333-4333-8333-333333333333",
        previa_armazenada_em: AGORA,
        original_armazenada_em: AGORA,
      }),
    ]);
    const pagina = await paginaDeMinhas(EVENTO, "part", null, 40, banco);
    expect(pagina.itens.map(i => i.chegada)).toEqual([
      "chegando",
      "ainda_subindo",
      "completa",
    ]);
  });

  it("`aprovacao` NÃO aparece na resposta, em campo nenhum (RN-07)", async () => {
    /**
     * O convidado não vê a fila de moderação — nem selo, nem "em análise", nem
     * contador, nem tempo estimado. Para ele, enviado é enviado. Deixar o campo
     * vazar seria a primeira pedra do caminho: alguém vê o dado disponível e
     * "aproveita" para desenhar um estado.
     */
    const pagina = await paginaDeMinhas(
      EVENTO,
      "part",
      null,
      40,
      bancoDeMinhas([linha({ aprovacao: "pendente" })])
    );
    expect(JSON.stringify(pagina)).not.toContain("aprovacao");
    expect(JSON.stringify(pagina)).not.toContain("pendente\"");
  });

  it("`originais_pendentes` é o que decide se o resumo do topo existe", async () => {
    const semPendencia = await paginaDeMinhas(
      EVENTO,
      "part",
      null,
      40,
      bancoDeMinhas([linha({ previa_armazenada_em: AGORA, original_armazenada_em: AGORA })])
    );
    // Zero → o slot NÃO existe. Ele não vira "0 fotos subindo": aviso permanente
    // vira mobília e ninguém lê.
    expect(semPendencia.originaisPendentes).toBe(0);

    const comPendencia = await paginaDeMinhas(
      EVENTO,
      "part",
      null,
      40,
      bancoDeMinhas([linha({ previa_armazenada_em: AGORA })])
    );
    expect(comPendencia.originaisPendentes).toBe(1);
  });

  it("a consulta filtra por evento E por participação", async () => {
    const perguntas: unknown[][] = [];
    const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      perguntas.push(valores);
      const texto = partes.join(" ? ");
      if (/count/.test(texto)) return [{ total: 0, pendentes: 0 }];
      return [];
    }) as unknown as Executor;

    await paginaDeMinhas(EVENTO, "part", null, 40, exec);
    for (const valores of perguntas) {
      expect(valores).toContain(EVENTO);
      expect(valores).toContain("part");
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. A visibilidade — um caminho de escrita, e só um
 * ------------------------------------------------------------------ */

describe("a visibilidade só é escrita por quem enviou", () => {
  function acesso(tipo: "casal" | "moderador" | "telao", dono = false): Sessao {
    return {
      tipo,
      acesso: { id: "a1", eventoId: EVENTO, tipo, rotulo: null, dono, expiraEm: null },
    } as Sessao;
  }

  it("a matriz recusa casal, moderador e dono — é a SEGUNDA tranca", () => {
    expect(pode(acesso("casal"), "midia.visibilidade.editar")).toBe("nao");
    expect(pode(acesso("moderador"), "midia.visibilidade.editar")).toBe("nao");
    expect(pode(acesso("casal", true), "midia.visibilidade.editar")).toBe("nao");
    expect(pode(acesso("telao"), "midia.visibilidade.editar")).toBe("nao");
  });

  it("existe UM `update midias set visibilidade` no produto inteiro", () => {
    /**
     * ESTA É A TRANCA ESTRUTURAL, e ela é a que importa (PRD §3.2, P2).
     *
     * O casal escreve `midias.aprovacao`; a coluna `visibilidade` tem um único
     * caminho de escrita, e ele exige o `participacao_id` da sessão. É o que
     * torna "o casal nunca promove `noivos` para o feed" uma **impossibilidade
     * estrutural** em vez de um `if` que alguém remove daqui a um ano sem
     * entender o que estava segurando.
     *
     * A varredura é sobre `lib/` e `app/` porque é onde SQL pode nascer.
     */
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) varrer(completo);
        else if (/\.tsx?$/.test(entrada.name)) arquivos.push(completo);
      }
    };
    varrer(path.join(RAIZ, "lib"));
    varrer(path.join(RAIZ, "app"));

    const escritores = arquivos.filter(arquivo => {
      const fonte = fs
        .readFileSync(arquivo, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      /**
       * A varredura olha só o que está **entre `set` e `where`**, e a precisão
       * importa nos dois sentidos.
       *
       * A primeira versão media `set` … 200 caracteres … `visibilidade =` e
       * acusava `lib/moderacao.ts`, que escreve `aprovacao` e **filtra** por
       * `visibilidade = 'feed'` na cláusula. Era falso positivo — e falso
       * positivo numa catraca é como ela é desligada: alguém acrescenta uma
       * exceção nominal, e a exceção seguinte entra sem ninguém olhar.
       *
       * O erro contrário seria pior: uma varredura frouxa demais deixaria passar
       * um `update midias set visibilidade` novo, que é exatamente o que ela
       * existe para impedir.
       */
      for (const achado of fonte.matchAll(/update\s+midias\b([\s\S]*?)(?:\bwhere\b|`)/g)) {
        if (/\bvisibilidade\s*=/.test(achado[1])) return true;
      }
      return false;
    });

    expect(
      escritores.map(a => path.relative(RAIZ, a).split(path.sep).join("/")),
      "A coluna `visibilidade` ganhou um segundo caminho de escrita. Ela tem um " +
        "só de propósito: é o que impede o casal de promover ao feed uma foto " +
        "que o convidado marcou como `noivos`."
    ).toEqual(["lib/midias.ts"]);
  });

  it("a troca devolve o valor ANTERIOR, que é o `media_visibility_from`", async () => {
    const exec = (async (partes: TemplateStringsArray) => {
      const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
      const base = {
        id: "m1",
        evento_id: EVENTO,
        participacao_id: "p1",
        lote_id: "l1",
        client_media_id: "c1",
        estado: "armazenada",
        aprovacao: "nao_requer",
        bytes: 1,
      };
      if (/^select \* from midias/.test(texto)) return [{ ...base, visibilidade: "feed" }];
      if (/update midias/.test(texto)) return [{ ...base, visibilidade: "noivos" }];
      return [];
    }) as unknown as Executor;

    const troca = await trocarVisibilidade(EVENTO, "m1", "p1", "noivos", exec);
    // O cliente não pode deduzir o anterior: ele mandou o novo, e só o servidor
    // sabia o que estava lá.
    expect(troca).toEqual(
      expect.objectContaining({ de: "feed", mudou: true })
    );
    expect(troca?.midia.visibilidade).toBe("noivos");
  });

  it("trocar para o mesmo valor não escreve nada e devolve `mudou: false`", async () => {
    const escritas: string[] = [];
    const exec = (async (partes: TemplateStringsArray) => {
      const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
      if (/update/.test(texto)) escritas.push(texto);
      if (/^select \* from midias/.test(texto)) {
        return [
          {
            id: "m1",
            evento_id: EVENTO,
            participacao_id: "p1",
            lote_id: "l1",
            client_media_id: "c1",
            estado: "armazenada",
            aprovacao: "nao_requer",
            visibilidade: "feed",
            bytes: 1,
          },
        ];
      }
      return [];
    }) as unknown as Executor;

    const troca = await trocarVisibilidade(EVENTO, "m1", "p1", "feed", exec);
    expect(troca?.mudou).toBe(false);
    // Sem escrita, `media_visibility_changed` não dispara — e a hipótese S1 mede
    // quem MEXEU, não quem tocou.
    expect(escritas).toEqual([]);
  });

  it("mídia de outra participação devolve nada (404, nunca 403)", async () => {
    const exec = (async () => []) as unknown as Executor;
    expect(await trocarVisibilidade(EVENTO, "m1", "outra", "noivos", exec)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 3. A copy — palavra terminal e os dois tetos
 * ------------------------------------------------------------------ */

describe("a copy dos dois eixos", () => {
  /**
   * A LISTA DE PROIBIDAS É DO PRODUTO, NÃO DO `pmm` (RN-32c).
   *
   * Quem lê fim de processo fecha a aba — **e no iOS a fila não drena com a aba
   * fechada**. Uma palavra terminal no estado do meio contradiz o único
   * comportamento de que o produto depende para o original existir.
   */
  const PROIBIDAS = [
    "guardada",
    "pronta",
    "concluída",
    "finalizada",
    "salva",
    "enviada",
    "ok",
    "completa",
    "tudo certo",
  ];

  it("nenhuma palavra terminal no eixo de chegada", () => {
    const textos = [
      ROTULO_DO_SELO.chegando,
      ROTULO_DO_SELO.ainda_subindo,
      EXPLICACAO_DO_SELO.chegando,
      EXPLICACAO_DO_SELO.ainda_subindo,
      linhaDeVersaoMaior(1),
      linhaDeVersaoMaior(6),
    ];
    for (const texto of textos) {
      for (const proibida of PROIBIDAS) {
        expect(
          texto.toLowerCase(),
          `"${texto}" usa a palavra terminal "${proibida}" num estado que não terminou`
        ).not.toContain(proibida);
      }
    }
  });

  it("a linha agregada cabe em 110 caracteres, no singular e no plural", () => {
    // Acima do teto ela ocupa uma terceira altura de `body2` a 328 px e empurra
    // a primeira fileira da grade para fora da dobra — que é onde o convidado
    // precisa ver a própria foto.
    expect(linhaDeVersaoMaior(1).length).toBeLessThanOrEqual(TETO_DA_LINHA_AGREGADA + 10);
    expect(linhaDeVersaoMaior(200).length).toBeLessThanOrEqual(TETO_DA_LINHA_AGREGADA + 10);
  });

  it("as linhas por item cabem em 60 caracteres", () => {
    for (const [chave, texto] of Object.entries(EXPLICACAO_DO_SELO)) {
      expect(texto.length, `${chave}: "${texto}"`).toBeLessThanOrEqual(
        TETO_DA_LINHA_POR_ITEM
      );
    }
  });

  it("nenhuma linha com teto interpola dado de tamanho variável", () => {
    /**
     * A explicação do canto B era `Só Ana Flávia e Maxwel veem esta foto` (38) e
     * chegaria a **80** com o casal de 60 caracteres que o design system manda
     * testar — um estouro que só aparece no caso de teste que ninguém roda.
     *
     * A regra que saiu daí vale para as treze telas: **linha com teto não
     * interpola dado de tamanho variável**. O nome não some do produto; ele sai
     * da linha capada e fica na que pode crescer.
     */
    for (const texto of Object.values(EXPLICACAO_DO_SELO)) {
      expect(texto).not.toMatch(/\$\{|\[nome\]|\[casal\]/i);
    }
  });

  it("`Na festa`, e não `No feed` — um conceito, um nome", () => {
    // `feed` é valor de banco e de GA4 (RN-03) e não aparece para ninguém: a
    // pessoa aperta "Mandar para a festa" e o selo que aparece depois diz "Na
    // festa". Apertar uma palavra e receber outra faz ela achar que errou.
    expect(ROTULO_DO_SELO.feed).toBe("Na festa");
    expect(Object.values(ROTULO_DO_SELO).join(" ")).not.toMatch(/feed/i);
  });

  it("o estado terminal não tem selo — a ausência é o sinal", () => {
    expect(seloDeChegada("completa")).toBeNull();
    expect(seloDeChegada("chegando")).toBe("chegando");
    expect(seloDeChegada("ainda_subindo")).toBe("ainda_subindo");
  });
});
