"use client";

import { createTheme, type Theme } from "@mui/material/styles";

import { tema } from "@/lib/theme";
import { corProjecao, escalaProjecao, fonte, peso } from "@/lib/tokens";

/**
 * `temaTelao` — a SUPERFÍCIE DE PROJEÇÃO como tema, e não como tabela de valores.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE UM TEMA (design system §14.1), e não uma paleta entregue a quem
 * desenha a tela: a catraca (`scripts/ds-medidas.mjs`) reprova `#hex` e
 * `fontSize:` dentro de `app/` e `components/`. Se a paleta e a escala da parede
 * fossem valores para aplicar à mão, **a única forma de aplicá-las seria a que o
 * build recusa** — e a saída óbvia seria abrir exceção na catraca.
 *
 * Com o tema, a tela do telão escreve `variant="h1"` e
 * `sx={{ color: "text.primary" }}` — as mesmas palavras de qualquer outra tela —
 * e recebe a tinta e o tamanho da parede. Zero cor literal, zero tamanho
 * literal, zero exceção.
 *
 * ISTO NÃO É MODO ESCURO. Modo escuro é preferência do leitor, liga e desliga, e
 * obriga cada tela a existir duas vezes; ele continua fora do produto (padrão da
 * casa §13). Isto é uma **superfície**: uma rota só (`/telao/[token]`), sempre
 * assim, sem alternância, sem `prefers-color-scheme`, sem `dark:`. Ela existe
 * porque a física da projeção é outra, não porque alguém prefere.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A RÉGUA DESTA SUPERFÍCIE (design system §13.1): 4.5:1 **deratado** em k=0.15
 * para texto e 3:1 deratado para o resto — cerca de 10:1 medido num monitor. É
 * por isso que a paleta da página não serve aqui, e é por isso que existem duas
 * tintas e não três.
 */

/**
 * A escala, e de onde cada número saiu (design system §14.2).
 *
 * A régua audiovisual, escrita uma vez: tela de 3 m de largura (1,69 m de
 * altura, 16:9), o mais distante da sala a 15 m. Leitura casual pede altura de
 * caixa alta ≥ distância / 150 → 15000/150 = **100 mm**. Em 1080 linhas de
 * sinal, 100 mm de 1690 mm são 64 px; com a caixa alta da Montserrat a 0,70 em,
 * isso é 92 px de corpo = **4,8vw** num quadro de 1920. É daí que sai o `h3`, e
 * é ele — não o nome do casal — que fixa o piso de leitura da sala.
 *
 * `vw` E NÃO `cqw`: a maquete do `designer` usa `cqw` porque lá o telão é uma
 * caixa dentro de uma página de revisão. Aqui ele **é** a janela, e `cqw` sem um
 * contêiner declarado simplesmente não resolve.
 */
const ESCALA = {
  /** Nome do casal, até 24 caracteres, uma linha. 99 mm de caixa alta, 14,8 m. */
  h1: "5vw",
  /** Nome do casal, 25 a 60 caracteres, até duas linhas. É o piso da serifa. */
  h2: escalaProjecao.pisoDaSerifa, // 4vw
  /** "Aponte a câmera" — o piso de leitura de 15 m da sala. */
  h3: "4.8vw",
  /** O endereço curto sob o QR. 72 mm, 10,8 m. */
  subtitle1: "3.4vw",
  /** A linha de marca no rodapé. É o piso da superfície: 46 px, 7,5 m. */
  body1: escalaProjecao.piso, // 2.4vw
} as const;

/**
 * As variantes que **não** existem no telão, e a omissão é deliberada (§14.4).
 *
 * `h4`, `h5`, `h6`, `subtitle2`, `body2`, `caption`, `overline` e `button`
 * herdam os tamanhos em `rem` da página e, numa parede, saem minúsculos.
 * **É para sair minúsculo.** Um tema que conserta tudo esconde a única
 * informação útil da revisão: que alguém tratou uma parede como se fosse um
 * card. Não existe `caption` num telão — metadado numa parede é ou ilegível ou
 * lixo visual, e nos dois casos não deveria estar lá.
 */
