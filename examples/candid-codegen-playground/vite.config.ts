import { defineConfig } from "vite"

export default defineConfig({
  define: {
    "process.env": {},
  },
  optimizeDeps: {
    exclude: ["@ic-reactor/cod"],
  },
})
