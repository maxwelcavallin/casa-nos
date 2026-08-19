import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MATRIZ, pode, type Acao } from "@/lib/autorizacao";
import { ROTAS_DE_API, rotaDeApiQueCasa, type MetodoHttp } from "@/lib/rotas";
import type { Sessao } from "@/lib/sessao";

/**
 * AS CATRACAS DA §9.2 DO PRD — as que impedem a autorização de deixar de ser
 * dado.
 *
 * Regra escrita não segura nada. Num produto real desta casa a regra de validar
 * id **já estava escrita** e mesmo assim 36 rotas nasceram sem ela; o que
 * segurou foi um teste que varre e quebra o CI. Este arquivo é o mesmo remédio
 * aplicado à autorização, que é onde o erro é mais caro e mais silencioso.
 *
 * As quatro varreduras:
 *   1. `cookies()` só existe em `lib/sessao.ts`
 *   2. nenhum `if` de perfil dentro de `app/api/**`
 *   3. toda rota de API aparece na matriz — e toda entrada da matriz tem arquivo
 *   4. todo método exportado por um arquivo de rota está declarado
 */

const RAIZ = path.resolve(import.meta.dirname, "..");

function arquivos(dir: string, filtro: (nome: string) => boolean, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) arquivos(completo, filtro, acc);
    else if (filtro(entrada.name)) acc.push(completo);
  }
  return acc;
}

function relativo(caminho: string): string {
  return path.relative(RAIZ, caminho).split(path.sep).join("/");
}

/** Tira comentário antes de varrer: documentar o desvio não é cometê-lo. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const rotasNoDisco = arquivos(path.join(RAIZ, "app", "api"), nome => nome === "route.ts").map(
  caminho => ({
    caminho: relativo(caminho),
    fonte: fs.readFileSync(caminho, "utf8"),
    /** `app/api/eventos/[id]/dia/route.ts` → `/api/eventos/[id]/dia` */
    url:
      "/" +
      relativo(caminho)
        .replace(/^app\//, "")
        .replace(/\/route\.ts$/, ""),
  })
);

const codigoDoApp = [
  ...arquivos(path.join(RAIZ, "app"), nome => nome.endsWith(".ts") || nome.endsWith(".tsx")),
  ...arquivos(path.join(RAIZ, "components"), nome => nome.endsWith(".ts") || nome.endsWith(".tsx")),
].map(caminho => ({ caminho: relativo(caminho), fonte: fs.readFileSync(caminho, "utf8") }));

/* ------------------------------------------------------------------ *
 * 1. Nenhum `cookies()` fora de lib/sessao.ts
 * ------------------------------------------------------------------ */

