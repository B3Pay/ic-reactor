/**
 * @ic-reactor/vite-plugin
 *
 * Vite plugin that:
 * 1. Generates hooks at build time (using @ic-reactor/codegen pipeline)
 * 2. Injects `ic_env` cookie for local development (via proxy)
 * 3. Hot-reloads when .did files change
 */

import type { Plugin, ResolvedConfig, ViteDevServer } from "vite"
import path from "node:path"
import {
  runCanisterPipeline,
  type CanisterConfig,
  type CodegenConfig,
  type CodegenTarget,
} from "@ic-reactor/codegen"
import { getIcEnvironmentInfo, buildIcEnvCookie } from "./env.js"

const PLUGIN_NAME = "ic-reactor-plugin"
const DEFAULT_LOCAL_REPLICA = "http://127.0.0.1:4943"

export interface IcReactorPluginOptions {
  /**
   * Canister configurations.
   * `name` is required for each canister.
   */
  canisters: CanisterConfig[]
  /**
   * Default output directory (relative to the Vite project root).
   * Default: "src/declarations"
   */
  outDir?: string
  /**
   * Default client manager import path.
   * Default: "../../clients"
   */
  clientManagerPath?: string
  /**
   * Default generated runtime target.
   * Default: "react"
   */
  target?: CodegenTarget
  /**
   * Automatically inject `ic_env` cookie for local development?
   * Default: true
   */
  injectEnvironment?: boolean
  /**
   * Abort the Vite run when a canister fails to generate.
   *
   * Default: `true` under `vite build`, `false` under `vite dev`. A build that
   * silently ships the bindings left over from the last successful run is worse
   * than no build at all, while a dev server has to survive the broken
   * intermediate states of a `.did` file being edited — there the failure is
   * reported to the terminal and the browser error overlay instead.
   */
  failOnError?: boolean
}

