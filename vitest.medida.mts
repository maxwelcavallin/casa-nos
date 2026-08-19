import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

/**
 * AS MEDIDAS — arquivos `*.medida.test.tsx`, fora do `pnpm verificar`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ELAS NAO ENTRAM NA SUITE PADRAO: elas montam 6.000 nos no DOM e levam
 * dezenas de segundos. `pnpm verificar` roda no hook de pre-commit e no CI, e
 * uma suite que demora ensina quem trabalha a pular a suite — que e a pior coisa
 * que uma catraca pode causar.
 *
 * E elas nao sao teste: nao existe numero para afirmar. Um jsdom nao e um
 * Android de 3 anos, e cravar um limite de milissegundos aqui seria inventar um
 * criterio. O que elas produzem e a **contagem de nos** e a ordem de grandeza,
 * que e o que decide se a virtualizacao entra (H-21, gatilho do `po`).
 *
 * Uso:  pnpm medida
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    name: "medida",
    environment: "jsdom",
    setupFiles: ["./test/setup-dom.ts"],
    include: ["test/**/*.medida.test.tsx"],
    env: { TZ: "UTC" },
    testTimeout: 300_000,
  },
})
