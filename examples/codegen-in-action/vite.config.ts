import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    icReactor({
      outDir: "./src/canisters-vite",
      canisters: [
        {
          name: "backend",
          didFile: "./backend/backend.did",
          clientManagerPath: "../../lib/client",
        },
      ],
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
})