export function icReactor(options: IcReactorPluginOptions): Plugin {
  const {
    canisters,
    outDir = "src/declarations",
    clientManagerPath = "../../clients",
    target = "react",
    injectEnvironment = true,
    failOnError,
  } = options

  // Construct a partial CodegenConfig to pass to the pipeline
  const globalConfig: Pick<
    CodegenConfig,
    "outDir" | "clientManagerPath" | "target"
  > = {
    outDir,
    clientManagerPath,
    target,
  }

  // Vite resolves relative project paths against the resolved `config.root`,
  // which only equals the process cwd when vite happens to be started from the
  // project directory — not for `root: "frontend"`, and not for a monorepo
  // running `vite build --config apps/web/vite.config.ts` from the repo root.
  // `configResolved` overwrites this before any hook that resolves a path runs;
  // the cwd is only the pre-resolution default, which is also Vite's own
  // default root.
  let projectRoot = process.cwd()

  // `vite build` and `vite dev` want opposite failure behaviour, so remember
  // which one we are in. Both `config` and `configResolved` carry the command;
  // build is the safer default for the case where neither has run.
  let command: ResolvedConfig["command"] = "build"

  // Set once the dev server exists, so a `buildStart` failure in dev can reach
  // the browser overlay too — in dev, `configureServer` runs before Vite calls
  // `buildStart` on the plugin container.
  let devServer: ViteDevServer | null = null

  const resolveDidPath = (didFile: string) =>
    path.normalize(
      path.isAbsolute(didFile) ? didFile : path.resolve(projectRoot, didFile)
    )
  const configuredCanisterIds = Object.fromEntries(
    canisters
      .filter((canister) => !!canister.canisterId)
      .map((canister) => [canister.name, canister.canisterId as string])
  )

  /**
   * Report a generation failure everywhere a developer might be looking.
   *
   * Terminal output scrolls away behind request logs and HMR chatter, so in dev
   * the browser error overlay is the signal that actually gets noticed.
   */
  const reportFailure = (
    server: ViteDevServer | null,
    message: string,
    cause?: unknown
  ) => {
    console.error(`[ic-reactor] ${message}`)

    server?.ws.send({
      type: "error",
      err: {
        message: `[ic-reactor] ${message}`,
        stack: cause instanceof Error && cause.stack ? cause.stack : "",
        plugin: PLUGIN_NAME,
      },
    })
  }

  // A `.did` save can land while the previous regeneration is still inside the
  // pipeline's delete-then-write sequence, and the second run would wipe the
  // directory the first one is writing into. Keep at most one run per canister
  // in flight and collapse every save that arrives meanwhile into a single
  // trailing rerun, so the last saved `.did` still wins without the races.
  const inFlight = new Map<string, Promise<void>>()
  const rerunQueued = new Set<string>()

  const regenerate = (
    canisterConfig: CanisterConfig,
    server: ViteDevServer
  ): Promise<void> => {
    const { name } = canisterConfig
    const running = inFlight.get(name)

    if (running) {
      rerunQueued.add(name)
      return running
    }

    const run = runCanisterPipeline({
      canisterConfig,
      projectRoot,
      globalConfig,
    })
      .then((result) => {
        if (result.success) {
          // Reload page to reflect new types/hooks
          server.ws.send({ type: "full-reload" })
        } else {
          reportFailure(
            server,
            `Regeneration failed for ${name}: ${result.error ?? "unknown error"}`
          )
        }
      })
      // A throw from the pipeline (a malformed `.did` makes the parser throw
      // rather than return a failed result) would otherwise be an unhandled
      // rejection: invisible in the browser and, depending on the Node version,
      // fatal to the dev server.
      .catch((error: unknown) => {
        reportFailure(
          server,
          `Regeneration failed for ${name}: ${describeError(error)}`,
          error
        )
      })
      .finally(() => {
        inFlight.delete(name)
        if (rerunQueued.delete(name)) {
          void regenerate(canisterConfig, server)
        }
      })

    inFlight.set(name, run)
    return run
  }

  const plugin: Plugin = {
    name: PLUGIN_NAME,
    enforce: "pre", // Run before other plugins

    config(_config, { command: viteCommand }) {
      command = viteCommand

      if (viteCommand !== "serve" || !injectEnvironment) {
        return {}
      }

      // ── Local Development Proxy & Cookies ────────────────────────────────

      // Always include internet_identity if not present (common need)
      const canisterNames = canisters
        .map((c) => c.name)
        .filter((n): n is string => !!n)
      if (!canisterNames.includes("internet_identity")) {
        canisterNames.push("internet_identity")
      }

      const { environment: icEnv, diagnostics } =
        getIcEnvironmentInfo(canisterNames)

      if (!icEnv) {
        // Failing detection used to be indistinguishable from success: no
        // cookie was set, no warning was printed, and the app only broke much
        // later on an undefined canister id. Stay quiet in env-only mode
        // (no canisters configured), where there is nothing to inject anyway.
        if (canisters.length > 0) {
          console.warn(
            `[ic-reactor] Could not detect the local IC environment, falling back to ${DEFAULT_LOCAL_REPLICA}. ` +
              `Canister IDs and the root key will not be injected — is the local replica running? ` +
              `Re-run with DEBUG=ic-reactor to see the \`icp\` output.`
          )
        }

        for (const diagnostic of diagnostics) {
          debugLog(diagnostic)
        }

        const envOnlyCookie =
          canisters.length === 0
            ? buildIcEnvCookie(
                {},
                undefined,
                "http://id.ai.localhost:8000/authorize"
              )
            : undefined

        // Fallback: proxy /api to default local replica. In env-only mode,
        // still provide the standard ICP CLI built-in local II URL.
        return {
          server: {
            headers: envOnlyCookie
              ? {
                  "Set-Cookie": `ic_env=${envOnlyCookie}; Path=/; SameSite=Lax;`,
                }
              : undefined,
            proxy: {
              "/api": {
                target: DEFAULT_LOCAL_REPLICA,
                changeOrigin: true,
              },
            },
          },
        }
      }

      for (const diagnostic of diagnostics) {
        debugLog(diagnostic)
      }

      const cookieValue = buildIcEnvCookie(
        {
          ...icEnv.canisterIds,
          ...configuredCanisterIds,
        },
        icEnv.rootKey,
        icEnv.internetIdentityProvider
      )

      return {
        server: {
          headers: {
            "Set-Cookie": `ic_env=${cookieValue}; Path=/; SameSite=Lax;`,
          },
          proxy: {
            "/api": {
              target: icEnv.proxyTarget,
              changeOrigin: true,
            },
          },
        },
      }
    },

    configResolved(config) {
      // Everything the plugin resolves — `didFile`, `outDir`,
      // `clientManagerPath` — is documented as relative to the project root, so
      // it has to be Vite's resolved root and not wherever the process started.
      projectRoot = config.root
      command = config.command
    },

    configureServer(server) {
      devServer = server

      // Explicitly watch configured DID files so HMR works even when they are not in the module graph.
      const didFiles = canisters.map((c) => resolveDidPath(c.didFile))
      server.watcher.add(didFiles)
    },

    async buildStart() {
      // ── Code Generation ──────────────────────────────────────────────────

      console.log(
        `[ic-reactor] Generating canister bindings for ${canisters.length} canisters...`
      )

      const outcomes = await Promise.allSettled(
        canisters.map((canisterConfig) =>
          runCanisterPipeline({
            canisterConfig,
            projectRoot,
            globalConfig,
          })
        )
      )

      // Collect every failure before reporting one: a canister failing must not
      // hide what the others did, and the error should name all of them so a CI
      // log shows the whole picture in one go.
      const failures = outcomes.flatMap((outcome, index) => {
        const name = canisters[index]?.name ?? `canister #${index}`

        if (outcome.status === "rejected") {
          return [`${name}: ${describeError(outcome.reason)}`]
        }
        if (!outcome.value.success) {
          return [`${name}: ${outcome.value.error ?? "unknown error"}`]
        }
        return []
      })

      if (failures.length === 0) {
        return
      }

      const message =
        `Failed to generate ${failures.length} of ${canisters.length} canisters:\n` +
        failures.map((failure) => `  - ${failure}`).join("\n")

      // Previously every failure here was a `console.error` and nothing more,
      // so `vite build` exited 0 and CI shipped whatever stale bindings were
      // still on disk — bindings that no longer match the deployed canister.
      if (failOnError ?? command === "build") {
        this.error(`[ic-reactor] ${message}`)
      }

      reportFailure(devServer, message)
    },

    handleHotUpdate({ file, server }) {
      // ── Hot Reload on .did changes ───────────────────────────────────────
      if (!file.endsWith(".did")) {
        return
      }

      const changedPath = path.normalize(file)
      const affectedCanister = canisters.find(
        // Check if changed file matches configured didFile
        (canister) => resolveDidPath(canister.didFile) === changedPath
      )

      if (!affectedCanister) {
        return
      }

      console.log(
        `[ic-reactor] .did file changed: ${affectedCanister.name}. Regenerating...`
      )

      // Returned so Vite waits for the write to finish before applying the
      // update; it resolves to `undefined`, which leaves the affected module
      // list untouched.
      return regenerate(affectedCanister, server)
    },
  }

  return plugin
}

/** One readable line for whatever the pipeline threw. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * `icp` failing to answer is routine — no local replica, or a canister that has
 * never been deployed — so its stderr is noise until someone is actually
 * debugging. Gate it the way Vite gates its own debug output.
 */
function debugLog(message: string): void {
  const enabled = (process.env.DEBUG ?? "").split(",").some((entry) => {
    const scope = entry.trim()
    return (
      scope === "*" || scope === "ic-reactor" || scope.startsWith("ic-reactor:")
    )
  })

  if (enabled) {
    console.debug(`[ic-reactor:debug] ${message}`)
  }
}
