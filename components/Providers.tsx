"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import { tema } from "@/lib/theme";

/**
 * Providers da aplicação.
 *
 * `AppRouterCacheProvider` não é opcional no App Router: sem ele o Emotion
 * injeta o estilo só depois da hidratação, e a primeira pintura sai sem estilo
 * nenhum. Numa página que a maioria vai abrir uma vez, de relance, esse flash é
 * a impressão inteira.
 *
 * `CssBaseline` é o que aplica os overrides do tema — inclusive as variáveis
 * `--cn-*` no `:root`, que é a razão de `app/globals.css` não ter nenhuma cor.
 *
 * O teste de fumaça importa ESTE arquivo, e não uma cópia da árvore: no dia em
 * que um provider novo entrar aqui e não lá, as telas passariam no teste e
 * quebrariam em produção.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={tema}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}

export default Providers;
