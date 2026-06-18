/**
 * @ic-reactor/start — Vite preset
 *
 * `icReactorStart` composes the existing `@ic-reactor/vite-plugin`
 * (canister env injection + Candid codegen, the sole owner of that behavior)
 * with TanStack Router file-route generation. It returns a Vite plugin array
 * so it can be spread directly into `vite.config.ts`:
 *
 * ```ts
 * import { defineConfig } from "vite"
 * import react from "@vitejs/plugin-react"
 * import { icReactorStart } from "@ic-reactor/start/plugin/vite"
 *
 * export default defineConfig({
 *   plugins: [
 *     ...icReactorStart({
 *       canisters: { backend: { didFile: "../backend/backend.did" } },
 *     }),
 *     react(),
 *   ],
 * })
 * ```
 *
 * The preset deliberately does NOT hard-code canister IDs. Canister IDs are
 * resolved at runtime through `icp-cli` and the `ic_env` cookie injected by
 * `@ic-reactor/vite-plugin`. Do not introduce `.env` canister IDs.
 *
 * V0 is CSR/static only — there is no SSR / server-function middleware here.
 */

import { createRequire } from "node:module"
import type { Plugin } from "vite"
import { icReactor } from "@ic-reactor/vite-plugin"
import {
  resolveStartConfig,
  type IcReactorStartOptions,
  type ResolvedStartConfig,
} from "../config.js"

const require = createRequire(import.meta.url)

/**
 * Synchronously try to load the TanStack Router Vite plugin.
 *
 * `@tanstack/router-plugin` is an optional peer dependency. If the package is
 * absent, this returns `null` so the preset still works as a plain SPA.
 *
 * We use a synchronous `require()` so the plugin can be resolved at Vite
 * config time and returned in the plugins array directly — Vite's `config()`
 * hook does not allow injecting plugins via its return value.
 */
function tryLoadTanStackRouterPlugin(
  opts: Required<{ autoCodeSplitting: boolean }>
): Plugin | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@tanstack/router-plugin/vite") as {
      default?: (opts: Record<string, unknown>) => Plugin
      TanStackRouterVite?: (opts: Record<string, unknown>) => Plugin
    }
    const factory = mod.default ?? mod.TanStackRouterVite
    if (typeof factory !== "function") return null
    return factory({
      target: "react",
      autoCodeSplitting: opts.autoCodeSplitting,
    })
  } catch {
    return null
  }
}

/**
 * Build the `@ic-reactor/vite-plugin` options from the resolved start config.
 *
 * `icReactor` already owns: `.did` watching, `buildStart` codegen,
 * `ic_env` cookie injection, and `/api` proxying to the local replica. We only
 * translate the starter config into its expected `CanisterConfig[]` shape.
 */
function buildVitePluginOptions(resolved: ResolvedStartConfig) {
  return {
    canisters: resolved.canisters,
    outDir: resolved.outDir,
    clientManagerPath: resolved.clientManagerPath,
    target: resolved.target,
    injectEnvironment: resolved.injectEnvironment,
  }
}

/**
 * The `icReactorStart` Vite preset.
 *
 * Returns an array of plugins so it can be spread. Always includes the
 * `@ic-reactor/vite-plugin` plugin (`ic-reactor-plugin`); conditionally
 * includes the TanStack Router plugin when `router` is not `false`.
 *
 * If the TanStack Router plugin cannot be loaded, a warning plugin is emitted
 * in its place so the app still builds (file-route generation simply won't run
 * until the user installs `@tanstack/router-plugin`).
 */
export function icReactorStart(options: IcReactorStartOptions): Plugin[] {
  const resolved = resolveStartConfig(options)
  const plugins: Plugin[] = []

  // 1. IC Reactor core plugin — env injection + codegen (single owner).
  plugins.push(icReactor(buildVitePluginOptions(resolved)))

  // 2. TanStack Router file-route generation (optional peer dep).
  if (resolved.router) {
    const routerPlugin = tryLoadTanStackRouterPlugin(resolved.router)
    if (routerPlugin) {
      plugins.push(routerPlugin)
    } else {
      // Soft-fail: the app still builds as a plain SPA. The user can install
      // @tanstack/router-plugin to get file-route generation, or set
      // `router: false` to silence this warning.
      const warning: Plugin = {
        name: "ic-reactor-start:router-missing",
        config() {
          console.warn(
            "[ic-reactor/start] @tanstack/router-plugin could not be loaded. " +
              "Install it as a devDependency to enable file-route generation, " +
              "or set `router: false` in icReactorStart() to silence this."
          )
        },
      }
      plugins.push(warning)
    }
  }

  return plugins
}

export type { IcReactorStartOptions, ResolvedStartConfig }
