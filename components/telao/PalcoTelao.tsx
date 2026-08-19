"use client";

import Box from "@mui/material/Box";
import { ThemeProvider } from "@mui/material/styles";

import { temaTelao } from "@/lib/theme-telao";
import { escalaProjecao, variaveisCssProjecao } from "@/lib/tokens";

/**
 * `PalcoTelao` — a casca da superfície de projeção (design system §16.10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELE PINTA O PRÓPRIO CHÃO, E ISSO NÃO É ESTILO — É A NOTA OBRIGATÓRIA DO
 * `lead-design` PARA QUEM IMPLEMENTA:
 *
 * > **O `MuiCssBaseline` NÃO é reexecutado num `ThemeProvider` aninhado.**
 *
 * O `CssBaseline` roda uma vez, no `Providers` da raiz, e é ele que pinta o
 * `body` com `cor.bg` — o algodão. Trocar o tema aqui dentro troca as cores dos
 * **componentes**, e não a do `body`: o chão continua algodão. Numa parede de
 * três metros, isso é **um flash branco de três metros no primeiro quadro**, no
 * meio da festa, antes de a primeira foto aparecer.
 *
 * A correção é este `Box`: `position: fixed; inset: 0` com
 * `bgcolor: "background.default"` — que dentro do `temaTelao` é o marinho a 1,2%
 * de luminância. Ele cobre a viewport inteira antes de qualquer conteúdo, e o
 * flash deixa de existir.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `vw` E NÃO `cqw`. A maquete do `designer` usa unidades de contêiner porque lá
 * o telão é uma caixa dentro de uma página de revisão. Em produção ele **é** a
 * janela: `cqw` sem um contêiner declarado não resolve, e o texto sairia no
 * tamanho da página — 16 px numa parede de 3 metros. O `temaTelao` fala `vw`.
 *
 * A MARGEM SEGURA DE 5% é a única geometria que este componente impõe:
 * projetor e TV ainda cortam até 5% da borda. **A foto pode sangrar; texto, QR e
 * a linha de marca, nunca.** Por isso a margem vive aqui, na casca, e a área da
 * foto é desenhada por fora dela.
 *
 * A LARGURA: `scripts/ds-medidas.mjs` credita este componente na lista de
 * delegação de `trataLargura`, com a decisão escrita no próprio script. A
 * superfície de projeção **é** a largura — ela tem uma proporção (16:9) e um
 * tamanho físico que ninguém controla, e um teto centralizado deixaria faixas
 * pretas nas laterais de uma parede de três metros.
 */

export type PropriedadesDoPalco = {
  children: React.ReactNode;
  /**
   * `true` na prévia do painel de materiais (H-04), onde o palco é um cartão
   * dentro de uma página em vez da janela inteira.
   *
   * Ela existe para que a "Arte do telão" que o casal baixa seja **a mesma
   * coisa** que o projetor mostra, e não um desenho parecido feito à mão. O
   * preço é que, na prévia, as unidades de viewport medem a janela do painel, e
   * não o cartão — o resultado é ilustrativo, e está dito na tela.
   */
  comoPrevia?: boolean;
};

export function PalcoTelao({ children, comoPrevia = false }: PropriedadesDoPalco) {
  return (
    <ThemeProvider theme={temaTelao}>
      <Box
        // As variáveis `--cn-proj-*` são injetadas NO ESCOPO desta rota, e não
        // no `:root`: elas não devem existir em nenhuma outra tela, e variável
        // global de outra superfície é convite para alguém pintar um card do
        // painel com a tinta do telão.
        style={variaveisCssProjecao as React.CSSProperties}
        sx={{
          ...(comoPrevia
            ? { position: "relative", width: "100%", aspectRatio: "16 / 9" }
            : { position: "fixed", inset: 0 }),
          // O chão. Ver o comentário do topo: sem esta linha, o primeiro quadro
          // é branco.
          bgcolor: "background.default",
          color: "text.primary",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: escalaProjecao.margemSegura,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default PalcoTelao;
