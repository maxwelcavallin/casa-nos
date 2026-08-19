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

/* ------------------------------------------------------------------ *
 * 6. Tema MUI — construído dos tokens. NENHUM hex daqui para baixo.
 *
 * No projeto este bloco mora em `lib/theme.ts` e importa os tokens acima.
 * Nenhum valor foi alterado na cópia: o que muda é só o endereço dos tokens,
 * que agora vêm por import em vez de estarem no mesmo arquivo.
 * ------------------------------------------------------------------ */


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
    /**
     * `light` de cada estado É o token `-Bg` correspondente, e o assento tem
     * motivo (Fatia 1).
     *
     * O design system pede faixas em `successBg` e `warningBg` — o indicador de
     * envio (§16.6) e a faixa de motivo do card (§16.2). A paleta do MUI só tem
     * main/dark/light/contrastText, e `light` é literalmente "um tom mais claro
     * deste estado", que é o que esses tokens são. Sem este assento, o
     * componente importaria `cor` direto — e `sx={{ bgcolor: "warning.bg" }}`
     * não daria erro nenhum: simplesmente não pintaria, que é o jeito mais
     * silencioso de um estilo sumir. É a mesma dívida que `action.selected`
     * quitou abaixo.
     *
     * Contraste conferido nos dois: `textPrimary` sobre `warningBg` dá 9.90:1 e
     * sobre `successBg` dá 9.76:1 (tokens.ts §1).
     */
    success: { main: cor.success, light: cor.successBg, contrastText: cor.onPrimary },
    warning: { main: cor.warning, light: cor.warningBg, contrastText: cor.onPrimary },
    error: { main: cor.error, light: cor.errorBg, contrastText: cor.onPrimary },
    info: { main: cor.info, light: cor.infoBg, contrastText: cor.onPrimary },
    background: { default: cor.bg, paper: cor.surface },
    text: {
      primary: cor.textPrimary,
      secondary: cor.textSecondary,
      disabled: cor.textHint,
    },
    divider: cor.divider,

    /**
     * DÍVIDA QUITADA. `primaryBg` não tinha assento no tema — a paleta do MUI
     * só tem main/dark/light/contrastText — e por isso `MapaDoLocal` importava
     * `cor` direto para pintar o fundo do quadrado. Escrever `"primary.bg"` no
     * `sx` não daria erro: simplesmente não pintaria, que é o jeito mais
     * silencioso de um estilo sumir.
     *
     * `action.selected` é o assento nativo certo: é literalmente o papel de
     * "tinta clara da marca sob um item escolhido", e é o mesmo valor que a §8
     * manda usar no estado Selecionado. Agora `sx={{ bgcolor: "action.selected" }}`
     * funciona, e nenhum componente precisa importar `cor`.
     */
    action: { selected: cor.primaryBg },
  },

  /** MUI: theme.spacing(1) = 8px. Use 0.5 para 4 e 1.5 para 12. */
  spacing: 8,

  shape: { borderRadius: raio.botao },

  shadows: sombrasMui,

  typography: {
    fontFamily: fonte.sans,
    htmlFontSize: 16,
    fontSize: 16,

    /**
     * Display — Cormorant Garamond.
     *
     * h1 e h2 são CAIXA ALTA com tracking porque é assim que a marca se
     * escreve: a capa do manual traz "ANA FLÁVIA & MAXWEL" e o fecho traz
     * "A ETERNIDADE MORA AQUI", os dois em Cormorant, caixa alta, espaçados.
     * Caixa alta a 32px+ não tem o custo de leitura que tem num botão.
     *
     * h3 e h4 são caixa mista: eles carregam frase inteira ("Casamos em
     * domingo, 22 de agosto de 2027."), e frase inteira em caixa alta com ponto
     * final é grito.
     *
     * A Cormorant é uma serifa de contraste altíssimo — o traço fino some cedo.
     * Ela NÃO desce de 20px em lugar nenhum do produto.
     */
    h1: {
      fontFamily: fonte.display,
      fontWeight: peso.regular,
      fontSize: "clamp(2rem, 7.5vw, 3.5rem)", // 32 -> 56
      lineHeight: 1.12,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
    },
    h2: {
      fontFamily: fonte.display,
      fontWeight: peso.regular,
      fontSize: "clamp(1.5rem, 5.5vw, 2.25rem)", // 24 -> 36
      lineHeight: 1.2,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    },
    h3: {
      fontFamily: fonte.display,
      fontWeight: peso.medio,
      fontSize: "1.5rem", // 24
      lineHeight: 1.3,
      letterSpacing: 0,
    },
    h4: {
      fontFamily: fonte.display,
      fontWeight: peso.medio,
      fontSize: "1.25rem", // 20 — o piso da Cormorant
      lineHeight: 1.35,
    },

    // Interface — Montserrat.
    h5: {
      fontFamily: fonte.sans,
      fontWeight: peso.semi,
      fontSize: "1.125rem", // 18
      lineHeight: 1.4,
    },
    h6: {
      fontFamily: fonte.sans,
      fontWeight: peso.semi,
      fontSize: "1rem", // 16
      lineHeight: 1.45,
    },

    /**
     * A LINHA DE DATA, e por isso mudou de desenho.
     * O manual escreve a data em Montserrat, caixa alta, espaçada — na capa e
     * no fecho. Não em serifa. Este é o papel: destaque curto em caixa alta
     * (data, cidade, mote de uma linha).
     */
    subtitle1: {
      fontWeight: peso.medio,
      fontSize: "1rem", // 16
      lineHeight: 1.5,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
    },
    subtitle2: { fontWeight: peso.semi, fontSize: "0.875rem", lineHeight: 1.5 },

    /**
     * Corpo. `lineHeight` subiu de 1.6 para 1.75 porque a Montserrat é
     * geométrica e larga: com o entrelinha antigo o parágrafo fechava e a
     * coluna de 640px ficava pesada. É o entrelinha do texto corrido da
     * página 02 do manual.
     */
    body1: { fontWeight: peso.regular, fontSize: "1rem", lineHeight: 1.75 },
    body2: { fontWeight: peso.regular, fontSize: "0.875rem", lineHeight: 1.7 },

    /** Metadado — e rótulo de unidade sob número. Ver §3 do design-system.md. */
    caption: { fontWeight: peso.regular, fontSize: "0.75rem", lineHeight: 1.5 },

    /** Sobrescrita de SEÇÃO: "SAVE THE DATE", "ONDE", "QUANDO". */
    overline: {
      fontWeight: peso.medio,
      fontSize: "0.75rem",
      lineHeight: 1.5,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
    },

    /** Sem CAPS em botão: nome de rua e nome de pessoa apareceriam gritando. */
    button: {
      fontWeight: peso.semi,
      fontSize: "0.9375rem", // 15
      lineHeight: 1.2,
      letterSpacing: "0.02em",
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
