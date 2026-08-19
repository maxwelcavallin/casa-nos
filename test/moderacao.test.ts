import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Executor } from "@/lib/db";
import {
  aprovarTodasAsPendentes,
  moderarEmLote,
  paginaDaFila,
} from "@/lib/moderacao";

/**
 * A FILA DE APROVAÇÃO SEGURA O FEED, NUNCA O CASAL (H-13).
 *
 * A frase da história é literal e é o que este arquivo verifica: *"nada me
 * obrigue a olhar o celular durante a minha festa, e tudo que meus convidados
 * mandaram já esteja comigo mesmo sem aprovação."*
 */

const EVENTO = "11111111-1111-4111-8111-111111111111";
const M1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const M2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

function espiao(resposta: (texto: string) => Record<string, unknown>[]) {
  const consultas: Array<{ texto: string; valores: unknown[] }> = [];
  const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
    consultas.push({ texto, valores });
    return resposta(texto);
  }) as unknown as Executor;
  return { exec, consultas };
}

describe("a fila decide feed e telão — e só", () => {
  it("a cláusula filtra `visibilidade = 'feed'`", async () => {
    /**
     * Uma foto `noivos` nasce `pendente` no modo fila (o carimbo é da intenção,
     * RN-06) e **nunca vai aparecer no feed nem na parede**. Listá-la aqui
     * inflaria "Esperando aprovação" com fotos sobre as quais a moderação não
     * decide nada — e o casal trabalharia à toa, que é justamente o que a
     * história proíbe.
     */
    const { exec, consultas } = espiao(() => []);
    await paginaDaFila(EVENTO, null, 40, exec);
    expect(consultas[0].texto).toMatch(/visibilidade = 'feed'/);
    expect(consultas[0].texto).toMatch(/aprovacao = 'pendente'/);
    expect(consultas[0].texto).toMatch(/excluida_em is null/);
  });

  it("a ordem é a mais VELHA primeiro — é a única grade do produto assim", async () => {
    // Fila é fila. Em toda outra tela a mais nova vem primeiro; aqui, quem
    // espera há mais tempo aparece antes.
    const { exec, consultas } = espiao(() => []);
    await paginaDaFila(EVENTO, null, 40, exec);
    expect(consultas[0].texto).toMatch(/order by m\.armazenada_em asc, m\.id asc/);
  });

  it("toda consulta carrega o evento — nenhuma carrega a do vizinho", async () => {
    const { exec, consultas } = espiao(() => []);
    await paginaDaFila(EVENTO, null, 40, exec);
    for (const consulta of consultas) {
      expect(consulta.valores).toContain(EVENTO);
    }
  });
});

describe("aprovar em lote é UMA requisição e UMA instrução", () => {
  it("um `update` só, com a lista inteira", async () => {
    /**
     * Com 400 pendentes às 23h, um `update` por foto seriam 400 idas ao banco
     * pelo wifi de um salão — e a metade que falhasse deixaria a tela sem saber
     * o que aconteceu.
     */
    const { exec, consultas } = espiao(() => [{ id: M1 }, { id: M2 }]);
    const saida = await moderarEmLote(EVENTO, [M1, M2], "aprovada", null, exec);
    expect(consultas).toHaveLength(1);
    expect(consultas[0].texto).toMatch(/^update midias/);
    expect(saida.alteradas).toBe(2);
    expect(saida.naoAlteradas).toEqual([]);
  });

  it("devolve OS DOIS NÚMEROS: o que mudou e o que continua na lista", async () => {
    // A tela escreve "380 fotos foram aprovadas. 20 não deram certo e continuam
    // na lista." — nunca só o que deu errado.
    const { exec } = espiao(() => [{ id: M1 }]);
    const saida = await moderarEmLote(EVENTO, [M1, M2], "aprovada", null, exec);
    expect(saida.alteradas).toBe(1);
    expect(saida.naoAlteradas).toEqual([M2]);
  });

  it("repetir o mesmo lote muda ZERO na segunda vez", async () => {
    /**
     * `aprovacao = 'pendente'` na cláusula é o que torna a repetição inofensiva.
     * Sem ela, dois moderadores tocando ao mesmo tempo contariam a mesma foto
     * duas vezes no número que a tela mostra.
     */
    const { exec, consultas } = espiao(() => []);
    const saida = await moderarEmLote(EVENTO, [M1], "aprovada", null, exec);
    expect(consultas[0].texto).toMatch(/and aprovacao = 'pendente'/);
    expect(saida.alteradas).toBe(0);
  });

  it("`recusada` NÃO apaga: a mídia continua com o casal", async () => {
    const { exec, consultas } = espiao(() => [{ id: M1 }]);
    await moderarEmLote(EVENTO, [M1], "recusada", null, exec);
    const sql = consultas[0].texto;
    expect(sql).not.toMatch(/excluida_em\s*=/);
    expect(sql).not.toMatch(/\bdelete\b/i);
  });

  it("lote vazio não vai ao banco", async () => {
    const { exec, consultas } = espiao(() => []);
    await moderarEmLote(EVENTO, [], "aprovada", null, exec);
    expect(consultas).toHaveLength(0);
  });

  it("aprovar tudo não precisa da lista de ids", async () => {
    // "Libera tudo" é o que a pessoa pediu, e mandar 400 uuid pelo wifi do salão
    // seria traduzir mal o pedido dela.
    const { exec, consultas } = espiao(() => [{ id: M1 }, { id: M2 }]);
    const quantas = await aprovarTodasAsPendentes(EVENTO, null, exec);
    expect(quantas).toBe(2);
    expect(consultas[0].valores).not.toContain(M1);
  });
});

