/**
 * @ic-reactor/start — Configuration Types
 *
 * V0 of `@ic-reactor/start` is a client-rendered, fully on-chain ICP React
 * starter. It composes IC Reactor, TanStack Router, and `icp-cli` rather than
 * forking TanStack Start. SSR / server functions are explicitly out of scope
 * for V0; see the roadmap in `docs/plans/ic-reactor-start-v0.md`.
 *
 * These types describe the starter-level canister config that users hand to
 * `defineIcReactorStartConfig` and the `icReactorStart` Vite preset. They are
 * normalized into the `CanisterConfig[]` shape owned by
 * `@ic-reactor/vite-plugin` / `@ic-reactor/codegen`, which remain the sole
 * owners of canister env injection and binding generation.
 */

import type { CanisterConfig, CodegenTarget } from "@ic-reactor/codegen"

/**
 * A single canister declared by the starter, keyed by name.
 *
 * This is the starter-friendly shape. It mirrors the fields the generated app
 * actually needs from a `.did` file, and omits codegen-internal options that
 * are not relevant to V0 apps. Anything not set here falls back to the
 * `@ic-reactor/vite-plugin` defaults.
 */
export interface StartCanisterConfig {
  /**
   * Path to the canister's `.did` (Candid interface) file.
   *
   * Relative paths resolve from the Vite project root (the directory that
   * contains `vite.config.ts`). For the default `frontend/` + `backend/`
   * layout this is typically `"../backend/backend.did"`.
   *
   * Canister IDs are intentionally NOT configured here. V0 resolves canister
   * IDs at runtime through `icp-cli` and the `ic_env` cookie injected by
   * `@ic-reactor/vite-plugin`. Do not introduce `.env` canister IDs.
   */
  didFile: string
  /**
   * Override the output directory for this canister's generated declarations.
   * Defaults to the preset's `outDir` ( `"src/declarations"` ).
   */
  outDir?: string
  /**
   * Relative import path to the shared `clientManager`, as seen from the
   * generated reactor file. Defaults to the preset's `clientManagerPath`.
   */
  clientManagerPath?: string
  /**
   * Generated runtime target. `react` emits bound React hooks; `core` emits
   * only the typed reactor exports. Defaults to `"react"`.
   */
  target?: CodegenTarget
}

/**
 * Canisters declared as a map keyed by name, e.g.
 *
 * ```ts
 * {
 *   backend: { didFile: "../backend/backend.did" },
 * }
 * ```
 *
 * The key becomes the canister `name`, which drives all generated naming and
 * must match the canister name used in `icp.yaml`.
 */
export type StartCanisters = Record<string, StartCanisterConfig>

/**
 * Options for the `icReactorStart` Vite preset and `defineIcReactorStartConfig`.
 *
 * `canisters` may be provided either as a map (recommended, keyed by name) or
 * as an already-normalized array of `CanisterConfig`.
 */
export interface IcReactorStartOptions {
  /**
   * Canister declarations. Accepts the starter-friendly object form
   * (`{ backend: { didFile } }`) or a raw `CanisterConfig[]`.
   */
  canisters: StartCanisters | CanisterConfig[]
  /**
   * Default output directory for generated declarations.
   * Default: `"src/declarations"`.
   */
  outDir?: string
  /**
   * Default import path to the shared `clientManager`, relative from generated
   * files. Default: `"../../lib/client"`.
   */
  clientManagerPath?: string
  /**
   * Default generated runtime target. Default: `"react"`.
   */
  target?: CodegenTarget
  /**
   * Inject the `ic_env` cookie for local development? Default: `true`.
   * Owned by `@ic-reactor/vite-plugin`.
   */
  injectEnvironment?: boolean
  /**
   * Include the TanStack Router Vite plugin with starter defaults?
   * Default: `true`. Disable only if you are wiring your own router plugin.
   */
  router?: boolean | RouterPresetOptions
  /**
   * Proxy the local `/api` path to the `icp-cli` local gateway/replica?
   * Default: `true`. Owned by `@ic-reactor/vite-plugin`.
   */
  proxyApi?: boolean
}

/**
 * Options forwarded to the TanStack Router Vite plugin when `router` is an
 * object. Defaults match the IC Reactor starter conventions.
 */
export interface RouterPresetOptions {
  /** Auto code-split route components? Default: `true`. */
  autoCodeSplitting?: boolean
}

/**
 * The fully-normalized, internal representation derived from
 * {@link IcReactorStartOptions}. `canisters` is always a `CanisterConfig[]`
 * ready to hand to `@ic-reactor/vite-plugin`.
 */
