import { icReactor } from "@ic-reactor/vite-plugin"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    // Writes src/canisters/icrc1.ts (and its envelope) from icrc1.did when
    // `vite dev` or `vite build` starts, and again when the .did changes. The
    // files are committed too, so `pnpm gen:check` can fail a stale copy.
    icReactor({
      canisters: { icrc1: { didFile: "icrc1.did", outDir: "src/canisters" } },
      // Both tabs talk to a replica of their own (mainnet, or the fake one in
      // the page), so there is no local network to ask `icp` about.
      injectEnvironment: false,
    }),
  ],
  server: { port: 5173 },
  // The IC agent, with its BLS certificate check, is most of the main chunk.
  build: { chunkSizeWarningLimit: 600 },
})
