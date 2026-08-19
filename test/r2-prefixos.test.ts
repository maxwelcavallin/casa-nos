import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { chavesDaFoto, chavesDaMidia, PREFIXO_PRIVADO, PREFIXO_PUBLICO } from "@/lib/r2";
import { prefixoPublicoDoEvento } from "@/lib/r2-objetos";

/**
 * **EXATAMENTE DUAS FUNÇÕES DO PRODUTO SABEM MONTAR CAMINHO NO BALDE** (RV-20).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE A CONTAGEM É A ASSERÇÃO, e não uma revisão de código: mudar o layout
 * do balde depois é **migração de blob** — copiar objeto por objeto, com o
 * produto no ar, sem transação. É a mudança mais cara que este produto tem
 * (`escopo-core.md` §9), e ela fica cara exatamente na proporção do número de
 * lugares que sabem o formato de uma chave.
 *
 * As duas, e o que separa uma da outra:
 *
 *   `chavesDaMidia`  álbum   `{pub|prv}/e/<evento>/m/<midia>/{t,p}.jpg` + original
 *   `chavesDaFoto`   galeria `pub/e/<evento>/g/<foto>/{t,p}.jpg`, sem original
 *
 * **ELA NASCE PROIBINDO, e não em modo contagem** (`qualidade.md` §2): a
 * contagem depois de V-18 é exatamente dois, então não há trabalho existente a
 * ser reprovado. Uma terceira quebra o CI no commit em que nasce, que é o único
 * momento em que ela ainda é barata de desfazer.
 *
 * **SE VOCÊ CHEGOU AQUI PORQUE ESCREVEU A TERCEIRA**, o conserto não é aumentar
 * o número: é chamar uma das duas. Se a família nova de objetos for de verdade
 * uma terceira coisa, isso é uma decisão de layout de balde — ou seja, um ADR e
 * uma conversa, não uma linha a mais nesta lista.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = path.resolve(import.meta.dirname, "..");
const PASTAS = ["lib", "app", "components", "scripts"];

/**
 * Uma **montadora de caminho de objeto** é um literal que constrói uma chave
 * dentro do prefixo por evento e de uma família (`/m/` de mídia, `/g/` de
 * galeria). É essa forma que identifica um OBJETO.
 *
 * `prefixoPublicoDoEvento` (`pub/e/<id>/`) não casa, e a exclusão é deliberada:
 * ele é o prefixo de uma LISTAGEM, não o caminho de um arquivo. A diferença
 * importa — trocar o layout de família não o afeta, e ele tem asserção própria
 * no fim deste arquivo.
 */
