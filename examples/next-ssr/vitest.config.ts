import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// The tests run over the committed generated module (`pnpm gen:check` keeps
// it current) and never reach mainnet: every client in them is a
// `createTestClient()` over an in-memory replica. Server modules run in Node;
// a test that renders for the browser says `@vitest-environment jsdom`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
})
