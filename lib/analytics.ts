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
};

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
export function configurarAnalytics(measurementId: string, weddingId: string): void {
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
