"use client";

import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";

import { grade } from "@/lib/tokens";

/**
 * A GRADE DE MÍDIA — um lugar só, quatro telas (design system §16.3).
 *
 * Existe para que feed, minhas fotos, painel de mídias e fila de aprovação não
 * inventem quatro grades. É aqui, e só aqui, que vivem as colunas, o vão e o
 * esqueleto.
 *
 * `repeat(auto-fill, minmax(104px, 1fr))`: em 360 px de viewport, com 16 de
 * respiro e 8 de vão, sobram 328 — exatamente três colunas de 104. É de onde o
 * número saiu, e é por isso que ele não é redondo.
 */

export function GradeMidias({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${grade.tileMinimo}px, 1fr))`,
        gap: `${grade.vao}px`,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * O esqueleto — na forma do conteúdo real, nunca um spinner.
 *
 * Doze tiles, que é a altura de quatro linhas em três colunas. A altura importa:
 * um esqueleto mais curto que o conteúdo faz a página **pular** quando as fotos
 * chegam, e pular é o que ensina ao convidado que a tela é instável — no exato
 * instante em que ele decide se manda ou não.
 */
export function EsqueletoDaGrade({ quantos = 12 }: { quantos?: number }) {
  return (
    <GradeMidias>
      {Array.from({ length: quantos }, (_, indice) => (
        <Skeleton
          key={indice}
          variant="rounded"
          sx={{ width: "100%", aspectRatio: "1 / 1", height: "auto" }}
        />
      ))}
    </GradeMidias>
  );
}

/**
 * O BLOCO DE CONVITE DO FEED VAZIO — a tela mais importante do produto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ALTURA É DERIVADA DA GRADE, E NÃO 216 px. Correção pedida pelo
 * `lead-design`, e ela não é preciosismo:
 *
 * 216 = 2 × 104 + 8 vale **enquanto a grade tiver três colunas de 104**. Num
 * aparelho estreito (abaixo de 328 px de conteúdo) a grade cai para duas
 * colunas, as colunas ficam mais largas, os tiles ficam mais altos — e 216
 * deixa de ser a altura de duas linhas. O bloco encolhe em relação ao conteúdo
 * que ele está reservando, e quando a primeira foto chega **a tela pula**.
 * Justamente no aparelho mais apertado, que é onde a promessa é mais difícil.
 *
 * COMO A DERIVAÇÃO FUNCIONA, e por que ela é CSS puro e não medição em
 * JavaScript: o bloco vive dentro de uma grade com **a mesma regra de colunas** e
 * a mesma largura da grade real. Duas células invisíveis de proporção 1:1
 * ocupam a primeira coluna nas linhas 1 e 2 — elas definem a altura das linhas
 * exatamente como um tile de verdade definiria. O convite ocupa por cima, de
 * `1 / -1` e de `1 / 3`. O resultado é `2 × altura-de-tile + vão`, seja qual for
 * o número de colunas, medido pelo navegador e não por nós.
 *
 * Nenhum `ResizeObserver`, nenhuma constante, nada para desatualizar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function ConviteDaGrade({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${grade.tileMinimo}px, 1fr))`,
        gap: `${grade.vao}px`,
      }}
    >
      {/* As duas réguas. `aria-hidden` porque elas não são conteúdo: são a
          altura de duas linhas de grade, escrita na única linguagem que o
          navegador calcula sozinho. */}
      <Box
        aria-hidden
        data-regua-da-grade
        sx={{ gridColumn: 1, gridRow: 1, aspectRatio: "1 / 1", visibility: "hidden" }}
      />
      <Box
        aria-hidden
        data-regua-da-grade
        sx={{ gridColumn: 1, gridRow: 2, aspectRatio: "1 / 1", visibility: "hidden" }}
      />
      <Box
        sx={{
          gridColumn: "1 / -1",
          gridRow: "1 / 3",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 1,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