export const VARIANTES_DO_TELAO = ["h1", "h2", "h3", "subtitle1", "body1"] as const;

export type VarianteDoTelao = (typeof VARIANTES_DO_TELAO)[number];

/**
 * Até 24 caracteres o nome vai em `h1`; de 25 a 60, em `h2`, em até duas linhas.
 *
 * A TROCA ACONTECE PELO COMPRIMENTO DA STRING, não pelo olho de quem desenha. A
 * conta: 80vw de área segura ÷ 5vw = 16 em ÷ 0,67 em por caractere = 24
 * caracteres por linha em `h1`; ÷ 4vw = 20 em = 30 por linha em `h2`, duas
 * linhas = 60. "ANA FLAVIA E MAXWEL" tem 19 e cabe em `h1`.
 */
export const LIMITE_DO_H1 = 24;

export function varianteDoNome(nome: string): "h1" | "h2" {
  return nome.length <= LIMITE_DO_H1 ? "h1" : "h2";
}

export const temaTelao: Theme = createTheme(tema, {
  palette: {
    mode: "light",
    background: {
      /**
       * O chão da parede. Marinho a 1,2% de luminância — não preto: preto é
       * inalcançável num projetor, e um campo "preto" chapado só denuncia o piso
       * cinza do aparelho como um retângulo sujo contra a parede em volta.
       */
      default: corProjecao.fundo,
      /** O cartão claro do QR: o ÚNICO campo claro permitido, com teto de área. */
      paper: corProjecao.superficie,
    },
    text: {
      /** 16.05:1 no monitor · 6.74:1 em k=.15 · 5.38:1 em k=.20. */
      primary: corProjecao.tinta,
      /** SÓ para texto grande — e no telão todo texto é grande. 4.60:1 em k=.15. */
      secondary: corProjecao.tintaSuave,
      disabled: corProjecao.tintaSuave,
    },
    /**
     * `primary` aqui é o REALCE (o "céu claro" do manual), não o marinho da
     * página: sobre o chão escuro, o marinho mede 1.26:1 deratado — dois tons
     * escuros vizinhos viram um só na parede.
     */
    primary: { main: corProjecao.realce, contrastText: corProjecao.fundo },
    divider: corProjecao.moldura,
    /**
     * AS QUATRO CORES DE ESTADO SÃO DESLIGADAS, e isso é o item 2 das nove
     * proibições da parede (§17.2). Medidas, elas dão de 1.32 a 2.19:1
     * deratadas — não é gosto, é ilegibilidade. Elas apontam para a tinta para
     * que um `color="warning.main"` escrito por engano saia legível em vez de
     * sumir, e para que a revisão veja a intenção errada em vez de um buraco.
     */
    success: { main: corProjecao.tinta },
    warning: { main: corProjecao.tinta },
    error: { main: corProjecao.tinta },
    info: { main: corProjecao.tinta },
  },

  typography: {
    h1: {
      fontFamily: fonte.display,
      fontWeight: peso.regular,
      fontSize: ESCALA.h1,
      lineHeight: 1.1,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
    },
    h2: {
      fontFamily: fonte.display,
      fontWeight: peso.regular,
      fontSize: ESCALA.h2,
      lineHeight: 1.12,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
    },
    h3: {
      fontFamily: fonte.sans,
      fontWeight: peso.semi,
      fontSize: ESCALA.h3,
      lineHeight: 1.2,
      letterSpacing: 0,
      textTransform: "none",
    },
    subtitle1: {
      fontFamily: fonte.sans,
      fontWeight: peso.medio,
      fontSize: ESCALA.subtitle1,
      lineHeight: 1.3,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    },
    body1: {
      fontFamily: fonte.sans,
      fontWeight: peso.regular,
      fontSize: ESCALA.body1,
      lineHeight: 1.4,
    },
  },

  components: {
    /**
     * Sem sombra na parede. Um projetor não tem contraste para uma sombra: ela
     * vira uma mancha cinza em volta do elemento, que é pior que nada.
     */
    MuiPaper: { defaultProps: { elevation: 0 } },
  },
});

export default temaTelao;
