/**
 * casa-nos — fonte única de cor, tipografia, espaço, raio e sombra.
 *
 * Este arquivo veio pronto do `lead-design` (workspace
 * `produto-casamento-social/tokens.ts`). **Nenhum valor foi alterado.** A
 * seção 5 daquele arquivo — o tema MUI — mora em `lib/theme.ts`, como o padrão
 * da casa prefere: assim `tokens.ts` continua sendo um módulo sem `"use client"`
 * e pode ser lido também por componente de servidor (o `viewport.themeColor` do
 * layout, por exemplo).
 *
 * Regras que este arquivo existe para sustentar (padroes/design-system.md):
 *  - nenhum `#hex`, `rgb()` ou classe de cor do Tailwind em `app/` e `components/`;
 *  - Tailwind só posiciona (flex, grid, gap, p, m, w, h, breakpoints);
 *  - tipografia sempre por variante do MUI, nunca `style={{ fontSize }}`.
 *
 * Este é o ÚNICO arquivo do projeto onde um `#hex` significa alguma coisa — o
 * ESLint proíbe cor literal em `app/` e `components/`, e não aqui, porque aqui
 * é a paleta.
 *
 * BASE TIPOGRÁFICA: 16px. `1rem` = 16px reais. O projeto NÃO herda
 * `html { font-size: 14px }`. Não converta valor de design assumindo 14.
 */

/* ------------------------------------------------------------------ *
 * 1. Cor
 * ------------------------------------------------------------------ */

export const cor = {
  /** Marca — vinho suave. 4 tons, não 11. */
  primary: "#7A3B45",
  /** Pressionado, texto de marca sobre tinta clara, foco. */
  primaryDark: "#5E2A33",
  /** SÓ preenchimento decorativo e hover. 2.96:1 — nunca use como texto. */
  primaryLight: "#B98A8E",
  /** Tinta de fundo da marca: faixa, chip, seção destacada. */
  primaryBg: "#F5EAE9",

  /** Estado — só estado. Verde nunca é decoração. */
  success: "#2E6F4E",
  successBg: "#E7F1EA",
  warning: "#8A5A00",
  warningBg: "#F8EFDD",
  error: "#A32B23",
  errorBg: "#F8E7E5",
  info: "#2A6A8C",
  infoBg: "#E4EFF4",

  /** Superfície */
  surface: "#FFFFFF",
  bg: "#FAF7F2",

  /** Texto — 3 níveis, não um cinza por tela. */
  textPrimary: "#2B2523",
  textSecondary: "#5A4F49",
  textHint: "#756A63",

  /** Linha */
  divider: "#E4DACD",
  /** Contorno de controle (input, botão outlined): 3.29:1 sobre `bg`. */
  border: "#95867A",

  /** Véu sobre foto, para texto branco sobre imagem. */
  overlay: "rgba(43, 37, 35, 0.55)",
  /** Branco sobre marca e sobre foto com véu. */
  onPrimary: "#FFFFFF",
} as const;

/* ------------------------------------------------------------------ *
 * 2. Tipografia
 * ------------------------------------------------------------------ */

export const fonte = {
  /** Display — Fraunces (next/font/google), variável `--font-display`. */
  display: 'var(--font-display), Georgia, "Times New Roman", serif',
  /** Interface — Inter (next/font/google), variável `--font-sans`. */
  sans: 'var(--font-sans), system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export const peso = {
  regular: 400,
  medio: 500,
  semi: 600,
} as const;

/**
 * Números que mudam sozinhos (contagem regressiva, hora).
 * Espalhe em `sx` para travar a largura do dígito e o número não tremer:
 *   <Typography variant="h2" sx={{ ...tipografiaNumeros }}>
 */
export const tipografiaNumeros = {
  fontFamily: fonte.sans,
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
  letterSpacing: "-0.02em",
} as const;

/* ------------------------------------------------------------------ *
 * 3. Espaço, raio, sombra
 * ------------------------------------------------------------------ */

/** Poucos degraus, de propósito. Em px. */
export const espaco = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  secao: 64,
} as const;

/** Botão 12 e card 16 são DIFERENTES de propósito. Não "corrija". */
export const raio = {
  input: 12,
  botao: 12,
  card: 16,
  folha: 24,
  pilula: 999,
} as const;

/** Três níveis, quentes e discretos. Sombra não é hierarquia. */
export const sombra = {
  sm: "0 1px 2px rgba(43, 37, 35, 0.06)",
  md: "0 2px 8px rgba(43, 37, 35, 0.08)",
  lg: "0 8px 24px rgba(43, 37, 35, 0.12)",
} as const;

/** Teto de largura por tipo de conteúdo (regra §5 do padrão da casa). */
export const largura = {
  /** Coluna de leitura: save the date, horários, texto corrido. */
  texto: 640,
  /** Conteúdo com card, mapa, grade de dois. */
  conteudo: 960,
  /** Feed e álbum, quando existirem. */
  app: 1120,
} as const;

/** Alvo de toque mínimo no mobile. Não desça daqui. */
export const toque = { minimo: 44, confortavel: 48 } as const;

export const tokens = {
  cor,
  fonte,
  peso,
  espaco,
  raio,
  sombra,
  largura,
  toque,
} as const;

export type Tokens = typeof tokens;

/* ------------------------------------------------------------------ *
 * 4. Espelho em CSS custom properties
 *    Injetadas no `:root` pelo `MuiCssBaseline` (ver `lib/theme.ts`), e não
 *    coladas à mão em `app/globals.css` — assim existe UM lugar com os valores
 *    e o CSS não pode divergir do tema.
 * ------------------------------------------------------------------ */

export const variaveisCss: Record<string, string> = {
  "--cn-primary": cor.primary,
  "--cn-primary-dark": cor.primaryDark,
  "--cn-primary-light": cor.primaryLight,
  "--cn-primary-bg": cor.primaryBg,
  "--cn-success": cor.success,
  "--cn-success-bg": cor.successBg,
  "--cn-warning": cor.warning,
  "--cn-warning-bg": cor.warningBg,
  "--cn-error": cor.error,
  "--cn-error-bg": cor.errorBg,
  "--cn-info": cor.info,
  "--cn-info-bg": cor.infoBg,
  "--cn-surface": cor.surface,
  "--cn-bg": cor.bg,
  "--cn-text-primary": cor.textPrimary,
  "--cn-text-secondary": cor.textSecondary,
  "--cn-text-hint": cor.textHint,
  "--cn-divider": cor.divider,
  "--cn-border": cor.border,
  "--cn-overlay": cor.overlay,
  "--cn-radius-card": `${raio.card}px`,
  "--cn-radius-botao": `${raio.botao}px`,
  "--cn-shadow-sm": sombra.sm,
  "--cn-shadow-md": sombra.md,
  "--cn-shadow-lg": sombra.lg,
};

export default tokens;
