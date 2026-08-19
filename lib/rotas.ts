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

  /**
   * H-22 — o link guardado vira sessão. `publica: true` como as outras duas de
   * sessão: quem chega aqui **ainda não tem** sessão, e a credencial é o token
   * do corpo. A rota confere o formato antes de qualquer consulta e tem limite
   * de taxa por origem.
   */
  { caminho: "/api/sessao/retomar", metodos: { POST: "participacao.recuperar" }, publica: true },

  /**
   * H-02 — o casal configura o dia. **`dia.configurar`, e não `evento.configurar`**
   * desde a v1.0 (V-01).
   *
   * As duas eram a mesma ação. Elas não podiam continuar sendo: `evento.configurar`
   * é o que as duas rotas de sessão logo acima declaram, e o conjunto do álbum
   * precisa desligar a configuração do DIA sem desligar o LOGIN. Com a ação
   * compartilhada, ou o casal não entra, ou a tela do dia continua aberta —
   * não há terceira saída.
   *
   * É um renomeio de três linhas, e ele faz a matriz dizer a verdade: configurar
   * o dia da festa não é a mesma coisa que provar que esta sessão é o casal.
   */
  { caminho: "/api/eventos/[id]/dia", metodos: { PATCH: "dia.configurar" } },
  { caminho: "/api/eventos/[id]/acessos", metodos: { POST: "dia.configurar" } },
  {
    caminho: "/api/eventos/[id]/acessos/[acessoId]",
    metodos: { DELETE: "dia.configurar" },
  },

  // H-06 — a intenção antes dos bytes, e a confirmação por faixa
  { caminho: "/api/eventos/[id]/midias/intencao", metodos: { POST: "midia.enviar" } },

  /**
   * H-13 — moderar em lote. **Antes de `[midiaId]`**, e pelo mesmo motivo da
   * `intencao`: os dois caminhos têm cinco segmentos, e `[midiaId]` casa com a
   * palavra `moderacao`. Declarada depois, o middleware exigiria o método da
   * outra rota e responderia 405 a um `POST` legítimo de "Aprovar as 400".
   */
  {
    caminho: "/api/eventos/[id]/midias/moderacao",
    // `GET` é a fila (a lista do que espera), `POST` é a decisão. Mesma ação de
    // permissão porque é o mesmo recurso: quem pode aprovar pode ver o que há
    // para aprovar, e quem não pode não tem por que ver a lista.
    metodos: { GET: "midia.moderar", POST: "midia.moderar" },
  },
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

  // H-20 — baixar. Sempre assinada, sempre 15 minutos, sempre por requisição.
  {
    caminho: "/api/eventos/[id]/midias/[midiaId]/download",
    metodos: { GET: "midia.baixar" },
  },

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

  /**
   * H-22 e H-15 — o link guardado e a reconciliação, as duas **da própria**
   * participação. `atual` no caminho em vez de um id não é economia: com id, a
   * rota precisaria conferir que o id é o de quem pergunta, e essa é a
   * verificação que alguém esquece.
   */
  {
    caminho: "/api/eventos/[id]/participacoes/atual/recuperacao",
    metodos: { POST: "participacao.recuperar" },
  },
  {
    caminho: "/api/eventos/[id]/participacoes/atual/reconciliar",
    metodos: { POST: "participacao.reconciliar" },
  },

  // H-23 — o casal renomeia OUTRA participação. A única com id no caminho.
  {
    caminho: "/api/eventos/[id]/participacoes/[participacaoId]/rotulo",
    metodos: { PATCH: "participacao.renomear" },
  },

  // H-08 — "as minhas fotos"
  { caminho: "/api/eventos/[id]/minhas", metodos: { GET: "album.minhas.ver" } },

  // H-14 — o painel do casal: os números honestos e a grade de tudo que chegou
  { caminho: "/api/eventos/[id]/resumo", metodos: { GET: "midia.ver.todas" } },
  { caminho: "/api/eventos/[id]/midias", metodos: { GET: "midia.ver.todas" } },

  // H-19 — os sete números. `medicao.ver` tem uma linha só na matriz: o dono.
  { caminho: "/api/eventos/[id]/medicao", metodos: { GET: "medicao.ver" } },

  // H-16 — o lead. `evento_id_origem` vem daqui, do `[id]`, e nunca do corpo.
  { caminho: "/api/eventos/[id]/leads", metodos: { POST: "lead.criar" } },

  // H-11 — o feed, e a sondagem barata
  { caminho: "/api/eventos/[id]/feed/novidades", metodos: { GET: "feed.ver" } },
  { caminho: "/api/eventos/[id]/feed", metodos: { GET: "feed.ver" } },

  // H-12 — o telão. Leitura pura, com token no cabeçalho.
  { caminho: "/api/eventos/[id]/telao", metodos: { GET: "feed.ver" } },

  // H-04 — o material do QR
  { caminho: "/api/eventos/[id]/qr", metodos: { GET: "evento.materiais.ver" } },

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * v1.0 — O SITE E O PAINEL QUE O EDITA.
   *
   * **NÃO HÁ ROTA `GET` NESTE BLOCO**, e a ausência é decisão: as telas do painel
   * do site são componentes de SERVIDOR e leem direto de `lib/`, como as sete
   * telas de painel que já existem. Uma rota de leitura só existiria para um
   * cliente que ainda não existe — e rota sem consumidor é superfície a proteger
   * de graça.
   *
   * **A ORDEM AQUI SEGUE A REGRA DO ARQUIVO**: coleção antes de item. Hoje os
   * caminhos de coleção têm seis segmentos e os de item têm sete, então
   * `rotaDeApiQueCasa` não os confunde — mas a regra fica obedecida para o dia em
   * que um caminho novo empatar o número de segmentos, que é quando o defeito
   * aparece (405 num POST legítimo) e ninguém entende por quê.
   * ─────────────────────────────────────────────────────────────────────────
   */
  /**
   * V-11 — publicar e tirar do ar. **`site.publicar`, e não `site.editar`**: é o
   * único ato deste bloco cuja consequência é o endereço passar a responder, e é
   * o primeiro que se restringe quando existir um quarto tipo de acesso.
   */
  { caminho: "/api/eventos/[id]/site/publicacao", metodos: { PATCH: "site.publicar" } },
  { caminho: "/api/eventos/[id]/site/secoes", metodos: { PATCH: "site.editar" } },
  // A capa e o "onde e quando" — as duas escrevem colunas de `eventos`.
  { caminho: "/api/eventos/[id]/site/evento", metodos: { PATCH: "site.editar" } },
  // Coleção antes de item, como manda a regra do arquivo.
  { caminho: "/api/eventos/[id]/site/indicacoes", metodos: { POST: "site.editar" } },
  {
    caminho: "/api/eventos/[id]/site/indicacoes/[indicacaoId]",
    metodos: { PATCH: "site.editar", DELETE: "site.editar" },
  },
  // Uma linha por evento: `PATCH`, e não `POST` — o casal não cria histórias,
  // ele escreve a dele.
  { caminho: "/api/eventos/[id]/site/historia", metodos: { PATCH: "site.editar" } },
  { caminho: "/api/eventos/[id]/site/programacao", metodos: { POST: "site.editar" } },
  {
    caminho: "/api/eventos/[id]/site/programacao/[itemId]",
    metodos: { PATCH: "site.editar", DELETE: "site.editar" },
  },
  { caminho: "/api/eventos/[id]/site/perguntas", metodos: { POST: "site.editar" } },
  {
    caminho: "/api/eventos/[id]/site/perguntas/[perguntaId]",
    metodos: { PATCH: "site.editar", DELETE: "site.editar" },
  },

  /**
   * A GALERIA (v1.0, V-18 e V-19) — as quatro rotas do casal e da foto dele.
   *
   * **`site.editar`, e NENHUMA delas entra em `ACOES_DO_ALBUM`** (RV-23). É o
   * risco mais provável desta emenda, porque a semelhança superficial entre
   * álbum e galeria convida: as duas sobem foto, as duas assinam `PUT`, as duas
   * carimbam depois. O que as separa é que a galeria é **conteúdo do site**,
   * escrito pelo casal — e o site é justamente o que a v1.0 é.
   *
   * **A ORDEM É `PATCH` NA COLEÇÃO, E NÃO NO ITEM** (RV-05): subir uma foto muda
   * a posição de duas, e mover a última para o topo muda a de doze. Um ato do
   * casal, uma requisição. A legenda e a exclusão são de uma foto só, e por isso
   * moram no item.
   *
   * Coleção antes de item, como manda a regra deste arquivo. As três têm número
   * de segmentos diferente e não colidem, mas a ordem fica obedecida para o dia
   * em que um caminho novo empatar — que é quando o defeito aparece (405 num
   * POST legítimo) e ninguém entende por quê.
   */
  {
    caminho: "/api/eventos/[id]/site/galeria",
    metodos: { POST: "site.editar", PATCH: "site.editar" },
  },
  {
    caminho: "/api/eventos/[id]/site/galeria/[fotoId]",
    metodos: { PATCH: "site.editar", DELETE: "site.editar" },
  },
  {
    caminho: "/api/eventos/[id]/site/galeria/[fotoId]/confirmacao",
    metodos: { POST: "site.editar" },
  },

  // H-18 — o aparelho conta o que deu errado com ele
  { caminho: "/api/interno/erro-cliente", metodos: { POST: "interno.erro" }, publica: true },

  /**
   * A ROTA DE SAÚDE. `publica: true` no sentido do middleware (não exige
   * cookie), e **fechada** no sentido que importa: o segredo de cabeçalho é
   * conferido na rota, e sem `CRON_SEGREDO` a resposta é sempre anônima.
   *
   * `GET` e nada mais: ela não escreve, e o agendador da plataforma só chama
   * `GET`. Declarar `POST` aqui abriria um método que nenhum código atende.
   */
  {
    caminho: "/api/interno/saude",
    metodos: { GET: "interno.cron" },
    publica: true,
  },

  /**
   * H-15 — o cron diário. `publica: true` no sentido do middleware (não exige
   * cookie), e **fechada** no sentido que importa: o segredo de cabeçalho é
   * conferido na rota, e sem `CRON_SEGREDO` configurado a resposta é sempre
   * anônima — nunca "passa porque a variável está vazia".
   */
  {
    caminho: "/api/interno/reconciliacao",
    // `GET` porque o agendador da Vercel só chama `GET`; `POST` porque é o que o
    // PRD §6.1 declara e o que um agendador externo usa. Mesmo segredo, mesmo
    // trabalho, e a rotina é idempotente.
    metodos: { GET: "interno.cron", POST: "interno.cron" },
    publica: true,
  },
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
  {
    caminho: "/painel/[eventoId]/midias",
    superficie: "casal",
    segmentosPublicos: ["painel", "midias"],
  },
  {
    caminho: "/painel/[eventoId]/fila",
    superficie: "casal",
    segmentosPublicos: ["painel", "fila"],
  },
  {
    caminho: "/painel/[eventoId]/dia-ao-vivo",
    superficie: "casal",
    segmentosPublicos: ["painel", "dia-ao-vivo"],
  },
  /**
   * H-22 — o link guardado aberto noutro aparelho. O `[token]` é mascarado como
   * qualquer outro: ele é credencial ao portador, e o GA4 não preenche o
   * passado. `r` é palavra de superfície e não nomeia ninguém.
   */
  { caminho: "/r/[token]", superficie: "convidado", segmentosPublicos: ["r"] },

  /**
   * v1.0 — a casa do editor do site (V-02). É para onde o link do e-mail leva.
   *
   * `site` é palavra de superfície e não nomeia ninguém. `[eventoId]` continua
   * mascarado, como em toda tela de painel (RN-24).
   */
  {
    caminho: "/painel/[eventoId]/site",
    superficie: "casal",
    segmentosPublicos: ["painel", "site"],
  },
  /**
   * v1.0 — a prévia (V-10). Ela mora em `/painel/[eventoId]/previa` e **não** em
   * `/painel/[eventoId]/site/previa`: como irmã de `[secao]`, a palavra `previa`
   * casaria com o parâmetro dinâmico, que é a armadilha que este arquivo já
   * documenta duas vezes (`publico` casando com `[convidadoId]`, `moderacao`
   * casando com `[midiaId]`). Evitar a colisão custa uma pasta; lembrar dela
   * custa um 404 em produção.
   *
   * **`previa` ENTRA EM `segmentosPublicos` AQUI, e este é o commit da V-13.**
   * Quando a tela nasceu a palavra ficou de fora de propósito — o caminho ia ao
   * GA4 como `/e/<wedding_id>/painel/_`, que é o lado seguro de errar —, e a
   * decisão foi adiada para o commit em que alguém a lê em vez de recebê-la como
   * efeito colateral de uma tela nova.
   *
   * A palavra entra pela mesma régua de `album`, `minhas` e das oito chaves de
   * seção: ela nomeia **qual tela foi aberta**, e a prévia é a mesma tela para
   * todo casal. O `[eventoId]` continua mascarado (RN-24).
   *
   * **O que ela mede é a ausência, e é justamente por isso que ela precisa ser
   * legível:** a prévia **não emite `page_view`** (V-10) — é do casal, e oito
   * aberturas numa noite contaminariam a medição de um site que ainda não tem um
   * único convidado. Com a palavra mascarada, `/painel/_` juntava a prévia com o
   * que quer que nascesse ao lado dela, e a próxima pessoa a abrir o relatório
   * não teria como distinguir "ninguém abriu a prévia" de "a prévia foi
   * contada como outra coisa".
   */
  {
    caminho: "/painel/[eventoId]/previa",
    superficie: "casal",
    segmentosPublicos: ["painel", "previa"],
  },
  /**
   * O editor de uma seção (V-04 a V-09).
   *
   * **AS OITO CHAVES DE SEÇÃO SÃO PALAVRA DE SUPERFÍCIE** e entram legíveis no
   * GA4: `capa`, `onde` e `indicacoes` dizem qual editor foi aberto, e nenhuma
   * delas nomeia gente. É a mesma régua de `album` e `minhas`. O `[eventoId]`
   * continua mascarado.
   */
  {
    caminho: "/painel/[eventoId]/site/[secao]",
    superficie: "casal",
    segmentosPublicos: [
      "painel",
      "site",
      "capa",
      "onde",
      "programacao",
      "historia",
      "galeria",
      "perguntas",
      "indicacoes",
      "rodape",
    ],
  },
];

