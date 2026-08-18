"use client";

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
 * O DICIONÁRIO vive em `docs/analytics.md` e é a fonte da verdade em linguagem
 * de negócio. Evento que não está lá não nasce aqui.
 *
 * NENHUMA PII. O convidado desta fatia não tem conta, não tem nome no sistema e
 * não é identificado. O único identificador enviado é `wedding_id`, que é o uuid
 * do evento — dado de inquilino, não de pessoa.
 */

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

type Gtag = (
  comando: "event" | "config" | "js",
  alvo: string,
  parametros?: Record<string, unknown>
) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    dataLayer?: unknown[];
  }
}

/**
 * Envia um evento ao GA4.
 *
 * Silenciosa quando o GA4 não está carregado — sem id de medição configurado,
 * em desenvolvimento, ou com o script bloqueado por extensão. Uma página de
 * casamento não pode quebrar porque a medição não subiu: o convidado veio ver a
 * data, não gerar dado.
 */
export function enviarEvento<N extends NomeDeEvento>(
  nome: N,
  parametros: EventosDeAnalytics[N]
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", nome, parametros);
}
