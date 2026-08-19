import type { Sessao } from "@/lib/sessao";

/**
 * AUTORIZAÇÃO É DADO, NÃO `if` ESPALHADO (stack.md §3, PRD §7).
 *
 * A tabela da §7 do PRD está transcrita abaixo, inteira, incluindo as linhas
 * cujas rotas ainda não existem. Isso é deliberado: a matriz é o contrato de
 * quem pode o quê no produto, e uma matriz que só cresce junto com as rotas
 * obriga cada história nova a redecidir uma permissão que já estava decidida —
 * que é como nascem as três assimetrias sendo quebradas sem ninguém notar.
 *
 * O QUE ESTA TABELA IMPEDE, e um `if` por rota não impediria:
 *
 * 1. `midia.visibilidade.editar` não existe para ninguém além de quem enviou.
 *    Nem para o casal, nem para o dono. **E isso nem é a defesa principal**: a
 *    defesa é estrutural (PRD §3.2, P2) — o casal escreve `midias.aprovacao`, e
 *    a coluna `visibilidade` tem um único caminho de escrita no código inteiro.
 *    A matriz é a segunda tranca, e ela existe porque a primeira depende de
 *    ninguém escrever um `update midias set visibilidade` novo daqui a um ano.
 * 2. O moderador **modera e não exclui**. Ele foi designado para decidir o que
 *    aparece na parede, não o que o casal guarda.
 * 3. O telão é **leitura pura**. Não cria participação, não envia, não modera.
 *
 * `test/autorizacao-matriz.test.ts` varre `app/api/**` e falha se uma rota
 * decidir perfil por conta própria, ou se uma rota nova não aparecer aqui.
 */

export type Perfil =
  | "anonimo"
  | "convidado"
  | "casal"
  | "moderador"
  | "telao"
  | "dono"
  | "cron";

/**
 * Um "sim" da tabela nem sempre é o mesmo sim. O alcance é o que diferencia
 * "vê as fotos" de "vê **as próprias** fotos" — e essa diferença, escrita como
 * booleano, some no primeiro `if (pode(...))` e vira vazamento.
 */
export type Alcance =
  /** Não pode. É o padrão de tudo que não está escrito. */
  | "nao"
  /** Pode, sobre qualquer recurso do evento. */
  | "todas"
  /** Pode, só sobre o que a própria participação criou. */
  | "proprias"
  /** Pode, sobre um recorte que o próprio portador delimita (o telão). */
  | "recorte_proprio"
  /** Pode, e ainda depende de a janela de envio estar aberta. */
  | "dentro_da_janela"
  /** Não é sessão: é segredo de cabeçalho (cron). */
  | "segredo";

export type Acao =
  | "feed.ver"
  | "album.minhas.ver"
  | "midia.enviar"
  | "midia.visibilidade.editar"
  | "midia.excluir"
  | "midia.ver.todas"
  | "midia.moderar"
  | "midia.baixar"
  | "convidados.editar"
  | "convidados.ver.publico"
  | "evento.configurar"
  | "evento.materiais.ver"
  | "participacao.renomear"
  | "lead.criar"
  | "lead.ver"
  | "medicao.ver"
  | "interno.erro"
  | "interno.cron";

type Linha = Partial<Record<Perfil, Alcance>>;

/**
 * A §7 do PRD, transcrita. O que não está escrito é `nao` — e é por isso que
 * `anonimo` não aparece em nenhuma linha: ele não pode nada, e escrever
 * dezoito `anonimo: "nao"` só daria a alguém a chance de escrever um `"todas"`
 * no meio sem chamar atenção.
 */
export const MATRIZ: Record<Acao, Linha> = {
  "feed.ver": {
    convidado: "todas",
    casal: "todas",
    moderador: "todas",
    telao: "recorte_proprio",
    dono: "todas",
  },
  // "só as próprias" no sentido forte: não existe álbum de outra pessoa.
  "album.minhas.ver": { convidado: "proprias" },

  "midia.enviar": {
    convidado: "dentro_da_janela",
    casal: "dentro_da_janela",
    moderador: "dentro_da_janela",
    dono: "dentro_da_janela",
  },

  // NUNCA para o casal, para o moderador e para o dono. Ver o comentário do
  // topo: aqui a ausência é a regra, e ela é a decisão de modelagem mais
  // importante do PRD.
  "midia.visibilidade.editar": { convidado: "proprias" },

  "midia.excluir": { convidado: "proprias", casal: "todas", dono: "todas" },
  "midia.ver.todas": { casal: "todas", moderador: "todas", dono: "todas" },
  "midia.moderar": { casal: "todas", moderador: "todas", dono: "todas" },
  "midia.baixar": { convidado: "proprias", casal: "todas", dono: "todas" },

  "convidados.editar": { casal: "todas", dono: "todas" },
  "convidados.ver.publico": {
    convidado: "todas",
    casal: "todas",
    moderador: "todas",
    dono: "todas",
  },

  "evento.configurar": { casal: "todas", dono: "todas" },
  "evento.materiais.ver": { casal: "todas", moderador: "todas", dono: "todas" },

  "participacao.renomear": { convidado: "proprias", casal: "todas", dono: "todas" },

  "lead.criar": { convidado: "todas" },
  // Nem o casal. A consulta do dono acontece fora da API (PRD §7).
  "lead.ver": {},

  "medicao.ver": { dono: "todas" },

  // Só escrita, e só de quem está participando: é o relato de falha do aparelho.
  "interno.erro": { convidado: "proprias" },
  "interno.cron": { cron: "segredo" },
};

/**
 * De qual coluna da tabela esta sessão é.
 *
 * `dono` é uma COLUNA e não um tipo de acesso: no casamento cobaia o dono também
 * é o casal, e `evento_acessos.dono` é um booleano justamente por isso (PRD
 * §5.2). O que ele ganha é a linha `medicao.ver`; o que ele **não** ganha está
 * escrito na tabela, e a interface mostra o selo "visão do dono" para ninguém
 * confundir o que está vendo com o que o casal vê.
 */
export function perfilDaSessao(sessao: Sessao): Perfil {
  switch (sessao.tipo) {
    case "convidado":
      return sessao.participacao.papel === "casal" ? "casal" : "convidado";
    case "casal":
      return sessao.acesso.dono ? "dono" : "casal";
    case "moderador":
      return "moderador";
    case "telao":
      return "telao";
    case "cron":
      return "cron";
    default:
      return "anonimo";
  }
}

/**
 * O alcance desta sessão nesta ação. `"nao"` é a resposta padrão.
 *
 * A rota decide o status a partir daqui: `"nao"` é **403**, e o recurso de outro
 * evento é **404** (nunca 403 — 403 confirmaria que o recurso existe, e a lista
 * de ids de outro casamento não é informação que este produto deva dar).
 */
export function pode(sessao: Sessao, acao: Acao): Alcance {
  return MATRIZ[acao][perfilDaSessao(sessao)] ?? "nao";
}

/** Açúcar honesto: `pode(...) !== "nao"`. Não esconde o alcance, só o testa. */
export function podeAlgo(sessao: Sessao, acao: Acao): boolean {
  return pode(sessao, acao) !== "nao";
}
