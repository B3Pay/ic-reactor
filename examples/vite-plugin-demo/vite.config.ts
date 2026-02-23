import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    icReactor({
      canisters: [
        {
          name: "backend",
          didFile: "./src/declarations/backend.did",
        },
      ],
    }),
  ],
})
