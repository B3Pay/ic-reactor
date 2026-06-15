import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    icReactor({
      outDir: "./frontend/lib/canisters",
      canisters: [
        {
          name: "backend",
          didFile: "./frontend/declarations/backend.did",
          clientManagerPath: "../../clients",
        },
      ],
    }),
  ],
})
