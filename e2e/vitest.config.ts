/// <reference types="vitest" />
import { defineConfig } from "vitest/config"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./setup.ts"],
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
  plugins: [
    icReactor({
      canisters: [
        {
          name: "hello_actor",
          didFile: "src/actor/hello_actor.did",
          outDir: "src",
        },
      ],
    }),
  ],
})