const MONTADORA = /`[^`]*\/e\/\$\{[^`]*\/(?:m|g)\/[^`]*`/g;

/**
 * Uma cópia NOVA a cada uso.
 *
 * `RegExp` com `/g` guarda `lastIndex` entre chamadas, e um `.test()` reusado
 * num `filter` pula arquivos — a catraca ficaria **verde por não estar
 * olhando**, que é o pior número possível. Este é o defeito clássico da forma,
 * e ele não deixa sintoma nenhum.
 */
function montadora(): RegExp {
  return new RegExp(MONTADORA.source, "g");
}

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function arquivosDe(dir: string, acumulado: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acumulado;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) arquivosDe(completo, acumulado);
    else if (/\.(ts|tsx|mjs)$/.test(entrada.name)) acumulado.push(completo);
  }
  return acumulado;
}

const arquivos = PASTAS.flatMap(p => arquivosDe(path.join(RAIZ, p))).map(caminho => ({
  relativo: path.relative(RAIZ, caminho).split(path.sep).join("/"),
  fonte: semComentarios(fs.readFileSync(caminho, "utf8")),
}));

describe("o layout do balde tem exatamente dois donos", () => {
  it("o varredor acha alguma coisa — se não, o resto é falso positivo", () => {
    const total = arquivos.reduce(
      (soma, a) => soma + (a.fonte.match(montadora())?.length ?? 0),
      0
    );
    expect(
      total,
      "Nenhuma montagem de caminho encontrada. Ou o layout do balde mudou de " +
        "forma, ou este varredor parou de casar — e aí ele fica verde sem " +
        "verificar nada, que é o pior número possível."
    ).toBeGreaterThan(0);
  });

  it("**só `lib/r2.ts` monta caminho de objeto**", () => {
    const fora = arquivos
      .filter(a => a.relativo !== "lib/r2.ts" && montadora().test(a.fonte))
      .map(a => a.relativo);

    expect(
      fora,
      "Estes arquivos montam caminho no balde por conta própria:\n" +
        fora.map(a => `  - ${a}`).join("\n") +
        "\n\nO formato de uma chave tem UM dono (`lib/r2.ts`, RN-33). Chame " +
        "`chavesDaMidia` ou `chavesDaFoto`."
    ).toEqual([]);
  });

  it("**são exatamente duas funções, e são estas**", () => {
    const fonte = arquivos.find(a => a.relativo === "lib/r2.ts")!.fonte;

    // A função que ENVOLVE cada montagem: a última `export function` antes dela.
    const donas = new Set<string>();
    for (const achado of fonte.matchAll(montadora())) {
      const antes = fonte.slice(0, achado.index);
      const declaracoes = [...antes.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)];
      donas.add(declaracoes.length ? declaracoes[declaracoes.length - 1][1] : "(fora de função)");
    }

    expect(
      [...donas].sort(),
      "A lista de montadoras mudou. Ver o cabeçalho deste arquivo antes de " +
        "acrescentar a terceira."
    ).toEqual(["chavesDaFoto", "chavesDaMidia"]);
  });
});

describe("o que cada uma monta", () => {
  const EVENTO = "11111111-1111-4111-8111-111111111111";
  const MIDIA = "22222222-2222-4222-8222-222222222222";
  const FOTO = "33333333-3333-4333-8333-333333333333";

  it("a mídia `feed` vai para `pub/`, a `noivos` para `prv/`, e o original é sempre privado", () => {
    const feed = chavesDaMidia(EVENTO, MIDIA, "image/jpeg", "feed");
    expect(feed.miniatura).toBe(`${PREFIXO_PUBLICO}/e/${EVENTO}/m/${MIDIA}/t.jpg`);
    expect(feed.previa).toBe(`${PREFIXO_PUBLICO}/e/${EVENTO}/m/${MIDIA}/p.jpg`);
    // O ORIGINAL É `prv/` MESMO EM `feed`: ele carrega EXIF, inclusive GPS.
    expect(feed.original).toBe(`${PREFIXO_PRIVADO}/e/${EVENTO}/m/${MIDIA}/o.jpg`);

    const noivos = chavesDaMidia(EVENTO, MIDIA, "image/jpeg", "noivos");
    expect(noivos.miniatura.startsWith(`${PREFIXO_PRIVADO}/`)).toBe(true);
  });

  it("**a foto da galeria é só `pub/`, na família `g/`, e não tem original**", () => {
    const chaves = chavesDaFoto(EVENTO, FOTO);
    expect(chaves).toEqual({
      miniatura: `${PREFIXO_PUBLICO}/e/${EVENTO}/g/${FOTO}/t.jpg`,
      previa: `${PREFIXO_PUBLICO}/e/${EVENTO}/g/${FOTO}/p.jpg`,
    });

    // Duas chaves, e só duas. Uma terceira aqui seria um original — e original
    // é o que traz EXIF, expurgo, download e carência de volta (§4.8.2).
    expect(Object.keys(chaves)).toHaveLength(2);
  });

  it("a galeria NUNCA cai em `prv/`", () => {
    /**
     * `prv/` existe para cumprir a promessa *"só os noivos veem esta foto"*, que
     * a galeria não faz. Ocupá-lo com um objeto sem promessa a cumprir dilui o
     * significado do prefixo — que é a coisa que `lib/r2.ts` mais protege.
     */
    for (const chave of Object.values(chavesDaFoto(EVENTO, FOTO))) {
      expect(chave.startsWith(`${PREFIXO_PRIVADO}/`)).toBe(false);
      expect(chave.startsWith(`${PREFIXO_PUBLICO}/`)).toBe(true);
    }
  });

  it("**a galeria mora dentro do MESMO prefixo por evento**, e a expiração sai de graça", () => {
    /**
     * A regra de ciclo de vida de 12 meses (Q9) é por prefixo `pub/e/<id>/`, e é
     * configuração do balde, não código. Como a galeria é irmã de `m/` dentro
     * dele, ela é coberta **sem regra nova** — e a varredura do cron continua
     * fazendo sentido, porque o prefixo que ela lista não mudou.
     */
    const prefixo = prefixoPublicoDoEvento(EVENTO);
    expect(prefixo).toBe(`${PREFIXO_PUBLICO}/e/${EVENTO}/`);
    for (const chave of Object.values(chavesDaFoto(EVENTO, FOTO))) {
      expect(chave.startsWith(prefixo)).toBe(true);
    }
  });

  it("as duas famílias não colidem", () => {
    // `m/` e `g/` no mesmo nível. Um id de mídia e um id de foto podem, em
    // teoria, coincidir — os dois são uuid v4 —, e é a letra da família que
    // impede duas coisas diferentes de dividirem a mesma chave.
    const daMidia = chavesDaMidia(EVENTO, FOTO, "image/jpeg", "feed").previa;
    const daFoto = chavesDaFoto(EVENTO, FOTO).previa;
    expect(daMidia).not.toBe(daFoto);
  });
});
