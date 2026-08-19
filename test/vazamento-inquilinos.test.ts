import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { acessoPorToken } from "@/lib/acessos";
import type { Executor } from "@/lib/db";
import { confirmarFaixa, registrarIntencao } from "@/lib/midias";
import { participacaoPorToken } from "@/lib/participacoes";
import { ROTAS_DE_API } from "@/lib/rotas";
import { hashDeToken } from "@/lib/segredos";

/**
 * INQUILINO A NÃO LÊ O INQUILINO B — agora com as tabelas da Fatia 1.
 *
 * É o bug mais caro deste modelo e é **invisível em teste com um inquilino só**.
 * Por isso o banco falso abaixo tem DOIS casamentos desde a primeira linha, e
 * por isso o bootstrap cria dois eventos desde a F1.1 (PRD §9.1, item 6):
 * acrescentar o segundo inquilino depois significa auditar cada consulta escrita
 * até ali.
 *
 * O que a Fatia 1 acrescenta ao risco: agora existem **quatro portadores de
 * credencial** e uma tabela de mídia. Um token de moderador que abrisse o painel
 * do casamento vizinho, ou uma confirmação de faixa que carimbasse a foto de
 * outra pessoa, seriam falhas piores que a da Fatia 0 — porque envolvem foto de
 * gente numa festa.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

type Registro = { texto: string; valores: unknown[] };

/**
 * Banco falso que responde às consultas da fatia E GUARDA o que foi perguntado.
 *
 * O registro é o que permite afirmar que a consulta **carregou o `evento_id`** —
 * e não só que ela devolveu o resultado certo por acaso. Uma consulta sem filtro
 * de inquilino pode devolver a resposta certa num banco com dois registros e
 * vazar num banco com duzentos.
 */
function bancoFalso() {
  const registro: Registro[] = [];

  const participacoes = [
    { id: "pa", evento_id: A, token_hash: "", papel: "convidado", faixa_lenta: false },
    { id: "pb", evento_id: B, token_hash: "", papel: "convidado", faixa_lenta: false },
  ];
  const acessos = [
    { id: "aa", evento_id: A, tipo: "moderador", token_hash: "", rotulo: "Padrinho", dono: false },
    { id: "ab", evento_id: B, tipo: "casal", token_hash: "", rotulo: "Casal", dono: false },
  ];
  const midias = [
    {
      id: "m-de-a",
      evento_id: A,
      participacao_id: "pa",
      lote_id: "l1",
      client_media_id: "c1",
      estado: "intencao",
      visibilidade: "feed",
      aprovacao: "nao_requer",
      hash_conteudo: null,
      tipo_arquivo: "image/jpeg",
      bytes: 1,
      previa_armazenada_em: null,
      original_armazenada_em: null,
      criada_em: new Date(),
      enfileirada_offline: false,
    },
  ];

  const exec = (async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = partes.join(" ? ").replace(/\s+/g, " ").trim();
    registro.push({ texto, valores });

    if (/from participacoes/.test(texto)) {
      const [hash, eventoId] = valores as string[];
      return participacoes.filter(p => p.token_hash === hash && p.evento_id === eventoId);
    }
    if (/from evento_acessos/.test(texto)) {
      const [hash, eventoId] = valores as string[];
      return acessos.filter(a => a.token_hash === hash && a.evento_id === eventoId);
    }
    if (/count\(\*\)::int as total from midias/.test(texto)) return [{ total: 0 }];
    if (/select \* from midias/.test(texto)) {
      const eventoId = valores[0];
      return midias.filter(m => m.evento_id === eventoId);
    }
    if (/update midias/.test(texto)) {
      /**
       * A linha só volta quando os TRÊS aparecem entre os parâmetros: id da
       * mídia, id do evento e id da participação. É a forma mais honesta de o
       * banco falso reproduzir a cláusula real — se alguém tirar o
       * `participacao_id` do `where`, este teste passa a devolver a linha do
       * vizinho e o caso abaixo quebra.
       */
      return midias.filter(
        m =>
          valores.includes(m.id) &&
          valores.includes(m.evento_id) &&
          valores.includes(m.participacao_id)
      );
    }
    if (/insert into midias/.test(texto)) return [];
    return [];
  }) as unknown as Executor;

  return { exec, registro, participacoes, acessos, midias };
}

