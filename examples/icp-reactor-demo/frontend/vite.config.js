import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactor } from "@ic-reactor/vite-plugin"
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    icReactor({
      canisters: [
        {
          name: "backend",
          didFile: "../backend/backend.did",
          mode: "DisplayReactor",
        },
      ],
      clientManagerPath: "../../lib/client",
      outDir: "./src/generated",
    }),
  ],
})
