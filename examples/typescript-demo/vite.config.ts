import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [devtools()],
})
