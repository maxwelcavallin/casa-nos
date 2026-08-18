import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";

import { Providers } from "@/components/Providers";
import { cor } from "@/lib/tokens";

import "./globals.css";

/**
 * As duas famílias do design system, por `next/font/google`.
 *
 * Self-host: o Next baixa os arquivos no build e serve do mesmo domínio. Não há
 * chamada ao Google em tempo de execução — o que tira um handshake com terceiro
 * do caminho crítico de uma página que abre no 4G, e tira o cookie de terceiro
 * junto.
 *
 * `display: "swap"` é escolha deliberada: o convidado lê o nome do casal na
 * fonte de sistema por um instante e depois ela troca, em vez de olhar um
 * retângulo em branco esperando a Fraunces. Texto tarde é pior que texto feio.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400", "500"],
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  // O título real de cada página vem do evento (ver app/page.tsx). Este é o
  // fallback de quem chega a uma URL sem evento.
  title: "casa-nos",
  description: "O site do casamento.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: cor.primaryDark,
  width: "device-width",
  initialScale: 1,
  // Sem `maximumScale` e sem `userScalable: false`: travar o zoom é a violação
  // de acessibilidade mais comum de página mobile, e aqui há gente lendo um
  // endereço no celular com a luz do sol batendo.
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
