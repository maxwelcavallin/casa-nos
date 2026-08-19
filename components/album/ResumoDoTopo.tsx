"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { IndicadorEnvio, type AcaoDoIndicador } from "@/components/album/IndicadorEnvio";
import type { EstadoDaFila } from "@/lib/fila/motor";

/**
 * O SLOT DO TOPO DE "AS MINHAS FOTOS" — **um só, quatro conteúdos em
 * prioridade** (H-08, `gtm.md` §5.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. sem rede, com fotos guardadas no celular
 *   2. retomada em curso, com a tela aberta
 *   3. versão maior pendente
 *   4. nada pendente → **o slot não existe**
 *
 * **DUAS MENSAGENS EMPILHADAS NO TOPO SE CONTRADIZEM, E A DE BAIXO NUNCA É
 * LIDA.** É por isso que isto é um componente e não dois blocos irmãos: a
 * prioridade precisa ser uma decisão de código, num lugar, e não a ordem em que
 * alguém escreveu dois `{condicao ? ... : null}`.
 *
 * A prioridade 4 não vira "0 fotos subindo" e não vira mobília: **aviso
 * permanente vira mobília e ninguém lê**, e a próxima vez que ele tiver algo a
 * dizer, ninguém vai reparar que mudou.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A LINHA DA PRIORIDADE 3 CARREGA O QUE NENHUM CARD PODE CARREGAR.
 *
 * O card diz o **estado da foto** (`Ainda subindo`); o resumo diz a **condição**
 * — que o que faz aquilo terminar é ele reabrir este link. O convite a voltar é
 * **por participação, não por foto** (RN-32d): ele aparece uma vez, agregado, e
 * nunca repetido em 200 cards. Informar no card seria uma cobrança multiplicada
 * por 200; informar aqui é uma frase.
 *
 * E as três partes estão em ordem de peso, deliberadamente:
 *
 *  1. `Suas fotos já estão com os noivos` — porque a leitura padrão de qualquer
 *     aviso no topo de uma tela é "deu problema", e esta frase mata a leitura
 *     errada antes de ela acontecer.
 *  2. `ainda têm uma versão maior` — o fato, sem jargão de faixa nem de
 *     resolução.
 *  3. `que chega quando você abrir este link de novo` — a **condição**, escrita
 *     como condição e não como ordem: sem imperativo, sem "por favor", sem
 *     botão. Quem reabrir, reabre; quem não reabrir não fez nada errado, e a
 *     foto dele continua com o casal — que é o que a primeira frase garantiu.
 *
 * A frase é verdadeira **nas duas plataformas**, e isso não é acaso: ela enuncia
 * uma condição *suficiente*, nunca necessária. No Android o original pode
 * terminar sozinho antes de ele reabrir — e aí o resumo simplesmente não
 * aparece, porque ele só existe enquanto houver original pendente.
 */

export const TETO_DA_LINHA_AGREGADA = 110;

/**
 * A linha da prioridade 3. **≤ 110 caracteres**, e o teto é contrato (H-08,
 * `design-system.md` §19).
 *
 * Acima dele a linha ocupa uma terceira altura de `body2` a 328 px e empurra a
 * primeira fileira da grade para fora da dobra — que é onde o convidado precisa
 * ver a própria foto. `test/copy-minhas.test.ts` falha acima do teto.
 */
export function linhaDeVersaoMaior(quantas: number): string {
  return quantas === 1
    ? "Suas fotos já estão com os noivos. Uma delas ainda tem uma versão maior, que chega quando você abrir este link de novo."
    : `Suas fotos já estão com os noivos. ${quantas} delas ainda têm uma versão maior, que chega quando você abrir este link de novo.`;
}

export type PropriedadesDoResumo = {
  estadoDaFila: EstadoDaFila;
  originaisPendentes: number;
  acao?: AcaoDoIndicador;
};

export function ResumoDoTopo({
  estadoDaFila,
  originaisPendentes,
  acao,
}: PropriedadesDoResumo) {
  /**
   * Prioridades 1, 2 e a transição `concluido` são do `IndicadorEnvio` — ele já
   * sabe desenhá-las, com o fundo certo para cada uma e sem `cor.error` em
   * nenhuma. O que decide se ele aparece é a situação da fila.
   *
   * `enviando` também passa por aqui: ele não é uma quinta prioridade, é a
   * prioridade 2 no instante em que a retomada vira envio normal.
   */
  const filaTemAlgoADizer =
    estadoDaFila.situacao === "sem_rede" ||
    estadoDaFila.situacao === "portal_cativo" ||
    estadoDaFila.situacao === "retomando" ||
    estadoDaFila.situacao === "concluido" ||
    (estadoDaFila.situacao === "enviando" && estadoDaFila.pendentes > 0);

  if (filaTemAlgoADizer) {
    // A `key` faz o indicador remontar quando a situação muda — é o que zera o
    // recolhimento do "Tudo aqui" sem um `setState` dentro de efeito. Ver o
    // comentário em `IndicadorEnvio`.
    return <IndicadorEnvio key={estadoDaFila.situacao} estado={estadoDaFila} acao={acao} />;
  }

  // Prioridade 4: o slot NÃO existe. Nem uma faixa vazia, nem "0 fotos".
  if (originaisPendentes === 0) return null;

  return (
    <Box role="status" sx={{ bgcolor: "action.selected", color: "text.primary", px: 2, py: 1 }}>
      {/* `body2`/`textPrimary`, largura da grade. Sem barra de progresso: ela já
          existe por item, e uma segunda barra agregada faz a tela parecer um
          gerenciador de downloads. */}
      <Typography variant="body2">{linhaDeVersaoMaior(originaisPendentes)}</Typography>
    </Box>
  );
}

export default ResumoDoTopo;
