import type { Acao } from "@/lib/autorizacao";

/**
 * A SUPERFÍCIE DECLARADA DO PRODUTO — rotas de API e telas, como dado.
 *
 * TRÊS CONSUMIDORES, e é por isso que ela existe em vez de estar espalhada:
 *
 * 1. `middleware.ts` — o guarda de escopo por método HTTP (`stack.md` §3). Rota
 *    que não declara o método responde **405 antes de existir handler**. Uma
 *    rota nova nasce protegida sem ninguém lembrar de nada.
 * 2. `lib/api.ts` — o invólucro de rota, que lê daqui a permissão exigida.
 * 3. `test/autorizacao-matriz.test.ts` — a catraca: arquivo em `app/api/**` que
 *    não aparece aqui quebra o CI, e entrada daqui sem arquivo também.
 *
 * O PRD §6.1 declara 41 rotas para a Fatia 1 inteira. Aqui estão **as que
 * existem**, e só elas: uma lista com rota que ainda não foi construída faria a
 * catraca number 3 reprovar o próprio produto, e o remédio seria desligá-la. O
 * mapa completo, com o que falta e em que sub-fatia entra, está em
 * `docs/fatia-1-f1-1-f1-2.md`.
 */

export type MetodoHttp = "GET" | "POST" | "PATCH" | "DELETE";

/** Onde a pessoa está, para o GA4 (`metricas.md` §6.1). */
export type Superficie = "convidado" | "casal" | "telao";

export type RotaDeApi = {
  /** No formato do App Router, com `[param]`. É a chave. */
  caminho: string;
  /** Método → ação da matriz. O que não está aqui responde 405. */
  metodos: Partial<Record<MetodoHttp, Acao>>;
  /**
   * Rota pública de verdade (não exige sessão). São duas, e as duas têm limite
   * de taxa: pedir o link do casal e relatar erro de cliente.
   */
  publica?: boolean;
};

export const ROTAS_DE_API: RotaDeApi[] = [
  // H-02 — o casal entra
  { caminho: "/api/sessao/link", metodos: { POST: "evento.configurar" }, publica: true },
  { caminho: "/api/sessao/entrar", metodos: { POST: "evento.configurar" }, publica: true },

  // H-02 — o casal configura o dia
  { caminho: "/api/eventos/[id]/dia", metodos: { PATCH: "evento.configurar" } },
  { caminho: "/api/eventos/[id]/acessos", metodos: { POST: "evento.configurar" } },
  {
    caminho: "/api/eventos/[id]/acessos/[acessoId]",
    metodos: { DELETE: "evento.configurar" },
  },

  // H-06 — a intenção antes dos bytes, e a confirmação por faixa
  { caminho: "/api/eventos/[id]/midias/intencao", metodos: { POST: "midia.enviar" } },
  {
    caminho: "/api/eventos/[id]/midias/[midiaId]/confirmacao",
    metodos: { POST: "midia.enviar" },
  },

  // H-10 — a visibilidade volta atrás, e apagar é um toque
  {
    caminho: "/api/eventos/[id]/midias/[midiaId]/visibilidade",
    metodos: { PATCH: "midia.visibilidade.editar" },
  },
  { caminho: "/api/eventos/[id]/midias/[midiaId]", metodos: { DELETE: "midia.excluir" } },

  /**
   * H-03 e H-09 — a lista de convidados.
   *
   * A ORDEM DESTAS DUAS LINHAS IMPORTA, e este é o único lugar do arquivo em que
   * ela importa: `rotaDeApiQueCasa` compara segmento a segmento e `[convidadoId]`
   * casa com qualquer coisa — inclusive com a palavra `publico`. Declarada
   * depois, a rota pública seria resolvida como a de escrita, e o middleware
   * responderia 405 a um `GET` legítimo do álbum. O Next resolve o estático
   * antes do dinâmico; aqui quem resolve é a ordem.
   */
  { caminho: "/api/eventos/[id]/convidados/publico", metodos: { GET: "convidados.ver.publico" } },
  { caminho: "/api/eventos/[id]/convidados", metodos: { POST: "convidados.editar" } },
  {
    caminho: "/api/eventos/[id]/convidados/[convidadoId]",
    metodos: { PATCH: "convidados.editar", DELETE: "convidados.editar" },
  },

  // H-09 — o nome é rótulo, e ele é da própria participação
  {
    caminho: "/api/eventos/[id]/participacoes/atual",
    metodos: { PATCH: "participacao.renomear" },
  },

  // H-08 — "as minhas fotos"
  { caminho: "/api/eventos/[id]/minhas", metodos: { GET: "album.minhas.ver" } },

  // H-11 — o feed, e a sondagem barata
  { caminho: "/api/eventos/[id]/feed/novidades", metodos: { GET: "feed.ver" } },
  { caminho: "/api/eventos/[id]/feed", metodos: { GET: "feed.ver" } },

  // H-12 — o telão. Leitura pura, com token no cabeçalho.
  { caminho: "/api/eventos/[id]/telao", metodos: { GET: "feed.ver" } },

  // H-04 — o material do QR
  { caminho: "/api/eventos/[id]/qr", metodos: { GET: "evento.materiais.ver" } },

  // H-18 — o aparelho conta o que deu errado com ele
  { caminho: "/api/interno/erro-cliente", metodos: { POST: "interno.erro" }, publica: true },
];

