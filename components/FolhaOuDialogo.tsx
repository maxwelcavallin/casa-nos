"use client";

import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useEffect, useId, useRef } from "react";

import { largura, raio } from "@/lib/tokens";

/**
 * A FOLHA (design system §16.5) — cinco delas nesta fatia.
 *
 * Envio · identificação · visibilidade · exclusão · CTA do lead.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **NO MOBILE É FOLHA; ACIMA DE `sm` DEIXA DE SER.** Bottom sheet num monitor é
 * um erro de origem — o padrão nasceu para o polegar, e num monitor de 27" ele
 * põe a decisão a 40 cm do olho, colada na borda de baixo. Acima de `sm` vira
 * `Dialog` centralizado de 480, com raio nos quatro cantos e sem alça.
 *
 * **O FOCO INICIAL É O TÍTULO, NUNCA UM BOTÃO.** Botão focado é botão sugerido,
 * e na folha de envio isso contaminaria a razão entre os dois cliques — que é o
 * instrumento da hipótese central do produto (§16.5b, item 2). Por isso o título
 * recebe `tabIndex={-1}` e o foco, e por isso este componente não aceita uma
 * prop de "foco inicial": o caminho errado não existe.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O RODAPÉ É FIXO. O conteúdo rola **dentro**; os botões de ação nunca saem de
 * vista. Numa folha com 30 miniaturas, botões no fim do conteúdo rolável seriam
 * botões que a pessoa procura.
 */

export type PropriedadesDaFolha = {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  /** Some quando a folha traz um subtítulo próprio no corpo. */
  descricao?: string;
  children: React.ReactNode;
  /** Fixo no rodapé, fora da área que rola. */
  rodape?: React.ReactNode;
  /**
   * Ação destrutiva não fecha por arraste nem por toque no véu (§16.5). Nesta
   * fatia nenhuma folha é destrutiva — apagar é um toque, sem folha (H-10) —,
   * e a prop existe para a F1.5, onde o casal apaga foto de outra pessoa.
   */
  destrutiva?: boolean;
};

export function FolhaOuDialogo({
  aberta,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  destrutiva = false,
}: PropriedadesDaFolha) {
  const tema = useTheme();
  const largaOSuficiente = useMediaQuery(tema.breakpoints.up("sm"));
  const idDoTitulo = useId();
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!aberta) return;
    // O foco pousa no título. Sem isto, o leitor de tela continua na página de
    // trás e a pessoa não sabe que algo abriu.
    const temporizador = window.setTimeout(() => tituloRef.current?.focus(), 0);
    return () => window.clearTimeout(temporizador);
  }, [aberta]);

  const fecharPorFora = (_: unknown, motivo: string) => {
    if (destrutiva && motivo === "backdropClick") return;
    aoFechar();
  };

  const miolo = (
    <>
      <Stack sx={{ px: 2, pt: largaOSuficiente ? 3 : 1, gap: 0.5 }}>
        <Typography
          id={idDoTitulo}
          ref={tituloRef}
          tabIndex={-1}
          variant="h5"
          component="h2"
          sx={{ outline: "none" }}
        >
          {titulo}
        </Typography>
        {descricao ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {descricao}
          </Typography>
        ) : null}
      </Stack>

      {/* O que rola. O rodapé não está aqui dentro, de propósito. */}
      <Box sx={{ px: 2, py: 2, overflowY: "auto", flex: 1, minHeight: 0 }}>{children}</Box>

      {rodape ? (
        <Stack
          sx={{
            px: 2,
            pt: 1.5,
            gap: 1,
            borderTop: 1,
            borderColor: "divider",
            // A barra de gestos do iOS come 34 px do rodapé. Sem isto, o botão
            // secundário fica embaixo dela — e o secundário é justamente o que
            // não pode ficar mais difícil de tocar que o primário (§16.5b).
            pb: "calc(12px + env(safe-area-inset-bottom))",
          }}
        >
          {rodape}
        </Stack>
      ) : null}
    </>
  );

  if (largaOSuficiente) {
    return (
      <Dialog
        open={aberta}
        onClose={fecharPorFora}
        aria-labelledby={idDoTitulo}
        maxWidth={false}
        slotProps={{
          paper: {
            sx: {
              width: "100%",
              maxWidth: largura.dialogo,
              borderRadius: `${raio.card}px`,
              display: "flex",
              flexDirection: "column",
              maxHeight: "88dvh",
            },
          },
        }}
      >
        {miolo}
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={aberta}
      onClose={fecharPorFora}
      aria-labelledby={idDoTitulo}
      slotProps={{
        paper: {
          sx: {
            // Raio SÓ nos cantos de cima: é o que faz a folha parecer que veio
            // de baixo, e não uma caixa que apareceu.
            borderRadius: `${raio.folha}px ${raio.folha}px 0 0`,
            maxHeight: "88dvh",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      {/* A alça. Decorativa e `aria-hidden`: ela diz "isto arrasta" a quem vê, e
          quem não vê já recebeu `role="dialog"` do Drawer. */}
      <Box
        aria-hidden
        sx={{
          width: 40,
          height: 4,
          bgcolor: "divider",
          borderRadius: `${raio.pilula}px`,
          mx: "auto",
          my: 1.5,
          flex: "none",
        }}
      />
      {miolo}
    </Drawer>
  );
}

export default FolhaOuDialogo;
