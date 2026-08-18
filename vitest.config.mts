import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const alias = { "@": fileURLToPath(new URL("./", import.meta.url)) }

/**
 * Dois conjuntos de teste, com ambientes diferentes.
 *
 * `lib` roda em node: é lógica pura — data, fuso, escopo de inquilino,
 * serialização — e não toca em DOM.
 *
 * `telas` roda em jsdom, e só ele carrega o setup de navegador.
 *
 * **`TZ: "UTC"` nos dois, e isso não é detalhe.** A máquina de quem desenvolve
 * roda em horário de Brasília, e a Vercel roda em UTC. Todo bug de data deste
 * produto — a página anunciar 21 de agosto para um casamento no dia 22 — só
 * existe em UTC. Rodar o teste no fuso local seria rodar no único ambiente onde
 * o defeito não aparece.
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "lib",
          environment: "node",
          include: ["test/**/*.test.ts"],
          env: { TZ: "UTC" },
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "telas",
          environment: "jsdom",
          setupFiles: ["./test/setup-dom.ts"],
          include: ["test/**/*.test.tsx"],
          env: { TZ: "UTC" },
          // O padrão de 5s é apertado: a primeira tela que puxa o MUI paga a
          // transformação da biblioteca inteira.
          testTimeout: 30_000,
        },
      },
    ],
  },
})
