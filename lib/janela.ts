import { janelaDeEnvioPadrao } from "@/lib/datas";
import type { Evento } from "@/lib/eventos";

/**
 * "Este casamento aceita foto agora?" — uma pergunta, um lugar.
 *
 * Ela é feita em três lugares diferentes e por três motivos diferentes: a tela
 * do álbum decide se desenha o botão (H-05), a rota de intenção decide se
 * responde 409 (H-06), e a fila local decide se para de tentar (H-07). As três
 * precisam concordar — se a tela mostra o botão e a rota recusa, o convidado
 * escolhe as fotos e leva um erro que ele não podia prever.
 *
 * QUATRO ENTRADAS, e cada uma resolve um caso do PRD:
 *
 * - `envio_abre_em` / `envio_fecha_em` — a janela configurada (RN-08). Nulas
 *   caem no padrão calculado de `data_evento` (D−1 00:00 a D+7 23:59:59 no fuso
 *   do evento), para um evento recém-criado aceitar foto sem ninguém configurar
 *   nada.
 * - `envios_encerrados_em` — o interruptor do casal (B14). Ele encerra ANTES do
 *   fim da janela e não mexe na janela: alterar a janela nunca apaga mídia
 *   recebida, e desfazer o interruptor tem que devolver o estado anterior.
 * - `novos_aparelhos_bloqueados` — fecha a APARELHOS NOVOS sem derrubar quem já
 *   está enviando (B14). É a única regra daqui que depende de quem está
 *   perguntando, e é por isso que `temParticipacao` é parâmetro.
 */

export type EstadoDoEnvio =
  /** Aceita foto. */
  | "aberto"
  /** Fora da janela, ou encerrado pelo casal. O feed continua visível. */
  | "fora_da_janela"
  /** A janela está aberta, mas este aparelho é novo e o casal fechou a porta. */
  | "aparelho_novo_bloqueado";

export type Janela = { abre: Date; fecha: Date };

/**
 * A janela efetiva do evento: a configurada, ou o padrão calculado.
 *
 * O padrão é calculado e **não** gravado no momento da leitura. Gravar aqui
 * transformaria uma consulta numa escrita — em toda abertura de álbum, de todo
 * convidado, ao mesmo tempo, que é justamente o instante em que este produto não
 * pode gastar banco. A gravação acontece uma vez, quando o casal salva a tela do
 * dia (H-02), e é lá que o padrão deixa de ser derivado.
 */
export function janelaDoEvento(evento: Evento): Janela {
  const padrao = janelaDeEnvioPadrao(evento.dataEvento, evento.fuso);
  return {
    abre: evento.envioAbreEm ?? padrao.abre,
    fecha: evento.envioFechaEm ?? padrao.fecha,
  };
}

export function estadoDoEnvio(
  evento: Evento,
  agora: Date,
  temParticipacao: boolean
): EstadoDoEnvio {
  const { abre, fecha } = janelaDoEvento(evento);

  if (evento.enviosEncerradosEm && evento.enviosEncerradosEm <= agora) {
    return "fora_da_janela";
  }
  if (agora < abre || agora > fecha) return "fora_da_janela";

  // A ordem importa: quem já tem participação continua enviando mesmo com a
  // porta fechada. Trocar a ordem destas duas transformaria o bloqueio de
  // aparelhos novos num "encerra para todo mundo", que é o contrário da B14.
  if (evento.novosAparelhosBloqueados && !temParticipacao) {
    return "aparelho_novo_bloqueado";
  }

  return "aberto";
}

/**
 * "Isto aconteceu durante a festa?" (RN-10).
 *
 * Janela DIFERENTE da de envio, e a confusão entre as duas é o defeito que a
 * §3.1 V9 do PRD descreve: produz número errado sem nenhum erro aparecer. Esta
 * decide o silêncio de notificações e o bloqueio 2 da medição; aquela decide o
 * que o produto aceita.
 *
 * Sem os dois carimbos configurados a resposta é `false`: "durante a festa" é
 * indefinível, e chutar aqui seria silenciar notificação num dia qualquer ou
 * mandar aviso às 23h — que é exatamente o que o produto promete não fazer.
 */
export function durante(
  evento: Evento,
  instante: Date
): boolean {
  if (!evento.inicioFestaEm || !evento.fimFestaEm) return false;
  return instante >= evento.inicioFestaEm && instante <= evento.fimFestaEm;
}
