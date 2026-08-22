import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    // The app imports its hooks from `src/lib/canisters/backend`, so the plugin
    // has to generate there. The defaults (outDir "src/declarations" plus
    // clientManagerPath "../../clients") only line up when the ClientManager
    // sits at `src/clients`; here it lives at `src/lib/clients`, so both are
    // set explicitly. Leaving them at the defaults is what broke this example:
    // it generated bindings under `src/declarations/backend` that imported a
    // non-existent `src/clients`, while the app went on importing a frozen
    // hand-copied set that no regeneration ever touched.
    icReactor({
      outDir: "./src/lib/canisters",
      canisters: [
        {
          name: "backend",
          didFile: "./declarations/backend.did",
          clientManagerPath: "../../clients",
        },
      ],
    }),
  ],
})
