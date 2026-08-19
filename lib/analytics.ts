"use client";

import {
  caminhoMascarado,
  localizacaoMascarada,
  referenciaMascarada,
} from "@/lib/analytics-privacidade";

/**
 * GA4 — o único lugar do produto que fala com o `gtag`.
 *
 * POR QUE UM HELPER TIPADO E NÃO `gtag()` espalhado: nome de evento no GA4
 * diferencia maiúscula e não tem validação nenhuma do lado de lá.
 * `recomendation_opened` (com um M) é um evento novo, válido, que simplesmente
 * some no relatório — e o GA4 **não preenche o passado**, então o erro é
 * irreversível. Com a união abaixo, um nome inexistente é erro de `tsc`, que é
 * a única verificação que roda antes de o convidado abrir a página.
 *
 * O SEGUNDO MOTIVO, que chegou depois e é mais caro: **é aqui que a URL é
 * mascarada.** Um `gtag()` escrito em qualquer outro arquivo manda a URL real,
 * com o nome do casal, sem ninguém notar. `test/analytics-gtag-unico.test.ts`
 * quebra o CI se aparecer um.
 *
 * O DICIONÁRIO vive em `docs/analytics.md` e é a fonte da verdade em linguagem
 * de negócio. Evento que não está lá não nasce aqui.
 *
 * NENHUMA PII. O convidado desta fatia não tem conta, não tem nome no sistema e
 * não é identificado. O único identificador enviado é `wedding_id`, que é o uuid
 * do evento — dado de inquilino, não de pessoa.
 */

/**
 * Todo evento carrega o `wedding_id`, e não é só convenção de relatório: é dele
 * que sai o caminho mascarado. Sem o id opaco não há com o que substituir o
 * slug, e o mascaramento não teria como acontecer.
 */
type ParametrosBase = { wedding_id: string };

