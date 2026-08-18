"use client";

import { createTheme, type Shadows, type Theme } from "@mui/material/styles";

import {
  cor,
  espaco,
  fonte,
  peso,
  raio,
  sombra,
  toque,
  variaveisCss,
} from "@/lib/tokens";

/**
 * Tema MUI — seção 5 do `tokens.ts` entregue pelo `lead-design`, movida para cá
 * sem alteração de valor.
 *
 * **Nenhum hex daqui para baixo.** Se aparecer um, o token correspondente está
 * faltando em `lib/tokens.ts` e é lá que ele nasce.
 */

const sombrasMui = createTheme().shadows.slice() as Shadows;
sombrasMui[1] = sombra.sm;
sombrasMui[2] = sombra.md;
sombrasMui[3] = sombra.lg;

export const tema: Theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: cor.primary,
      dark: cor.primaryDark,
      light: cor.primaryLight,
      contrastText: cor.onPrimary,
    },
    success: { main: cor.success, contrastText: cor.onPrimary },
    warning: { main: cor.warning, contrastText: cor.onPrimary },
    error: { main: cor.error, contrastText: cor.onPrimary },
    info: { main: cor.info, contrastText: cor.onPrimary },
    background: { default: cor.bg, paper: cor.surface },
    text: {
      primary: cor.textPrimary,
      secondary: cor.textSecondary,
      disabled: cor.textHint,
    },
    divider: cor.divider,
  },

  /** MUI: theme.spacing(1) = 8px. Use 0.5 para 4 e 1.5 para 12. */
  spacing: 8,

  shape: { borderRadius: raio.botao },

  shadows: sombrasMui,

  typography: {
    fontFamily: fonte.sans,
    htmlFontSize: 16,
    fontSize: 16,

    // Display (Fraunces) — emoção. Só título.
    h1: {
      fontFamily: fonte.display,
      fontWeight: peso.regular,
      fontSize: "clamp(2.5rem, 9vw, 4rem)", // 40 -> 64
      lineHeight: 1.05,
      letterSpacing: "-0.01em",
    },
    h2: {
      fontFamily: fonte.display,
      fontWeight: peso.regular,
      fontSize: "clamp(1.75rem, 6vw, 2.5rem)", // 28 -> 40
      lineHeight: 1.15,
      letterSpacing: "-0.01em",
    },
    h3: {
      fontFamily: fonte.display,
      fontWeight: peso.regular,
      fontSize: "1.5rem", // 24
      lineHeight: 1.25,
    },
    h4: {
      fontFamily: fonte.display,
      fontWeight: peso.medio,
      fontSize: "1.25rem", // 20
      lineHeight: 1.3,
    },

    // Interface (Inter) — clareza. Título de card, diálogo, seção do app.
    h5: {
      fontFamily: fonte.sans,
      fontWeight: peso.semi,
      fontSize: "1.125rem", // 18
      lineHeight: 1.35,
    },
    h6: {
      fontFamily: fonte.sans,
      fontWeight: peso.semi,
      fontSize: "1rem", // 16
      lineHeight: 1.4,
    },

    subtitle1: { fontWeight: peso.medio, fontSize: "1rem", lineHeight: 1.5 },
    subtitle2: { fontWeight: peso.semi, fontSize: "0.875rem", lineHeight: 1.45 },

    body1: { fontWeight: peso.regular, fontSize: "1rem", lineHeight: 1.6 },
    body2: { fontWeight: peso.regular, fontSize: "0.875rem", lineHeight: 1.55 },

    caption: { fontWeight: peso.regular, fontSize: "0.75rem", lineHeight: 1.4 },

    /** Sobrescrita "SAVE THE DATE", "ONDE", "QUANDO". */
    overline: {
      fontWeight: peso.semi,
      fontSize: "0.75rem",
      lineHeight: 1.4,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
    },

    /** Sem CAPS LOCK em botão — nome de rua e nome de pessoa apareceriam gritando. */
    button: {
      fontWeight: peso.semi,
      fontSize: "0.9375rem", // 15
      lineHeight: 1.2,
      letterSpacing: 0,
      textTransform: "none",
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ":root": variaveisCss,
        html: { WebkitTextSizeAdjust: "100%" },
        body: {
          backgroundColor: cor.bg,
          color: cor.textPrimary,
          WebkitFontSmoothing: "antialiased",
        },
        "*:focus-visible": {
          outline: `2px solid ${cor.primaryDark}`,
          outlineOffset: 2,
        },
        img: { maxWidth: "100%", display: "block" },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: raio.botao,
          minHeight: toque.confortavel,
          paddingInline: espaco.xl,
        },
        outlined: { borderColor: cor.border },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: { minWidth: toque.minimo, minHeight: toque.minimo },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: "none", borderRadius: raio.card },
      },
    },

    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: raio.card,
          border: `1px solid ${cor.divider}`,
          backgroundColor: cor.surface,
          boxShadow: sombra.sm,
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: raio.pilula, fontWeight: peso.medio },
      },
    },

    MuiDivider: { styleOverrides: { root: { borderColor: cor.divider } } },

    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: raio.input, backgroundColor: cor.surface },
        notchedOutline: { borderColor: cor.border },
      },
    },

    MuiTextField: { defaultProps: { variant: "outlined" } },

    MuiLink: {
      defaultProps: { underline: "always" },
      styleOverrides: { root: { color: cor.primaryDark } },
    },

    MuiSkeleton: {
      styleOverrides: { root: { backgroundColor: cor.divider } },
    },
  },
});

export default tema;
