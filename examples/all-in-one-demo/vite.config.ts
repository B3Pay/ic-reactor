import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      "process.env.CANISTER_ID_BACKEND": JSON.stringify(
        env.CANISTER_ID_BACKEND
      ),
      "process.env.CANISTER_ID": JSON.stringify(env.CANISTER_ID),
      "process.env.DFX_NETWORK": JSON.stringify(env.DFX_NETWORK),
    },
  }
})
