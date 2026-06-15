import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["../react/test-setup.ts"],
    exclude: ["dist", "node_modules"],
  },
})
