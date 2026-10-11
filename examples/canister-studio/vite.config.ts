import { icReactor } from "@ic-reactor/vite-plugin"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  server: { port: 3410 },
  plugins: [
    // Writes src/canisters/<name>.ts (and its envelope) from each .did when
    // `vite dev` or `vite build` starts, and again when a .did changes. The
    // files are committed too, so `pnpm gen:check` fails a stale copy and
    // `tsc` runs before any build.
    icReactor({
      canisters: {
        // Any ICRC-1 ledger: ckBTC, ckETH, or a pasted id.
        icrc1: { didFile: "did/icrc1.did", outDir: "src/canisters" },
        // The ICP ledger's full interface, as its candid:service metadata
        // published it.
        icp_ledger: { didFile: "did/icp_ledger.did", outDir: "src/canisters" },
        // The ckBTC minter's full interface, from its candid:service metadata.
        ckbtc_minter: {
          didFile: "did/ckbtc_minter.did",
          outDir: "src/canisters",
        },
      },
      // Mainnet only: there is no local `icp` network to ask for the ic_env
      // cookie, and the plugin's /api proxy would only get in the way.
      injectEnvironment: false,
    }),
    tanstackStart(),
    // Must come after tanstackStart().
    react(),
  ],
  // The IC agent, with its BLS certificate check, is most of the main chunk.
  build: { chunkSizeWarningLimit: 900 },
})
