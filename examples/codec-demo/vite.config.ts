import { defineConfig } from "vite"

export default defineConfig({
  define: {
    "process.env.DFX_NETWORK": JSON.stringify("ic"),
  },
})
