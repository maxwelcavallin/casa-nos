"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { WifiOff } from "lucide-react";

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

export function IndicadorEnvio({
  estado,
  acao,
}: {
  estado: EstadoDaFila;
  /** Só o portal cativo tem ação. É o único estado em que há o que fazer. */
  acao?: AcaoDoIndicador;
}) {
  const texto = textoDaSituacao(estado);
  if (!texto) return null;

  const espera = estado.situacao === "sem_rede" || estado.situacao === "portal_cativo";
  const concluido = estado.situacao === "concluido";

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