/** Um evento por chave, com os parâmetros que ele aceita. Nada além. */
export type EventosDeAnalytics = {
  /** Convidado abriu o mapa da região num app de mapa. */
  map_opened: {
    wedding_id: string;
    /** `regiao` = área aproximada; `exato` = endereço divulgado. */
    map_precision: "regiao" | "exato";
  };
  /** Convidado tocou numa indicação de hospedagem ou dica. */
  recommendation_opened: {
    wedding_id: string;
    recommendation_kind: "hospedagem" | "dica";
    /** Posição na lista, começando em 1 — mostra se o rodapé da lista é lido. */
    recommendation_position: number;
  };

  /* ---------------- v1.0 · V-11 — o site vai ao ar ---------------- */

  /**
   * O site do casal ficou acessível num link (`metricas.md` §6.1).
   *
   * **SÓ NA TRANSIÇÃO DE `false` PARA `true`, E NUNCA A CADA SALVAMENTO.** Quem
   * decide isso não é a tela: é a mesma instrução SQL que grava a coluna, que
   * devolve `mudou` (ver `lib/publicacao.ts`). Sob toque duplo num celular com
   * rede lenta — que é a condição em que este botão é apertado — dois `PATCH`
   * chegam, e só o primeiro encontra o valor diferente.
   *
   * A trava mora no banco de propósito. Uma trava no cliente (`if (!publicado)`)
   * parece resolver e não resolve: os dois toques leem o mesmo estado de React
   * antes de qualquer resposta chegar. E o GA4 **não desconta evento duplicado**
   * — o número de sites publicados é o primeiro degrau da árvore de aquisição, e
   * dobrá-lo é irreversível.
   *
   * Não carrega mais nada além do `wedding_id`. Nem slug, nem domínio, nem
   * quantas seções o site tem: as duas primeiras são o nome do casal escrito de
   * outro jeito, e a terceira responde a uma pergunta que ninguém fez.
   */
  site_published: {
    wedding_id: string;
  };

  /* ---------------- Fatia 1 · F1.2 — o envio ---------------- */

  /**
   * Uma ou mais fotos entraram na fila local.
   *
   * **MELHOR ESFORÇO, E NUNCA DENOMINADOR** (`metricas.md` §13.4): se o aparelho
   * estiver sem rede neste instante — que é o caso que este produto existe para
   * atender —, o evento se perde e não volta. Quem quiser saber quantos envios
   * começaram consulta a tabela `midias` no estado `intencao`. Usar isto como
   * denominador de perda produziria o número mais otimista possível justamente
   * na noite em que ele estivesse errado.
   */
  media_upload_started: {
    wedding_id: string;
    media_count: number;
    media_visibility: Visibilidade;
    /** Booleano vai como string: o GA4 não tem tipo booleano. */
    enqueued_offline: "true" | "false";
  };

  /**
   * O servidor confirmou UMA FAIXA de uma foto.
   *
   * `upload_lane` não é detalhe: sem ele cada foto conta duas vezes, e a
   * ativação do convidado — mediana de segundos até a **prévia** — passa a
   * misturar 8 segundos com 107. Dispara **uma vez por `client_media_id` e por
   * faixa** (RN-28); a fila local guarda a marca, e uma confirmação repetida do
   * servidor não vira um segundo evento.
   *
   * `queue_age_seconds`, `attempt_count` e `enqueued_offline` viajam aqui porque
   * o sucesso é o único instante em que existe rede garantida. É assim que a
   * história do que aconteceu offline chega ao GA4, que não tem fila.
   */
  media_upload_succeeded: {
    wedding_id: string;
    upload_lane: "previa" | "original";
    media_visibility: Visibilidade;
    media_source: "camera" | "galeria";
    enqueued_offline: "true" | "false";
    queue_age_seconds: number;
    attempt_count: number;
    visibility_changed: "true" | "false";
    /** Só na faixa `previa`. No `original` mediria o uplink, não o produto. */
    seconds_since_scan?: number;
  };

  /**
   * Uma tentativa falhou e a fila vai tentar de novo.
   *
   * **QUATRO VALORES DE `error_kind`, e o quarto decide uma AÇÃO** (`metricas.md`
   * §6.2, corrigida). `rede` é a internet que caiu — a resposta certa é não
   * fazer nada. `portal` é a internet que **mentiu**: o wifi do salão responde
   * HTML com 200, o envio parece completar e a foto não existe. É o único erro
   * que produz perda silenciosa, e o único em que agir é obrigatório (trocar de
   * rede, ou passar para o QR do plano B). Colapsados, o painel recomendaria
   * "não faça nada" no único caso em que agir é obrigatório.
   *
   * **A RESSALVA QUE ESTE ARQUIVO NÃO RESOLVE:** num portal cativo a requisição
   * para o `/g/collect` também é interceptada. O evento que descreve o portal é
   * justamente o que o portal engole — aqui ele é subnotificado por construção.
   * Quando aparecer, já é diagnóstico; quando não aparecer, não prova nada. A
   * contagem que vale é a do Postgres (`eventos_de_erro`), e é dela que o painel
   * do dia lê a linha 4.
   */
  media_upload_retried: {
    wedding_id: string;
    attempt_count: number;
    error_kind: "rede" | "portal" | "servidor" | "arquivo";
  };

  /**
   * O convidado tocou em adicionar foto e o seletor abriu.
   *
   * **É O DEGRAU QUE SEPARA "QUIS" DE "CONSEGUIU"** (`metricas.md` §6.2): sem
   * ele, uma queda entre a chegada e o envio não tem diagnóstico — não se sabe
   * se a pessoa não quis mandar ou se o seletor não abriu no aparelho dela. É o
   * item 9 da ordem de corte, e amarelo é o cenário mais provável.
   */
  media_picker_opened: {
    wedding_id: string;
    media_source: "camera" | "galeria";
  };

  /**
   * O convidado saiu da página com itens na fila.
   *
   * **Subestima sempre**, e está escrito para ninguém tratar como censo: sai por
   * `sendBeacon` no `pagehide`, e o aparelho que está sem rede — de novo, o caso
   * que importa — não manda nada. O número oficial de perda é SQL (RN-14).
   */
  media_upload_abandoned: {
    wedding_id: string;
    pending_count: number;
    oldest_pending_seconds: number;
  };

  /* ---------------- Fatia 1 · F1.3 — a pessoa e a escolha dela ------------ */

  /**
   * O convidado disse quem é. **É o primeiro degrau em que ele deixa de ser
   * anônimo para o produto** (`metricas.md` §6.2).
   *
   * `identification_mode` é o parâmetro que decide se P é confiável: acima de
   * 10% de `avulso`, o denominador está errado e o problema é a lista de
   * convidados, não o fluxo (erro E3 de `metricas.md` §1.2).
   *
   * **O NOME NUNCA VIAJA AQUI** (RN-24, `metricas.md` §8). Nem em parâmetro, nem
   * em título, nem em URL. Rótulo de convidado é PII de **terceiro** — ele nem
   * escolheu estar ali —, e PII no GA4 viola os termos e pode zerar a
   * propriedade. O que sai é o modo, que é uma de três palavras fechadas.
   */
  guest_identified: {
    wedding_id: string;
    identification_mode: "lista" | "avulso" | "retomado";
  };

  /**
   * O convidado **mexeu** no seletor de visibilidade, saindo do valor com que a
   * foto nasceu.
   *
   * É ESTE EVENTO, E NÃO A DISTRIBUIÇÃO, QUE CARREGA SINAL DE DEMANDA
   * (`metricas.md` §6, hipótese S1). A distribuição diz o que as pessoas
   * apertaram; este diz que alguém voltou e decidiu de novo — que é a única
   * evidência de que a escolha de visibilidade importa para o convidado.
   *
   * **Gatilho escrito:** abaixo de 10% de mídias com o seletor mexido, a escolha
   * de visibilidade sai do posicionamento.
   */
  media_visibility_changed: {
    wedding_id: string;
    media_visibility_from: Visibilidade;
    /** O valor NOVO. */
    media_visibility: Visibilidade;
  };

  /**
   * Alguém abriu o feed do casamento ou o próprio álbum.
   *
   * `days_since_event` **pode ser negativo** — a véspera é −1 — e é assim que a
   * permanência (S2) é medida sem um segundo evento: "voltou depois de 30 dias"
   * é este evento com `days_since_event >= 30` (`metricas.md` §6, tabela de
   * eventos descartados).
   */
  album_opened: {
    wedding_id: string;
    album_kind: "feed" | "minhas";
    days_since_event: number;
  };

  /* ---------------- Fatia 1 · F1.3 e F1.4 — o casal ---------------------- */

  /**
   * O casal carregou a lista de convidados.
   *
   * Sem ela, a identificação do convidado não tem o modo `lista` e **P não tem
   * denominador** (`metricas.md` §1.1). `guest_count` conta SLOTS, não pessoas:
   * é o denominador da North Star, e somar as duas grandezas produziria um
   * percentual que não significa nada.
   */
  guest_list_imported: {
    wedding_id: string;
    guest_count: number;
    /** `planilha` existe no dicionário e é da Fatia 2. Aqui só há estes dois. */
    import_mode: "colado" | "manual";
  };

  /**
   * O casal baixou o material do QR para imprimir.
   *
   * **É a última coisa que precisa acontecer antes de a festa funcionar**
   * (`metricas.md` §6.3). Se isto não acontecer, a participação será zero por um
   * motivo que não é do produto — e é o único evento desta fatia cuja ausência
   * invalida a leitura de todos os outros.
   */
  qr_material_downloaded: {
    wedding_id: string;
    material_kind: "mesa" | "cartaz" | "telao";
  };

  /**
   * O casal (ou o moderador) aprovou ou recusou uma mídia.
   *
   * `moderation_during_event` É O BLOQUEIO 2 DO VERDE (`metricas.md` §4): se
   * acontecer durante a festa, o resultado verde está anulado — a promessa do
   * produto é que o casal não trabalhe durante o próprio casamento, e moderar é
   * trabalhar. O parâmetro é calculado no SERVIDOR, contra `inicio_festa_em` e
   * `fim_festa_em` (RN-10), e não pelo relógio do aparelho: quem modera às 23h
   * pode estar num computador com a hora errada, e a janela da festa é a
   * definição que decide um veredito.
   *
   * **Um evento por decisão em lote, e não por foto.** "Aprovar as 400" é um
   * toque; 400 eventos fariam a contagem de moderações medir o tamanho do lote
   * em vez do número de vezes que alguém precisou agir.
   */
  media_moderated: {
    wedding_id: string;
    moderation_action: "aprovada" | "recusada";
    /** Booleano vai como string: o GA4 não tem tipo booleano. */
    moderation_during_event: "true" | "false";
  };

  /* ---------------- Fatia 1 · F1.7 — o loop ---------------- */

  /**
   * A pergunta do loop APARECEU na tela de alguém que estava no casamento.
   *
   * **SEM ELE, A TAXA DE CLIQUE NÃO TEM DENOMINADOR** (`metricas.md` §6.2): se o
   * alcance for 16 de 150, o número de cliques não diz nada sobre o texto do
   * botão — diz que ninguém chegou nele, e a correção é outra. É este evento que
   * torna visível o furo do `escopo-growth.md` §4.2.
   *
   * Dispara **no máximo uma vez por sessão e por superfície** (`sessionStorage`)
   * e **só depois de 1 segundo visível** (`IntersectionObserver`, §14.10). Sem
   * as duas travas, uma rolagem para cima e para baixo contaria dez alcances
   * para uma pessoa, e o denominador ficaria maior que o número de convidados.
   *
   * **`cta_surface = feed` NÃO OCORRE NA FATIA 1** (H-16, R8). O valor continua
   * no dicionário e simplesmente não é emitido — está escrito aqui para que
   * ninguém o procure no relatório, e para que ninguém acrescente o CTA ao feed
   * depois "porque o dicionário permite".
   */
  growth_cta_viewed: {
    wedding_id: string;
    cta_surface: SuperficieDoCta;
  };

  /** O convidado tocou na pergunta do loop. É a suposição S6. */
  growth_cta_clicked: {
    wedding_id: string;
    cta_surface: SuperficieDoCta;
  };

  /**
   * O convidado deixou contato, com permissão explícita.
   *
   * **O WHATSAPP NÃO ESTÁ AQUI, E NUNCA ESTARÁ** (RN-24): ele vive na tabela
   * `leads`, com o texto da permissão e a data. Para o GA4 vão a bandeira e o
   * mês — `2027-04`, jamais "casamento da Júlia em abril".
   *
   * `has_date = true` é o indicador que substitui o de 90 dias (`metricas.md`
   * §4.1): sem ele, o loop só teria a leitura de conversão, que **lê zero por
   * construção** enquanto a janela de 18 meses estiver correndo.
   *
   * `expected_month` é validado contra `^\d{4}-\d{2}$` **antes de sair**, e o
   * tipo abaixo é uma união de literais de padrão — texto livre digitado por
   * usuário não chega a uma dimensão do GA4 (§13.9).
   */
  growth_lead_captured: {
    wedding_id: string;
    cta_surface: SuperficieDoCta;
    has_date: "true" | "false";
    /** `AAAA-MM`, ou vazio. Nunca outra coisa — ver `mesParaOGa4`. */
    expected_month: string;
  };
};

