import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      reporter: ["text", "json", "html"],
    },
    include: [
      "packages/*/src/**/*.test.{ts,tsx,js,jsx}",
      "packages/*/tests/**/*.test.{ts,tsx,js,jsx}",
    ],
    exclude: [
      "node_modules",
      "dist",
      "build",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
    ],
  },
})
