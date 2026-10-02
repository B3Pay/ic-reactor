import { defineConfig } from "vitest/config"

// The tests run over the committed generated module (`pnpm gen:check` keeps it
// current), so they need neither the React plugin nor the generator. The
// sandbox's own tests run in Node; a `.test.tsx` renders the page in jsdom.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
})