/**
 * As quatro superfícies do CTA (`metricas.md` §7.1).
 *
 * `feed` e `telao` existem no dicionário e **não são emitidos na Fatia 1**: o
 * `po` arbitrou (R8) que a linha de aquisição não entra no feed em forma
 * nenhuma, e no telão entra marca, não pergunta. Os valores ficam porque o
 * dicionário é o contrato; a ausência de emissão está escrita na H-16 e no
 * `docs/analytics.md`.
 */
export type SuperficieDoCta = "confirmacao_envio" | "album" | "feed" | "telao";

/**
 * `AAAA-MM`, ou string vazia. **A última barreira antes do GA4.**
 *
 * `metricas.md` §13.9 pede um teste que falhe se qualquer parâmetro do
 * dicionário receber texto livre digitado por usuário. Esta função é o lado do
 * código dessa regra: o campo de mês é um seletor, mas o valor atravessa estado
 * de React, `localStorage` e uma resposta de API antes de chegar aqui — e
 * qualquer um dos três pode ter sido adulterado no aparelho. Dimensão do GA4 com
 * lixo não se limpa: o passado não se preenche e o limite de 50 dimensões não
 * perdoa uma cheia de texto livre.
 */
export function mesParaOGa4(valor: unknown): string {
  return typeof valor === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : "";
}

