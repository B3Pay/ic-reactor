import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["@noble/hashes"],
  },
  resolve: {
    alias: [
      { find: "@noble/hashes/sha2", replacement: "@noble/hashes/sha2.js" },
      { find: "@noble/hashes/utils", replacement: "@noble/hashes/utils.js" },
      { find: "@noble/hashes/blake2", replacement: "@noble/hashes/blake2.js" },
      {
        find: "@noble/curves/bls12-381",
        replacement: "@noble/curves/bls12-381.js",
      },
      {
        find: "@noble/curves/ed25519",
        replacement: "@noble/curves/ed25519.js",
      },
    ],
    preserveSymlinks: true,
  },
})