describe("a sessão é resolvida num arquivo só", () => {
  it("existe rota para conferir — se não, o varredor quebrou", () => {
    expect(rotasNoDisco.length).toBeGreaterThan(0);
  });

  it("nenhuma rota ou tela lê cookie por conta própria", () => {
    /**
     * O QUE ISTO IMPEDE: quatro portadores viram quatro leituras de cookie,
     * quatro ideias de "está expirado?" e quatro decisões de perfil espalhadas.
     * O `escopo-core.md` §9 já registrava isso como o débito mais provável desta
     * fatia — e ele é invisível em revisão, porque cada `cookies()` isolado
     * parece razoável.
     */
    const infratores = codigoDoApp
      .filter(a => /\bcookies\s*\(/.test(semComentarios(a.fonte)))
      .map(a => a.caminho);

    expect(
      infratores,
      "Estes arquivos leem cookie direto:\n" +
        infratores.map(c => `  - ${c}`).join("\n") +
        "\n\nA leitura de sessão mora em lib/sessao.ts, e só lá. Use " +
        "`sessaoDoEvento(eventoId)`."
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 2. Nenhum `if` de perfil dentro de app/api/**
 * ------------------------------------------------------------------ */

describe("autorização é dado, não `if` espalhado", () => {
  it("nenhuma rota de API decide perfil por conta própria", () => {
    /**
     * A comparação por `sessao.tipo === "casal"` dentro de uma rota é como a
     * matriz deixa de valer: ela continua lá, bonita, e a rota nova decide
     * sozinha. Quando alguém mudar a regra na matriz, essa rota não muda junto —
     * e ninguém percebe, porque as duas versões parecem certas.
     *
     * O estreitamento de tipo que o TypeScript exige tem um ajudante próprio
     * (`participacaoDaSessao`), justamente para esta varredura não ter exceção.
     */
    const padrao = /\.tipo\s*===\s*["'](casal|moderador|telao|convidado|dono|cron)["']/;
    const infratores = rotasNoDisco
      .filter(r => padrao.test(semComentarios(r.fonte)))
      .map(r => r.caminho);

    expect(
      infratores,
      "Estas rotas decidem perfil por conta própria:\n" +
        infratores.map(c => `  - ${c}`).join("\n") +
        "\n\nUse `pode(sessao, acao)` de lib/autorizacao.ts. Se o que você precisa " +
        "é só estreitar o tipo, use `participacaoDaSessao(sessao)`."
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 3 e 4. Rota ↔ matriz, e método declarado
 * ------------------------------------------------------------------ */

describe("toda rota nova aparece na matriz de permissão", () => {
  it("todo arquivo de rota está declarado em lib/rotas.ts", () => {
    const declaradas = new Set(ROTAS_DE_API.map(r => r.caminho));
    const orfas = rotasNoDisco.filter(r => !declaradas.has(r.url)).map(r => r.url);

    expect(
      orfas,
      "Estas rotas existem no disco e não estão em lib/rotas.ts:\n" +
        orfas.map(c => `  - ${c}`).join("\n") +
        "\n\nRota que não está declarada responde 405 no middleware e não tem dono " +
        "na matriz de permissão. Declare o caminho, os métodos e a ação."
    ).toEqual([]);
  });

  it("toda entrada de lib/rotas.ts tem arquivo no disco", () => {
    const noDisco = new Set(rotasNoDisco.map(r => r.url));
    const fantasmas = ROTAS_DE_API.filter(r => !noDisco.has(r.caminho)).map(r => r.caminho);

    expect(
      fantasmas,
      "Declaradas e inexistentes: " +
        fantasmas.join(", ") +
        ". Entrada sem arquivo vira permissão silenciosa se alguém criar o arquivo depois."
    ).toEqual([]);
  });

  it("toda ação declarada existe na matriz", () => {
    const acoes = new Set(Object.keys(MATRIZ));
    const desconhecidas: string[] = [];
    for (const rota of ROTAS_DE_API) {
      for (const acao of Object.values(rota.metodos)) {
        if (!acoes.has(acao as string)) desconhecidas.push(`${rota.caminho} → ${acao}`);
      }
    }
    expect(desconhecidas).toEqual([]);
  });

  it("todo método exportado pelo arquivo está declarado", () => {
    /**
     * O caso concreto: alguém acrescenta `export const DELETE` num arquivo de
     * rota que só declarava `POST`. Sem esta varredura, o middleware barraria o
     * método em produção (405) e ninguém entenderia por quê — o código está lá,
     * exportado, aparentemente certo.
     */
    const problemas: string[] = [];
    for (const rota of rotasNoDisco) {
      const declarada = rotaDeApiQueCasa(rota.url);
      if (!declarada) continue;
      const exportados = [...semComentarios(rota.fonte).matchAll(/export const (GET|POST|PATCH|DELETE|PUT)\b/g)].map(
        m => m[1]
      );
      for (const metodo of exportados) {
        if (!declarada.metodos[metodo as MetodoHttp]) {
          problemas.push(`${rota.url} exporta ${metodo} e não o declara`);
        }
      }
    }
    expect(problemas).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * As três assimetrias que precisam sobreviver ao code review (PRD §7)
 * ------------------------------------------------------------------ */

const CONVIDADO: Sessao = {
  tipo: "convidado",
  participacao: {
    id: "p1",
    eventoId: "e1",
    papel: "convidado",
    convidadoId: null,
    rotulo: null,
    modoIdentificacao: null,
    faixaLenta: false,
    primeiroAcessoEm: null,
  },
};

function acesso(tipo: "casal" | "moderador" | "telao", dono = false): Sessao {
  return {
    tipo,
    acesso: { id: "a1", eventoId: "e1", tipo, rotulo: null, dono, expiraEm: null },
  } as Sessao;
}

const DONO = acesso("casal", true);

describe("as três assimetrias da matriz", () => {
  it("SÓ quem enviou edita a visibilidade — nem casal, nem moderador, nem dono", () => {
    /**
     * Esta é a decisão de modelagem mais importante do PRD (§3.2, P2). A matriz
     * é a SEGUNDA tranca: a primeira é estrutural — o casal escreve
     * `midias.aprovacao`, e `midias.visibilidade` tem um caminho de escrita só.
     * Se as duas caírem, o casal passa a poder promover ao feed uma foto que o
     * convidado marcou como "só para os noivos", que é a quebra de confiança
     * mais grave que este produto pode cometer.
     */
    expect(pode(CONVIDADO, "midia.visibilidade.editar")).toBe("proprias");
    expect(pode(acesso("casal"), "midia.visibilidade.editar")).toBe("nao");
    expect(pode(acesso("moderador"), "midia.visibilidade.editar")).toBe("nao");
    expect(pode(DONO, "midia.visibilidade.editar")).toBe("nao");
  });

  it("o moderador modera e NÃO exclui", () => {
    expect(pode(acesso("moderador"), "midia.moderar")).toBe("todas");
    expect(pode(acesso("moderador"), "midia.excluir")).toBe("nao");
  });

  it("o telão é leitura pura", () => {
    const telao = acesso("telao");
    expect(pode(telao, "feed.ver")).toBe("recorte_proprio");
    expect(pode(telao, "midia.enviar")).toBe("nao");
    expect(pode(telao, "midia.moderar")).toBe("nao");
    expect(pode(telao, "midia.excluir")).toBe("nao");
    expect(pode(telao, "evento.configurar")).toBe("nao");
  });

  it("só o dono vê a medição — nem o casal", () => {
    expect(pode(DONO, "medicao.ver")).toBe("todas");
    expect(pode(acesso("casal"), "medicao.ver")).toBe("nao");
    expect(pode(CONVIDADO, "medicao.ver")).toBe("nao");
  });

  it("o anônimo não pode nada", () => {
    const anonimo: Sessao = { tipo: "anonimo" };
    for (const acao of Object.keys(MATRIZ) as Acao[]) {
      expect(pode(anonimo, acao), `anônimo ganhou ${acao}`).toBe("nao");
    }
  });

  it("o casal que envia foto é participação com papel `casal`, e ela não é convidado", () => {
    // Semear o feed é o casal usando o mesmo fluxo (PRD §3.1, V5). A
    // participação existe, publica, e fica FORA do denominador da North Star
    // (RN-22) — por isso o papel muda o perfil.
    const casalSemeando: Sessao = {
      tipo: "convidado",
      participacao: { ...CONVIDADO.participacao, papel: "casal" },
    } as Sessao;
    expect(pode(casalSemeando, "midia.enviar")).toBe("dentro_da_janela");
    expect(pode(casalSemeando, "album.minhas.ver")).toBe("nao");
  });
});