/* ------------------------------------------------------------------ *
 * As catracas de varredura
 * ------------------------------------------------------------------ */

const RAIZ = path.resolve(import.meta.dirname, "..");

function arquivos(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) arquivos(completo, acc);
    else if (/\.tsx?$/.test(entrada.name)) acc.push(completo);
  }
  return acc;
}

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("o convidado nunca vê a fila (RN-07)", () => {
  /**
   * `CardMidia` é COMPARTILHADO entre o álbum do convidado e o painel do casal,
   * e é o único arquivo de `components/album/` que conhece o eixo de aprovação —
   * ele o desenha só quando a prop chega, e quem a passa é o painel.
   *
   * A exceção é nominal e tem motivo escrito, que é a única forma de exceção que
   * esta casa aceita numa catraca.
   */
  const COMPARTILHADO = "components/album/CardMidia.tsx";

  it("nenhuma tela do álbum PASSA a prop de aprovação para o card", () => {
    // O card sabe desenhar o eixo, e ninguém do lado do convidado pode ligá-lo —
    // nem por engano, nem "só para depurar".
    const infratores = arquivos(path.join(RAIZ, "components", "album"))
      .map(caminho => ({
        caminho: path.relative(RAIZ, caminho).split(path.sep).join("/"),
        fonte: semComentarios(fs.readFileSync(caminho, "utf8")),
      }))
      .filter(a => a.caminho !== COMPARTILHADO)
      .filter(a => a.fonte.includes("aprovacao={"))
      .map(a => a.caminho);
    expect(infratores).toEqual([]);
  });

  it("nenhum arquivo do álbum, além do card compartilhado, conhece aprovação", () => {
    /**
     * Para o convidado, **enviado é enviado**. Nem selo, nem "em análise", nem
     * contador, nem tempo estimado.
     *
     * `pendentes` da fila de ENVIO fica de fora do padrão de propósito: é outra
     * grandeza — itens esperando para subir do celular —, e ela é justamente o
     * que o convidado precisa ver.
     */
    const infratores = arquivos(path.join(RAIZ, "components", "album"))
      .map(caminho => ({
        caminho: path.relative(RAIZ, caminho).split(path.sep).join("/"),
        fonte: semComentarios(fs.readFileSync(caminho, "utf8")),
      }))
      .filter(a => a.caminho !== COMPARTILHADO)
      .filter(a => /aprova[cç]|moderad/i.test(a.fonte))
      .map(a => a.caminho);

    expect(
      infratores,
      "Estes arquivos do álbum do convidado falam de aprovação:\n" +
        infratores.map(c => `  - ${c}`).join("\n") +
        "\n\nRN-07: o convidado não vê a fila de moderação, em tela nenhuma."
    ).toEqual([]);
  });
});

describe("o painel do casal NÃO é filtrado pela aprovação (H-13)", () => {
  it("a consulta da grade só filtra aprovação quando o próprio casal escolhe", () => {
    /**
     * "Tudo que meus convidados mandaram já está comigo mesmo sem aprovação."
     * Em código, isso é a **ausência** de uma cláusula — e ausência não quebra
     * nada visivelmente quando alguém a acrescenta. Por isso ela é teste.
     */
    const fonte = semComentarios(
      fs.readFileSync(path.join(RAIZ, "lib", "painel-midias.ts"), "utf8")
    );
    const ocorrencias = [...fonte.matchAll(/aprovacao\s*=\s*'pendente'/g)];
    // Uma só, e ela está atrás do filtro `soPendentes` que o usuário liga.
    expect(ocorrencias).toHaveLength(1);
    expect(fonte).toMatch(/\$\{!soPendentes\}.*aprovacao = 'pendente'/s);
  });
});