/* ------------------------------------------------------------------ *
 * A rota curta, e o risco de verdade dela
 * ------------------------------------------------------------------ */

/**
 * OS SEGMENTOS DE PRIMEIRO NÍVEL QUE **NÃO** SÃO SLUG DE CASAMENTO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA LISTA EXISTE, e por que ela tem um teste que varre `app/`:
 *
 * `casa-nos.app/<slug>` responde **307** para `/e/<slug>/album` (decisão do `po`
 * em 19/08/2026) — é o endereço impresso no cartão de mesa, e ele precisa ser
 * curto. A consequência é que **a raiz do site virou o espaço de nomes dos
 * casamentos**.
 *
 * O risco não é a rota curta: é a próxima pasta criada em `app/`. No dia em que
 * alguém criar `app/precos/`, o casamento com slug `precos` deixa de existir —
 * **em silêncio, e depois de 40 cartões de mesa já impressos**. Não há erro, não
 * há log, e a foto simplesmente não é enviada por ninguém.
 *
 * `test/rota-curta.test.ts` lê o disco e falha se `app/` tiver uma pasta de
 * primeiro nível que não esteja aqui. A lista é a decisão; o teste é o que a
 * segura — regra escrita não segura nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SEGMENTOS_RESERVADOS = ["api", "e", "entrar", "painel", "telao", "r"] as const;

/**
 * Caminhos que a plataforma serve e que nunca chegam ao proxy como slug.
 *
 * Estão listados mesmo assim: o dia em que o `matcher` mudar, esta lista
 * continua sendo a resposta certa — e um `favicon.ico` redirecionado para o
 * álbum de um casamento inexistente é um 404 estranho que ninguém entende.
 */
export const ARQUIVOS_DA_RAIZ = [
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "sw.js",
  "opengraph-image",
  "icon",
  "apple-icon",
] as const;

/**
 * `/<segmento>` é uma rota curta de casamento?
 *
 * **Lista de reservados, e não lista de permitidos** — ao contrário da máscara
 * do GA4, e a inversão é deliberada: aqui o conjunto que cresce é o dos
 * casamentos, e ele não é conhecido em tempo de compilação. O que é conhecido é
 * o que o produto ocupa, e é isso que a lista guarda.
 *
 * O formato é conferido antes, por quem chama: o que não parece slug não
 * redireciona e continua respondendo o 404 do Next.
 */
export function ehRotaCurta(primeiroSegmento: string): boolean {
  if (!primeiroSegmento) return false;
  if ((SEGMENTOS_RESERVADOS as readonly string[]).includes(primeiroSegmento)) return false;
  if ((ARQUIVOS_DA_RAIZ as readonly string[]).includes(primeiroSegmento)) return false;
  if (primeiroSegmento.startsWith("_") || primeiroSegmento.startsWith(".")) return false;
  return true;
}

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