/**
 * DOIS VALORES, NÃO TRÊS (RN-03).
 *
 * `metricas.md` §6 registrava `ambos` como valor possível de `media_visibility`.
 * Ele morreu na §3.1 V1 do PRD: "ambos" não é estado, porque o feed já inclui o
 * casal. O tipo espelha o `CHECK` do Postgres de propósito — `metricas.md` §5.3
 * exige que o valor do banco e o valor da dimensão do GA4 sejam a mesma palavra,
 * e uma dimensão registrada com valor morto não se limpa depois.
 */
export type Visibilidade = "feed" | "noivos";

export type NomeDeEvento = keyof EventosDeAnalytics;

/**
 * Evento novo sem `wedding_id` não compila. A verificação é de tipo porque a
 * alternativa — lembrar — já falhou uma vez neste arquivo.
 */
type TodosComWeddingId = EventosDeAnalytics extends Record<
  NomeDeEvento,
  ParametrosBase
>
  ? true
  : never;
const _confereWeddingId: TodosComWeddingId = true;

/** As origens do QR, por material impresso (`metricas.md` §15.1). */
export type OrigemDoQr = "mesa" | "telao" | "convite" | "cartao" | "direto";

const ORIGENS: OrigemDoQr[] = ["mesa", "telao", "convite", "cartao", "direto"];