export type Tela = {
  caminho: string;
  superficie: Superficie;
  /**
   * Segmentos do caminho que NÃO identificam ninguém e podem chegar legíveis ao
   * GA4 (`lib/analytics-privacidade.ts`). Tudo que não estiver aqui é mascarado
   * — inclusive rota que ainda não existe (RN-24, decisão P14).
   */
  segmentosPublicos: string[];
};

export const TELAS: Tela[] = [
  { caminho: "/", superficie: "convidado", segmentosPublicos: [] },
  { caminho: "/e/[slug]", superficie: "convidado", segmentosPublicos: [] },
  { caminho: "/e/[slug]/album", superficie: "convidado", segmentosPublicos: ["album"] },
  {
    caminho: "/e/[slug]/album/minhas",
    superficie: "convidado",
    // `minhas` é palavra de superfície, não de gente: ela diz de qual tela é o
    // `page_view`, e "as minhas fotos" é a mesma tela para todo mundo. O que
    // NUNCA entra aqui é o rótulo do convidado — nem no caminho, nem no título.
    segmentosPublicos: ["album", "minhas"],
  },
  { caminho: "/entrar/[token]", superficie: "casal", segmentosPublicos: ["entrar"] },
  /**
   * O telão. O `[token]` é mascarado como qualquer outro — ele é credencial ao
   * portador, e o GA4 não preenche o passado.
   *
   * `surface = telao` é o que faz o filtro de dados do GA4 excluir esta tela de
   * todo relatório (`metricas.md` §13.8). Sem ele, o computador que fica seis
   * horas com a página aberta domina a contagem de sessões e contamina toda
   * média do casamento.
   */
  { caminho: "/telao/[token]", superficie: "telao", segmentosPublicos: ["telao"] },
  { caminho: "/painel/[eventoId]/dia", superficie: "casal", segmentosPublicos: ["painel", "dia"] },
  {
    caminho: "/painel/[eventoId]/convidados",
    superficie: "casal",
    segmentosPublicos: ["painel", "convidados"],
  },
  {
    caminho: "/painel/[eventoId]/materiais",
    superficie: "casal",
    segmentosPublicos: ["painel", "materiais"],
  },
];

/**
 * O caminho de uma requisição → a rota declarada.
 *
 * Comparação segmento a segmento, com `[param]` casando qualquer coisa que não
 * seja vazio. É de propósito mais burro que um roteador: ele precisa rodar no
 * middleware, no runtime de borda, e uma expressão regular montada em tempo de
 * execução a cada requisição é o tipo de coisa que fica cara sem ninguém medir.
 */
export function rotaDeApiQueCasa(caminho: string): RotaDeApi | null {
  const partes = caminho.split("/").filter(Boolean);
  for (const rota of ROTAS_DE_API) {
    const molde = rota.caminho.split("/").filter(Boolean);
    if (molde.length !== partes.length) continue;
    let casa = true;
    for (let i = 0; i < molde.length; i++) {
      const esperado = molde[i];
      if (esperado.startsWith("[")) {
        if (partes[i] === "") casa = false;
      } else if (esperado !== partes[i]) {
        casa = false;
      }
      if (!casa) break;
    }
    if (casa) return rota;
  }
  return null;
}

/**
 * Palavras declaradas públicas na Fatia 0, antes de as telas delas existirem.
 *
 * Elas ficam separadas de propósito: `TELAS` descreve o que EXISTE (e a catraca
 * compara com os arquivos), enquanto estas são vocabulário de superfície já
 * declarado — `feed`, `telao` e `convidado` viram caminho na F1.3 e na F1.4. A
 * lista existe para que a decisão de "esta palavra não nomeia ninguém" continue
 * escrita num lugar só, e não para abrir exceção: uma palavra nova aqui é uma
 * linha num commit que alguém lê, que é exatamente o ponto da decisão P14.
 */
export const SEGMENTOS_HERDADOS = ["feed", "telao", "convidado"] as const;

/**
 * Todos os segmentos declarados públicos, para a máscara do GA4.
 *
 * O QUE NÃO ESTÁ AQUI É MASCARADO — inclusive rota que ainda não existe (RN-24,
 * decisão P14). Uma lista de PROIBIDOS protegeria o que já se conhece e
 * deixaria passar tudo que for criado depois, que é justamente quando ninguém
 * está olhando. E o GA4 não preenche o passado: identificador que vazou hoje não
 * se limpa amanhã.
 */
export function segmentosPublicos(): Set<string> {
  const conjunto = new Set<string>(SEGMENTOS_HERDADOS);
  for (const tela of TELAS) for (const s of tela.segmentosPublicos) conjunto.add(s);
  return conjunto;
}

/**
 * A superfície desta tela, para o `page_view`.
 *
 * O padrão é `convidado`, e não é preguiça: uma tela nova que ninguém declarou
 * é, quase sempre, do convidado — e classificar errado para `telao` seria pior,
 * porque o GA4 exclui `surface = telao` de todo relatório (`metricas.md` §13.8)
 * e a tela sumiria da medição sem nenhum erro aparecer.
 */
export function superficieDoCaminho(caminho: string): Superficie {
  const partes = caminho.split("/").filter(Boolean);
  if (partes[0] === "painel" || partes[0] === "entrar") return "casal";
  if (partes[0] === "telao") return "telao";
  return "convidado";
}
