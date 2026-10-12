import { icReactor } from "@ic-reactor/vite-plugin"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    // Writes src/canisters/<name>.ts (and its envelope) from each .did when
    // `vite dev` or `vite build` starts, and again when a .did changes. The
    // files are committed too, so `pnpm gen:check` can fail a stale copy.
    icReactor({
      canisters: {
        // Any ICRC-1 ledger: the ICP ledger, ckBTC, a pasted id.
        icrc1: { didFile: "icrc1.did", outDir: "src/canisters" },
        // The next two are projections of mainnet canisters' interfaces to
        // the methods the app calls, and every type they reach. They are
        // committed, so the plugin reads them and fetches nothing: builds
        // work offline. `IC_REACTOR_FETCH=<name>` fetches and projects one
        // again, and `IC_REACTOR_VERIFY=1` checks both against the live
        // canisters.
        // The ICP ledger's own block reads, with their archive callbacks.
        icp_ledger: {
          didFile: "icp_ledger.did",
          outDir: "src/canisters",
          canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
          methods: ["query_blocks"],
        },
        // The ckBTC minter's get_btc_address, an update read as a query.
        ckbtc_minter: {
          didFile: "ckbtc_minter.did",
          outDir: "src/canisters",
          canisterId: "mqygn-kiaaa-aaaar-qaadq-cai",
          methods: ["get_btc_address"],
        },
      },
      // Both tabs talk to a replica of their own (mainnet, or the fake one in
      // the page), so there is no local network to ask `icp` about.
      injectEnvironment: false,
    }),
  ],
  server: { port: 5173 },
  // The IC agent, with its BLS certificate check, is most of the main chunk.
  build: { chunkSizeWarningLimit: 600 },
})
