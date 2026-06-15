import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  return {
    plugins: [
      react(),
      icReactor({
        canisters: [
          {
            name: "backend",
            didFile: "backend/backend.did",
            mode: "Reactor",
            canisterId: env.CANISTER_ID_BACKEND,
          },
        ],
      }),
    ],
  }
})