export interface ResolvedStartConfig {
  canisters: CanisterConfig[]
  outDir: string
  clientManagerPath: string
  target: CodegenTarget
  injectEnvironment: boolean
  router: false | Required<RouterPresetOptions>
  proxyApi: boolean
}

export const DEFAULT_OUT_DIR = "src/declarations"
export const DEFAULT_CLIENT_MANAGER_PATH = "../../lib/client"
export const DEFAULT_TARGET: CodegenTarget = "react"

/**
 * Validate that a value is a non-empty string usable as a canister name.
 * Canister names drive generated variable and file names, so they must be
 * valid identifiers and match the name used in `icp.yaml`.
 */
export function isValidCanisterName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)
  )
}

/**
 * Normalize the starter's canister config into the `CanisterConfig[]` shape
 * owned by `@ic-reactor/vite-plugin` / `@ic-reactor/codegen`.
 *
 * - Object form (`{ name: { didFile } }`) → array with `name` taken from key.
 * - Array form → validated and passed through.
 *
 * Throws on invalid names or missing `didFile`.
 */
export function normalizeCanisters(
  canisters: StartCanisters | CanisterConfig[]
): CanisterConfig[] {
  if (Array.isArray(canisters)) {
    return canisters.map((c, i) => {
      if (!isValidCanisterName(c.name)) {
        throw new Error(
          `@ic-reactor/start: invalid canister name at index ${i}: ${String(
            c.name
          )}. Names must be valid identifiers and match icp.yaml.`
        )
      }
      if (typeof c.didFile !== "string" || c.didFile.length === 0) {
        throw new Error(
          `@ic-reactor/start: canister "${c.name}" is missing a didFile path.`
        )
      }
      return c
    })
  }

  if (canisters && typeof canisters === "object") {
    const entries = Object.entries(canisters)
    if (entries.length === 0) {
      return []
    }
    return entries.map(([name, cfg]) => {
      if (!isValidCanisterName(name)) {
        throw new Error(
          `@ic-reactor/start: invalid canister name "${name}". Names must be valid identifiers and match icp.yaml.`
        )
      }
      if (typeof cfg.didFile !== "string" || cfg.didFile.length === 0) {
        throw new Error(
          `@ic-reactor/start: canister "${name}" is missing a didFile path.`
        )
      }
      const normalized: CanisterConfig = { name, didFile: cfg.didFile }
      if (cfg.outDir !== undefined) normalized.outDir = cfg.outDir
      if (cfg.clientManagerPath !== undefined)
        normalized.clientManagerPath = cfg.clientManagerPath
      if (cfg.target !== undefined) normalized.target = cfg.target
      return normalized
    })
  }

  throw new Error(
    "@ic-reactor/start: canisters must be an object map or an array of CanisterConfig."
  )
}

/**
 * Resolve all {@link IcReactorStartOptions} to their normalized internal form.
 * Exported so the Vite preset and tests share one resolution path.
 */
export function resolveStartConfig(
  options: IcReactorStartOptions
): ResolvedStartConfig {
  const {
    outDir = DEFAULT_OUT_DIR,
    clientManagerPath = DEFAULT_CLIENT_MANAGER_PATH,
    target = DEFAULT_TARGET,
    injectEnvironment = true,
    router = true,
    proxyApi = true,
  } = options

  const routerResolved: false | Required<RouterPresetOptions> =
    router === false
      ? false
      : {
          autoCodeSplitting:
            router === true ? true : (router.autoCodeSplitting ?? true),
        }

  return {
    canisters: normalizeCanisters(options.canisters),
    outDir,
    clientManagerPath,
    target,
    injectEnvironment,
    router: routerResolved,
    proxyApi,
  }
}

/**
 * Define an `@ic-reactor/start` config with full type inference and validation.
 *
 * This is the documented entry point for `ic-reactor.json`-style usage and for
 * apps that want to build the config object once and reuse it. The Vite preset
 * accepts the same options directly, so calling this is optional.
 *
 * @example
 * ```ts
 * import { defineIcReactorStartConfig } from "@ic-reactor/start"
 *
 * export const config = defineIcReactorStartConfig({
 *   canisters: {
 *     backend: { didFile: "../backend/backend.did" },
 *   },
 * })
 * ```
 */
export function defineIcReactorStartConfig(
  options: IcReactorStartOptions
): ResolvedStartConfig {
  return resolveStartConfig(options)
}
