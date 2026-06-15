import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import tanstackRouter from "@tanstack/router-plugin/vite"
import { icReactor } from "@ic-reactor/vite-plugin"
import { fileURLToPath, URL } from "node:url"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    devtools(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    icReactor({ canisters: [] }),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