describe("participação de um evento não vale no outro", () => {
  it("o token do convidado de A não resolve nada em B", async () => {
    const banco = bancoFalso();
    banco.participacoes[0].token_hash = await hashDeToken(TOKEN_A);

    const emCasa = await participacaoPorToken(A, TOKEN_A, banco.exec);
    expect(emCasa?.id).toBe("pa");

    const naCasaDoVizinho = await participacaoPorToken(B, TOKEN_A, banco.exec);
    expect(
      naCasaDoVizinho,
      "o cookie de um casamento resolveu participação no outro — é o mesmo " +
        "aparelho virando a mesma pessoa em duas festas"
    ).toBeNull();
  });

  it("a consulta carrega o evento_id, e não só o hash do token", async () => {
    const banco = bancoFalso();
    banco.participacoes[0].token_hash = await hashDeToken(TOKEN_A);
    await participacaoPorToken(A, TOKEN_A, banco.exec);

    const consulta = banco.registro.find(r => /from participacoes/.test(r.texto));
    expect(consulta?.texto).toMatch(/evento_id = \?/);
    expect(consulta?.valores).toContain(A);
  });
});

describe("os links ao portador não atravessam eventos (RN-26)", () => {
  it("o link do moderador de A não abre nada em B", async () => {
    const banco = bancoFalso();
    banco.acessos[0].token_hash = await hashDeToken(TOKEN_A);

    expect((await acessoPorToken(A, TOKEN_A, banco.exec))?.tipo).toBe("moderador");
    expect(await acessoPorToken(B, TOKEN_A, banco.exec)).toBeNull();
  });

  it("a sessão do casal de B não abre o painel de A", async () => {
    const banco = bancoFalso();
    banco.acessos[1].token_hash = await hashDeToken(TOKEN_B);

    expect((await acessoPorToken(B, TOKEN_B, banco.exec))?.tipo).toBe("casal");
    expect(await acessoPorToken(A, TOKEN_B, banco.exec)).toBeNull();
  });
});

describe("mídia não atravessa evento nem participação", () => {
  it("a intenção filtra por evento_id nas três instruções", async () => {
    const banco = bancoFalso();
    await registrarIntencao(
      A,
      "pa",
      "direto",
      [
        {
          clientMediaId: "c9",
          loteId: "l9",
          bytes: 10,
          tipoArquivo: "image/jpeg",
          hashConteudo: null,
          visibilidade: "feed",
          origem: "galeria",
          enfileiradaOffline: false,
        },
      ],
      banco.exec
    );

    const semFiltro = banco.registro
      .filter(r => /midias/.test(r.texto))
      .filter(r => !r.valores.includes(A));

    expect(
      semFiltro.map(r => r.texto.slice(0, 60)),
      "instrução sobre `midias` sem o evento_id entre os parâmetros"
    ).toEqual([]);
  });

  it("confirmar a faixa de uma mídia de outra participação devolve nada (404)", async () => {
    const banco = bancoFalso();

    const minha = await confirmarFaixa(A, "m-de-a", "pa", "previa", {}, banco.exec);
    expect(minha).not.toBeNull();

    const doVizinho = await confirmarFaixa(A, "m-de-a", "pb", "previa", {}, banco.exec);
    expect(
      doVizinho,
      "um convidado carimbou a foto de outro. Carimbo falso é pior que foto " +
        "perdida: a foto some da consulta de perda e ninguém procura por ela."
    ).toBeNull();
  });

  it("confirmar mídia de outro evento devolve nada", async () => {
    const banco = bancoFalso();
    expect(await confirmarFaixa(B, "m-de-a", "pa", "previa", {}, banco.exec)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * A varredura: toda rota passa pelo mesmo portão
 * ------------------------------------------------------------------ */

describe("varredura sobre a lista de rotas", () => {
  const RAIZ = path.resolve(import.meta.dirname, "..");

  it("toda rota de evento resolve o inquilino por `autorizar`", () => {
    /**
     * `autorizar(eventoId, acao)` é o portão: ele busca o evento, resolve a
     * sessão **daquele evento** e consulta a matriz. Uma rota que pule isso e
     * consulte o banco direto com o id da URL é o vazamento clássico deste
     * modelo — e ele é invisível em revisão, porque a consulta parece correta.
     *
     * As rotas públicas (`/api/sessao/*`, `/api/interno/erro-cliente`) não têm
     * `[id]` de evento na URL e resolvem o inquilino de outro jeito; elas estão
     * declaradas como públicas em lib/rotas.ts, e é essa declaração que as
     * dispensa — não a ausência de checagem.
     */
    const comEvento = ROTAS_DE_API.filter(r => r.caminho.includes("/eventos/[id]"));
    expect(comEvento.length).toBeGreaterThan(0);

    const semPortao = comEvento.filter(rota => {
      const arquivo = path.join(RAIZ, "app", `${rota.caminho.replace(/^\//, "")}`, "route.ts");
      const fonte = fs.readFileSync(arquivo, "utf8");
      return !/autorizar\s*\(/.test(fonte);
    });

    expect(
      semPortao.map(r => r.caminho),
      "Estas rotas não passam por `autorizar()`. Sem ele, o `[id]` da URL vira " +
        "filtro de inquilino sem ninguém conferir de quem é a sessão."
    ).toEqual([]);
  });
});