/**
 * `?o=mesa` → `mesa`. Qualquer outra coisa → `direto`.
 *
 * LISTA FECHADA, e não "o que vier na URL": o parâmetro é público e qualquer um
 * pode escrever `?o=<o que quiser>` num link colado em grupo. Texto livre virando
 * dimensão do GA4 é dado envenenado que não se limpa — e o limite de 50
 * dimensões personalizadas não perdoa uma cheia de lixo.
 */
export function origemDoQr(valor: string | null | undefined): OrigemDoQr {
  const achado = ORIGENS.find(o => o === valor);
  return achado ?? "direto";
}

export type ContextoDeMedicao = {
  /** `convidado` | `casal` | `telao`. O filtro do GA4 exclui o telão. */
  superficie?: "convidado" | "casal" | "telao";
  qrSource?: OrigemDoQr;
  /** Pseudônimo `g:<id>` ou `c:<id>`. Nunca nome, e-mail ou telefone. */
  usuario?: string | null;
};

type ComandoGtag = "event" | "config" | "js" | "consent";

type Gtag = (
  comando: ComandoGtag,
  alvo: string | Date,
  parametros?: Record<string, unknown>
) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    dataLayer?: unknown[];
    /** Marca de que o `config` já rodou nesta página. Ver `configurarAnalytics`. */
    __ga4Configurado?: boolean;
  }
}

/**
 * Os três campos de página, sempre mascarados e **sempre presentes**.
 *
 * A ARMADILHA: omitir qualquer um deles não é neutro. Sem `page_location` o
 * gtag lê `document.location` sozinho; sem `page_title`, `document.title`; sem
 * `page_referrer`, `document.referrer`. Os três originais carregam o nome do
 * casal — o título carrega o nome completo e a data. Um campo esquecido aqui
 * não vira "campo ausente no relatório", vira o vazamento de volta.
 *
 * Por isso `page_referrer` vai mesmo valendo string vazia.
 */
function camposDePagina(weddingId: string): Record<string, string> {
  const href = window.location.href;
  return {
    page_location: localizacaoMascarada(href, weddingId),
    // O caminho mascarado é um título melhor que uma constante: distingue as
    // superfícies no relatório e não nomeia ninguém.
    page_title: caminhoMascarado(href, weddingId),
    page_referrer: referenciaMascarada(document.referrer, href, weddingId),
  };
}

