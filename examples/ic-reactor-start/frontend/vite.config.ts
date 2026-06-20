import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactorStart } from "@ic-reactor/start/plugin/vite"

export default defineConfig({
  plugins: [
    icReactorStart({
      canisters: {
        backend: {
          didFile: "../backend/backend.did",
        },
      },
    }),
    react(),
  ],
})
