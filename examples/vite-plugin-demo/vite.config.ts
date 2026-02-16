import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactorPlugin } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    icReactorPlugin({
      canisters: [
        {
          name: "backend",
          didFile: "./src/declarations/backend.did",
        },
      ],
    }),
  ],
})
