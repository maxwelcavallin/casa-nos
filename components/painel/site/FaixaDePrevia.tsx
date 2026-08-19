import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ArrowLeft, Eye } from "lucide-react";

import { largura, toque } from "@/lib/tokens";

/**
 * A FAIXA DA PRÉVIA (v1.0, V-10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **ELA NÃO FAZ PARTE DO QUE É RENDERIZADO COMO SITE**, e o critério da V-10
 * escreve as duas metades disso:
 *
 *   *"some da contagem de seções"*  — ela é irmã de `PaginaDoEvento`, e não
 *   filha. Não entra no `Stack` que ordena as seções, não recebe o `gap` dele e
 *   não aparece em `secoes`. Nada dentro do site sabe que ela existe.
 *
 *   *"não empurra o conteúdo"*  — `position: fixed`. Uma faixa no fluxo, no topo,
 *   deslocaria a página inteira para baixo, e o casal aprovaria um primeiro
 *   quadro que o convidado nunca vai ver. Esse é justamente o erro que a prévia
 *   existe para não cometer.
 *
 * **EM BAIXO, E NÃO EM CIMA.** Fixa no topo ela cobriria o monograma e o `h1` —
 * o único lugar da página que precisa chegar intacto ao olho do casal. Em baixo
 * ela cobre uma faixa de rolagem, e o espaçador logo abaixo do rodapé devolve
 * essa altura no fim da página, para o rodapé não terminar debaixo dela.
 *
 * **O QUE ELA AINDA ASSIM MENTE, e está escrito para ninguém se surpreender:**
 * ela ocupa ~64 px do fundo da janela. Numa tela curta, o que cabe "acima da
 * dobra" na prévia é um pouco menos do que caberá no site. É o preço de existir,
 * e é menor que o da alternativa (empurrar tudo para baixo).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * COMPONENTE DE SERVIDOR: ele não tem estado nem evento. Um `"use client"` aqui
 * mandaria JavaScript para uma barra que só tem um link.
 */

/** Reservado no fim da página para o rodapé não terminar debaixo da faixa. */
export const ALTURA_DA_FAIXA = 72;

export function FaixaDePrevia({
  eventoId,
  publicado,
}: {
  eventoId: string;
  /** Muda só a frase. A faixa aparece nos dois casos — prévia é prévia. */
  publicado: boolean;
}) {
  return (
    <Box
      component="aside"
      // `aria-label` porque a faixa é uma região da tela do painel, e não do
      // site: quem navega por regiões precisa distinguir uma da outra.
      aria-label="Prévia do site"
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        bgcolor: "action.selected",
        borderTop: 1,
        borderColor: "divider",
        // A barra de gestos do iOS come 34 px do rodapé. Sem isto, o link de
        // voltar fica embaixo dela — e ele é a única saída desta tela.
        pb: "calc(8px + env(safe-area-inset-bottom))",
        pt: 1,
        px: 2,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          maxWidth: largura.conteudo,
          mx: "auto",
          gap: { xs: 0.5, sm: 2 },
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
          <Eye size={16} aria-hidden />
          <Typography variant="caption">
            {publicado
              ? "Prévia: é assim que o site de vocês está no ar agora."
              : "Prévia: é assim que o site vai ficar. Ninguém mais consegue abrir esta página."}
          </Typography>
        </Stack>

        <Link
          href={`/painel/${eventoId}/site`}
          variant="body2"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            // 44 px de alvo de toque: é a única saída da prévia, e errar o dedo
            // aqui deixa o casal preso numa tela sem menu.
            minHeight: toque.minimo,
            whiteSpace: "nowrap",
          }}
        >
          <ArrowLeft size={16} aria-hidden />
          Voltar para o painel
        </Link>
      </Stack>
    </Box>
  );
}

export default FaixaDePrevia;
