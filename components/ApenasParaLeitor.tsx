import Box from "@mui/material/Box";

/**
 * TEXTO QUE SÓ O LEITOR DE TELA RECEBE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **NÃO É `display: none`, e a diferença é o ponto inteiro.** `display: none` e
 * `visibility: hidden` tiram o elemento da árvore de acessibilidade também — o
 * texto some para todo mundo, inclusive para quem ele existe para servir. O
 * recorte abaixo é o padrão que mantém o nó na árvore e o tira da pintura.
 *
 * DOIS USOS, e os dois nasceram de um pedido explícito do `pmm`:
 *
 *   1. **A linha de contagem da galeria** (`gtm.md` §5.17). A galeria serve doze
 *      imagens com `alt=""` (§20.5 do design system), e sem esta linha a região
 *      soa **quebrada** para quem ouve, em vez de soar como "há doze fotos aqui,
 *      e ninguém as descreveu". A proibição de contador VISÍVEL continua de pé
 *      (§20.6, item 9): este elemento não aparece para ninguém que enxerga.
 *
 *   2. **A confirmação do botão de copiar** (`gtm.md` §5.18). O rótulo troca de
 *      `Copiar` para `Copiado` e a troca é **vista**; quem não vê a tela toca no
 *      botão e não recebe confirmação nenhuma. Com `role="status"`, o leitor
 *      anuncia sozinho.
 *
 * `role="status"` só quando o texto APARECE depois de uma ação. Para conteúdo
 * que já nasce na página — a contagem da galeria — ele seria errado: uma região
 * viva anunciaria a frase fora da ordem de leitura, no meio de outra coisa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function ApenasParaLeitor({
  children,
  /** `true` só quando o texto surge por causa de uma ação da pessoa. */
  aoVivo = false,
  component = "span",
}: {
  children: React.ReactNode;
  aoVivo?: boolean;
  component?: React.ElementType;
}) {
  return (
    <Box
      component={component}
      {...(aoVivo ? { role: "status", "aria-live": "polite" as const } : {})}
      sx={{
        position: "absolute",
        width: 1,
        height: 1,
        p: 0,
        m: "-1px",
        overflow: "hidden",
        // `clip` continua aqui ao lado de `clipPath` de propósito: é a versão
        // que navegadores antigos entendem, e ela não atrapalha os novos.
        clip: "rect(0 0 0 0)",
        clipPath: "inset(50%)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {children}
    </Box>
  );
}

export default ApenasParaLeitor;
