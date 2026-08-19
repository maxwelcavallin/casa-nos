"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import type { EstadoDaFila } from "@/lib/fila/motor";

/**
 * O INDICADOR DE ENVIO — a peça que sustenta a aposta (design system §16.6).
 *
 * O convidado precisa **voltar para a festa** confiando que as fotos vão chegar.
 * Este é o único lugar do produto que responde "e as minhas fotos?" enquanto ele
 * está com o celular na mão, e por isso ele é uma FAIXA: largura inteira, acima
 * da barra de envio, **nunca modal, nunca overlay, nunca bloqueia nada**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUAS PROIBIÇÕES, E AS DUAS SÃO DE PRODUTO, NÃO DE ESTILO:
 *
 * 1. **A palavra "falhou" não entra em nenhum estado** (`escopo-core.md` §12.8).
 *    Porque não falhou: adiou. Quem lê "falhou" tenta de novo à mão, ou desiste
 *    — e nos dois casos o produto perde a foto que ele ia entregar sozinho.
 *
 * 2. **`cor.error` não entra em nenhum estado**, e por inteiro. Deixar a cor
 *    disponível é deixar alguém usá-la num dia de pressa. "Sem rede" é
 *    `warningBg`: é estado, não erro.
 *
 * E contagem de ITENS, nunca porcentagem: porcentagem mente quando a fila cresce
 * — a pessoa manda mais seis fotos e a barra "volta", o que lê como perda de
 * progresso.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O TEXTO NUNCA PROMETE SEGUNDO PLANO. No Android a aba drena em segundo plano;
 * no iOS não drena, e a interface não pode prometer o que a plataforma não faz.
 * Por isso "quando a rede voltar" e "quando você voltar" — jamais "enviando em
 * segundo plano".
 */

export type AcaoDoIndicador = { rotulo: string; aoTocar: () => void };

function textoDaSituacao(estado: EstadoDaFila): string | null {
  const n = estado.pendentes;
  switch (estado.situacao) {
    case "retomando":
      // Aparece sozinha ao reabrir o link. Aviso, não pergunta.
      return `Encontramos ${n} ${n === 1 ? "foto sua que ficou" : "fotos suas que ficaram"} pelo caminho. Estamos mandando agora.`;
    case "sem_rede":
      return n > 0
        ? `Sem rede agora. ${n === 1 ? "Sua foto está guardada" : `Suas ${n} fotos estão guardadas`} no seu celular e ${n === 1 ? "vai sozinha" : "vão sozinhas"} quando a rede voltar.`
        : "Sem rede agora. Assim que voltar, o álbum atualiza sozinho.";
    case "portal_cativo":
      return "A rede do salão pediu login. Suas fotos continuam guardadas até você entrar.";
    case "enviando":
      return n > 0
        ? `Mandando ${n} ${n === 1 ? "foto" : "fotos"}`
        : null;
    case "concluido":
      return "Tudo aqui";
    default:
      return null;
  }
}

/** Quanto tempo o "Tudo aqui" ocupa o slot antes de se recolher (§16.6). */
const MS_DO_CONCLUIDO = 4000;

export function IndicadorEnvio({
  estado,
  acao,
}: {
  estado: EstadoDaFila;
  /** Só o portal cativo tem ação. É o único estado em que há o que fazer. */
  acao?: AcaoDoIndicador;
}) {
  /**
   * `concluido` ("Tudo aqui") é **transição para a prioridade 4, não uma quinta
   * prioridade** (decisão R10).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * Ele aparece **só** quando a última pendência termina com a tela aberta, é
   * anunciado uma vez, e o slot se recolhe sozinho em 4 s, sem exigir ação.
   *
   * Ele **nunca** aparece ao abrir a tela já sem pendência: quem garante isso é
   * o motor, que só entra em `concluido` saindo de `enviando` — a fila que abre
   * vazia fica em `parada`, e `parada` não tem texto.
   *
   * E ele **não sobrevive a recarga**: o estado é de memória, e recarregar a
   * página devolve `parada`. Isso é a especificação, não uma limitação — um
   * "Tudo aqui" que reaparecesse a cada recarga viraria mobília, que é
   * exatamente o que a prioridade 4 existe para evitar.
   *
   * Ele existe porque o resumo do topo **abriu um assunto** ("N ainda têm versão
   * maior") e sumir em silêncio seria fechar esse assunto sem responder. É a
   * mesma regra do aviso de retomada: **o produto fala quando o estado muda, não
   * continuamente.**
   * ─────────────────────────────────────────────────────────────────────────
   */
  const concluido = estado.situacao === "concluido";

  /**
   * O RECOLHIMENTO ZERA POR **REMONTAGEM**, e não por um `setState` no efeito.
   *
   * Quem monta este componente passa `key={estado.situacao}` (ver `ResumoDoTopo`
   * e `BarraDeEnvio`): quando a fila sai de `concluido`, o componente é
   * remontado e `recolhido` volta a `false` sozinho. Um efeito que fizesse esse
   * reset chamaria `setState` no próprio corpo — cascata de renderização, e o
   * lint recusa com razão.
   *
   * O que a `key` compra além da regra: o **segundo** "Tudo aqui" da noite volta
   * a aparecer. Sem remontagem, o booleano ficaria marcado desde o primeiro, e o
   * convidado que mandasse mais fotos não receberia a resposta — o resumo do topo
   * teria aberto um assunto e fechado em silêncio.
   */
  const [recolhido, setRecolhido] = useState(false);

  useEffect(() => {
    if (!concluido) return;
    const temporizador = window.setTimeout(() => setRecolhido(true), MS_DO_CONCLUIDO);
    return () => window.clearTimeout(temporizador);
  }, [concluido]);

  const texto = textoDaSituacao(estado);
  if (!texto) return null;
  if (concluido && recolhido) return null;

  const espera = estado.situacao === "sem_rede" || estado.situacao === "portal_cativo";

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        // `warningBg` para espera, `successBg` para concluído, `primaryBg` para
        // o resto. Nunca `error`, em nenhum estado — ver o comentário do topo.
        //
        // `action.selected` E NÃO `primary.light`: `primaryLight` é o "céu" do
        // manual, 2.48:1 sobre o algodão, proibido como fundo de texto. O que o
        // design system pede aqui é `primaryBg`, que tem assento em
        // `action.selected` no tema — e dá 8.49:1 com `textPrimary` por cima.
        bgcolor: espera ? "warning.light" : concluido ? "success.light" : "action.selected",
        color: "text.primary",
        px: 2,
        py: 1,
      }}
    >
      <Stack direction="row" sx={{ gap: 1, alignItems: "center", minHeight: 48 }}>
        {espera ? <WifiOff size={18} aria-hidden /> : null}
        <Typography variant="body2" sx={{ flex: 1 }}>
          {texto}
        </Typography>
        {acao ? (
          <Button variant="outlined" size="small" onClick={acao.aoTocar}>
            {acao.rotulo}
          </Button>
        ) : null}
      </Stack>
      {estado.situacao === "enviando" && estado.pendentes > 0 ? (
        // Determinada por item, e não por bytes: bytes fazem a barra andar para
        // trás quando um item novo entra.
        <LinearProgress sx={{ height: 3, mt: 1 }} />
      ) : null}
    </Box>
  );
}
