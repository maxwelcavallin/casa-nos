import { instanteDoEvento } from "@/lib/datas";
import type { Evento } from "@/lib/eventos";

/**
 * Quantos dias se passaram desde o casamento. **Negativo antes dele.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELE VAI NO `album_opened`, e é o parâmetro que responde duas perguntas sem um
 * segundo evento (`metricas.md` §6): "o convidado voltou depois da festa?"
 * (`>= 1`) e "o casal voltou depois de 30 dias?" (`>= 30`). Um evento
 * `album_reopened` separado dobraria o dicionário para responder o mesmo.
 *
 * A CONTA É DE CALENDÁRIO NO FUSO DO EVENTO, e é aqui que ela precisa estar
 * certa: `Math.floor((agora - dataEvento) / 86400000)` sobre um `Date` criado a
 * partir da string daria meia-noite em **UTC**, que é 21h do dia anterior aqui —
 * e todo `days_since_event` sairia um dia adiantado entre 21h e meia-noite, que
 * é exatamente o horário da festa.
 *
 * `instanteDoEvento(dia, "00:00:00", fuso)` resolve o instante real da meia-noite
 * local, e a diferença passa a ser de calendário de verdade.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function diasDesdeOEvento(
  evento: Pick<Evento, "dataEvento" | "fuso">,
  agora: Date
): number {
  const meiaNoiteDoEvento = instanteDoEvento(evento.dataEvento, "00:00:00", evento.fuso);
  const diferenca = agora.getTime() - meiaNoiteDoEvento.getTime();
  // `floor` para os dois lados: a véspera é −1 (e não 0), e o dia do casamento é
  // 0 desde a meia-noite. É a leitura que `metricas.md` usa ao dizer que o
  // parâmetro "pode ser negativo".
  return Math.floor(diferenca / 86_400_000);
}
