/**
 * TEXTO DO CASAL → PARÁGRAFOS (v1.0, RV-07).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **O CONTEÚDO DO CASAL É TEXTO PURO, e parágrafo é linha em branco.** Não
 * existe texto formatado neste produto, e a ausência é decisão escrita
 * (prd-v1 §2.2): editor de texto rico é sanitização de HTML, XSS armazenado e um
 * `dangerouslySetInnerHTML` numa página que 150 pessoas abrem.
 *
 * Colar `<b>oi</b>` do WhatsApp mostra `<b>oi</b>` na tela, e não negrito — o
 * React escapa sozinho, e é exatamente por isso que a saída daqui é um **array
 * de strings** e não uma string com `<br>`. Uma função que devolvesse HTML
 * obrigaria quem a usa a injetá-lo, e aí a decisão estaria desfeita.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function paragrafos(texto: string): string[] {
  return texto
    .replace(/\r\n/g, "\n")
    // Duas ou mais quebras separam parágrafos. Uma quebra só continua o mesmo
    // parágrafo — é como se digita num campo de texto sem pensar em marcação, e
    // transformar cada Enter em parágrafo produziria um texto todo picado.
    .split(/\n{2,}/)
    .map(bloco => bloco.trim())
    .filter(bloco => bloco !== "");
}
