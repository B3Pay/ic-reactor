import { icReactor } from "@ic-reactor/vite-plugin"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    icReactor({
      // Each canister by its name in icp.yaml, which is also its name in the
      // ic_env cookie. The plugin writes src/canisters/<did name>.ts (and its
      // envelope) from each .did when `vite dev` or `vite build` starts, and
      // again when a .did changes. The files are committed too, so
      // `pnpm gen:check` fails a stale copy.
      canisters: {
        // A project canister: under `vite dev` and `vite preview` the plugin
        // asks `icp` for its id and puts it in the cookie.
        backend: { didFile: "backend/backend.did" },
        // Not a project canister, so its id is given: `icp` has none to report.
        ledger: {
          didFile: "ledger.did",
          canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
        },
      },
      // On by default, written out: set the ic_env cookie on every page load
      // and proxy /api to the network `icp network status` reports.
      injectEnvironment: true,
    }),
  ],
  server: { port: 5175, strictPort: true },
  preview: { port: 5185, strictPort: true },
  // The IC agent, with its BLS certificate check, is most of the main chunk.
  build: { chunkSizeWarningLimit: 700 },
})
