import { defineConfig } from "vite"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    icReactor({
      canisters: [
        {
          name: "contacts",
          didFile: "./contact.did",
        },
      ],
    }),
  ],
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      cod: new URL("../../src/ts/index.ts", import.meta.url).pathname,
    },
  },
  optimizeDeps: {
    exclude: ["@ic-reactor/candid", "@ic-reactor/cod"],
  },
})
