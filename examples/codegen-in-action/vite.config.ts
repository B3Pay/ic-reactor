import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactorPlugin } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    icReactorPlugin({
      outDir: "./src/canisters-vite",
      canisters: [
        {
          advanced: true,
          name: "backend",
          didFile: "./backend/backend.did",
          clientManagerPath: "../../lib/client",
        },
      ],
    }),
  ],
})