/**
 * A fila do gtag, com `arguments` e não com rest.
 *
 * O `gtag.js` lê o `dataLayer` esperando objetos `Arguments`. Um array comum
 * entra na fila e é ignorado em silêncio — sem erro, sem aviso, e com o
 * relatório vazio. É o snippet oficial do Google escrito em TypeScript, e a
 * forma dele é a parte que importa.
 */
function criarFila(): Gtag {
  function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  }
  return gtag as unknown as Gtag;
}

/**
 * Sobe o GA4 nesta página: consentimento, depois configuração.
 *
 * MODO DE CONSENTIMENTO NEGADO POR PADRÃO, E SEM BANNER. Decisão do dono, e ela
 * tem duas metades. A primeira: `analytics_storage: 'denied'` faz o hit virar
 * ping sem cookie — a costura de sessão degrada e o funil do GA4 fica
 * aproximado. Isso custa **diagnóstico**, não veredito: o número que decide
 * este projeto sai de uma consulta ao Postgres, não daqui. A segunda: **sem
 * banner**, porque pedir consentimento para uma coleta de que não precisamos
 * seria trocar o passo a mais no fluxo do convidado por nada. Escolher o modo
 * mais privativo por padrão vale mais que perguntar.
 *
 * O `default` tem que ser empilhado **antes** do `config`, senão o primeiro
 * `page_view` sai sob o padrão do gtag, que é `granted`.
 *
 * `__ga4Configurado` existe porque um segundo `config` para o mesmo id
 * re-dispara o `page_view` e dobra a contagem. O efeito do React roda duas
 * vezes em desenvolvimento, e sem esta marca a abertura de página valeria dois.
 */
export function configurarAnalytics(
  measurementId: string,
  weddingId: string,
  contexto: ContextoDeMedicao = {}
): void {
  if (typeof window === "undefined") return;
  if (window.__ga4Configurado) return;
  window.__ga4Configurado = true;

  window.dataLayer = window.dataLayer ?? [];
  // Se o `gtag.js` já carregou, quem manda é a função dele: sobrescrevê-la aqui
  // trocaria o processador real por uma fila que ninguém mais lê.
  window.gtag = window.gtag ?? criarFila();

  const gtag = window.gtag;

  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });

  gtag("js", new Date());

  gtag("config", measurementId, {
    ...camposDePagina(weddingId),
    wedding_id: weddingId,
    // As duas dimensões novas do `page_view` (`metricas.md` §6.1). `surface`
    // existe para o filtro que EXCLUI o telão de todo relatório: sem ele, o
    // computador que fica seis horas com a página aberta domina a contagem de
    // sessões e contamina toda média do casamento.
    surface: contexto.superficie ?? "convidado",
    qr_source: contexto.qrSource ?? "direto",
    // Pseudônimo (`g:` / `c:`), resolvido em lib/sessao.ts. NUNCA nome, e-mail
    // ou telefone: PII no GA4 viola os termos e pode zerar a propriedade.
    ...(contexto.usuario ? { user_id: contexto.usuario } : {}),
    // Sem sinais do Google e sem personalização de anúncio: este produto não
    // anuncia, e o que não se liga não precisa ser desligado depois.
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
}

/**
 * Envia um evento ao GA4.
 *
 * Silenciosa quando o GA4 não está carregado — sem id de medição configurado,
 * em desenvolvimento, ou com o script bloqueado por extensão. Uma página de
 * casamento não pode quebrar porque a medição não subiu: o convidado veio ver a
 * data, não gerar dado.
 *
 * OS CAMPOS DE PÁGINA VÃO DE NOVO EM CADA EVENTO, e não é redundância inútil: o
 * `config` já os fixa para os eventos seguintes, mas essa herança é
 * comportamento do gtag, não contrato — e é invisível. Repetir custa três
 * campos por hit e faz cada evento ser verificável sozinho, que é o que
 * `test/analytics-sem-pii.test.tsx` observa.
 */
export function enviarEvento<N extends NomeDeEvento>(
  nome: N,
  parametros: EventosDeAnalytics[N]
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", nome, {
    ...parametros,
    ...camposDePagina(parametros.wedding_id),
  });
}
