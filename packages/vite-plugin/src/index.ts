/**
 * @ic-reactor/vite-plugin
 *
 * Vite plugin that:
 * 1. Generates hooks at build time (using @ic-reactor/codegen pipeline)
 * 2. Injects `ic_env` cookie for local development (via proxy)
 * 3. Hot-reloads when .did files change
 */

import type { Plugin, ResolvedConfig, UserConfig, ViteDevServer } from "vite"
import fs from "node:fs"
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
  // project directory — not for `root: "frontend"`, and not when the root is
  // passed positionally (`vite build apps/web`). Note `--config` on its own does
  // NOT move the root; it only selects the config file.
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
  /**
   * The `.did` text each entry last generated from, so a watch rebuild can
   * tell which entries need regenerating. See `buildStart`.
   */
  const generatedFrom = new Map<CanisterConfig, string>()

  /** The entry's `.did` text, or `undefined` when it cannot be read. */
  const readDidSource = (canister: CanisterConfig): string | undefined => {
    try {
      return fs.readFileSync(resolveDidPath(canister.didFile), "utf-8")
    } catch {
      return undefined
    }
  }

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
  /**
   * The failures that are still unfixed, one per configured canister entry,
   * kept so a browser that was not connected when one happened still gets the
   * overlay.
   *
   * Vite awaits the plugin container's `buildStart` before the HTTP server
   * starts listening, so a generation failure during `vite dev` startup is
   * broadcast when there are no WebSocket clients at all and the payload is
   * simply dropped. The terminal shows it; the overlay never appears — for
   * precisely the failures a developer is most likely to hit.
   *
   * A success only proves that the canister which regenerated is fixed. This
   * used to be one slot that any success emptied, so a canister that was still
   * broken vanished from the overlay as soon as another canister regenerated
   * and its reload reconnected every tab.
   *
   * Keyed by the entry rather than by `name`, since two entries can share a
   * name. See `inFlight`.
   */
  const pendingFailures = new Map<
    CanisterConfig,
    { message: string; stack: string }
  >()

  const reportFailure = (
    server: ViteDevServer | null,
    message: string,
    cause?: unknown
  ) => {
    console.error(`[ic-reactor] ${message}`)

    const err = {
      message: `[ic-reactor] ${message}`,
      stack: cause instanceof Error && cause.stack ? cause.stack : "",
      plugin: PLUGIN_NAME,
    }

    server?.ws.send({ type: "error", err })
    return { message: err.message, stack: err.stack }
  }

  // Keep at most one regeneration per canister in flight and collapse every save
  // that arrives meanwhile into a single trailing rerun, so the last saved
  // `.did` still wins without piling up concurrent runs.
  //
  // Scope, precisely: this covers the watcher path only. `buildStart` calls the
  // pipeline directly and does not register here, so a save landing during the
  // initial generation can still run concurrently with it. That is deliberate
  // rather than an oversight -- since @ic-reactor/codegen writes a canister's
  // declarations in one synchronous step, after all of them are generated,
  // concurrent runs for one canister no longer interleave inside a
  // delete-then-write sequence; the loser is simply overwritten. What this buys
  // is ordering and wasted work, not integrity.
  //
  // Note the coalesced promise resolves when the RUNNING pass finishes, not the
  // trailing rerun, so it can settle before the newest `.did` has been written.
  // The trailing run sends its own full-reload, so the browser still converges.
  //
  // Both maps are keyed by the configured entry, not by its `name`. Two entries
  // can share a name, for one canister generated twice into different outDirs,
  // say as a DisplayReactor and as a Reactor. Keyed by name, a save that touched
  // both queued the second behind the first, and the trailing rerun then
  // regenerated the first entry again. The second kept stale bindings.
  const inFlight = new Map<CanisterConfig, Promise<void>>()
  const rerunQueued = new Set<CanisterConfig>()

  const regenerate = (
    canisterConfig: CanisterConfig,
    server: ViteDevServer
  ): Promise<void> => {
    const { name } = canisterConfig
    const running = inFlight.get(canisterConfig)

    if (running) {
      rerunQueued.add(canisterConfig)
      return running
    }

    const run = runCanisterPipeline({
      canisterConfig,
      projectRoot,
      globalConfig,
    })
      .then((result) => {
        if (result.success) {
          // A later connection must not be handed a failure that has since been
          // fixed.
          pendingFailures.delete(canisterConfig)
          // Reload page to reflect new types/hooks
          server.ws.send({ type: "full-reload" })
        } else {
          pendingFailures.set(
            canisterConfig,
            reportFailure(
              server,
              `Regeneration failed for ${name}: ${result.error ?? "unknown error"}`
            )
          )
        }
      })
      // A throw from the pipeline (a malformed `.did` makes the parser throw
      // rather than return a failed result) would otherwise be an unhandled
      // rejection: invisible in the browser and, depending on the Node version,
      // fatal to the dev server.
      .catch((error: unknown) => {
        pendingFailures.set(
          canisterConfig,
          reportFailure(
            server,
            `Regeneration failed for ${name}: ${describeError(error)}`,
            error
          )
        )
      })
      .finally(() => {
        inFlight.delete(canisterConfig)
        if (rerunQueued.delete(canisterConfig)) {
          void regenerate(canisterConfig, server)
        }
      })

    inFlight.set(canisterConfig, run)
    return run
  }

  /**
   * Regenerate every entry whose `.did` is `file`, and do nothing for any
   * other file.
   *
   * Every entry, not only the first match. Deployed instances of one canister,
   * such as two ledgers, share a .did file. Stopping at the first match left
   * the others on stale bindings, and the full reload hid that.
   */
  const regenerateForDid = (file: string, server: ViteDevServer): void => {
    if (!file.endsWith(".did")) {
      return
    }

    const changedPath = path.normalize(file)
    const affectedCanisters = canisters.filter(
      (canister) => resolveDidPath(canister.didFile) === changedPath
    )

    if (affectedCanisters.length === 0) {
      return
    }

    console.log(
      `[ic-reactor] .did file changed: ${affectedCanisters
        .map((canister) => canister.name)
        .join(", ")}. Regenerating...`
    )

    // `regenerate` reports its own failures and never rejects.
    for (const canister of affectedCanisters) {
      void regenerate(canister, server)
    }
  }

  const plugin: Plugin = {
    name: PLUGIN_NAME,
    enforce: "pre", // Run before other plugins

    config(userConfig, { command: viteCommand }) {
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

      // `configResolved` has not run yet, so resolve the root the way Vite
      // will. icp finds the project from the directory it starts in, and with
      // `vite apps/web` or a `root` option that is not the process cwd.
      const { environment: icEnv, diagnostics } = getIcEnvironmentInfo(
        canisterNames,
        path.resolve(userConfig.root ?? process.cwd())
      )

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
            proxy: apiProxy(userConfig, DEFAULT_LOCAL_REPLICA),
          },
        }
      }

      // The replica can be UP -- `icp network status` succeeds, so icEnv is
      // truthy and the check above never fires -- while a configured canister
      // has never been deployed. Every `icp canister status <name>` then fails
      // and that id is simply absent, so the cookie goes out carrying a root key
      // and no PUBLIC_CANISTER_ID for it. That is the same "indistinguishable
      // from success until the app breaks on an undefined canister id" failure
      // the branch above exists to prevent, and it is the more common one.
      //
      // Only configured canisters are reported: `internet_identity` is appended
      // to canisterNames for convenience and is routinely not deployed.
      // An explicitly configured `canisterId` counts as resolved: the cookie
      // below merges configuredCanisterIds over the detected ones, so the app
      // does receive a valid PUBLIC_CANISTER_ID. Warning on those told the user
      // to deploy a canister whose id they had already supplied.
      const missingCanisterIds = canisters
        .map((canister) => canister.name)
        .filter((name): name is string => !!name)
        .filter(
          (name) => !icEnv.canisterIds[name] && !configuredCanisterIds[name]
        )

      if (missingCanisterIds.length > 0) {
        const names = missingCanisterIds.map((name) => `"${name}"`).join(", ")
        const it = missingCanisterIds.length === 1 ? "it" : "them"
        console.warn(
          `[ic-reactor] The local replica is running, but no canister ID could be resolved for ${names}. ` +
            `Deploy ${it} (\`icp deploy\`) — until then the injected ic_env carries no PUBLIC_CANISTER_ID ` +
            `for ${it} and the app will see an undefined canister id. ` +
            `Re-run with DEBUG=ic-reactor to see the \`icp\` output.`
        )
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
          proxy: apiProxy(userConfig, icEnv.proxyTarget),
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

      // Replay the unfixed failures described at pendingFailures to each client
      // that connects. A canister leaves the replay once it regenerates.
      // Guarded: the peer range spans several Vite majors and `ws.on` is not
      // present on every one of them. Losing the replay is acceptable; throwing
      // out of configureServer is not.
      server.ws.on?.("connection", () => {
        if (pendingFailures.size === 0) return
        const failures = [...pendingFailures.values()]
        server.ws.send({
          type: "error",
          err: {
            message: failures.map((failure) => failure.message).join("\n"),
            stack: failures
              .map((failure) => failure.stack)
              .filter(Boolean)
              .join("\n"),
            plugin: PLUGIN_NAME,
          },
        })
      })

      // Explicitly watch configured DID files, since they are not in the module graph.
      const didFiles = canisters.map((c) => resolveDidPath(c.didFile))
      server.watcher.add(didFiles)

      // Regenerate from the watcher's own events, not from `handleHotUpdate`.
      // Vite calls that hook only for a file changed in place, and only while
      // HMR is on. A .did created after startup, or deleted and written again
      // by a build tool or `git checkout`, arrives as an `add` event, which is
      // all Vite 4 to 7 report for it, so its bindings stayed missing or stale.
      // With `server.hmr: false`, no save regenerated at all.
      const onDidEvent = (file: string) => regenerateForDid(file, server)
      server.watcher.on("change", onDidEvent)
      server.watcher.on("add", onDidEvent)
    },

    async buildStart() {
      // ── Code Generation ──────────────────────────────────────────────────

      // `vite build --watch` rebuilds when a file it watches changes, and a
      // `.did` file is never part of the module graph. Registered here, a save
      // starts a rebuild, and the rebuild's buildStart regenerates.
      for (const canister of canisters) {
        if (typeof canister.didFile === "string") {
          this.addWatchFile(resolveDidPath(canister.didFile))
        }
      }

      // A watch rebuild calls buildStart again, whatever file started it. A
      // run rewrites the generated files even when their content is the same,
      // those files are in the module graph, and the watcher then started
      // another rebuild, which regenerated again: one edit to any source file
      // looped forever. So a rebuild regenerates only the entries whose `.did`
      // changed since they last generated. A failed entry is retried.
      const sources = canisters.map(readDidSource)
      const pending = canisters.filter(
        (canister, index) =>
          !this.meta.watchMode ||
          sources[index] === undefined ||
          generatedFrom.get(canister) !== sources[index]
      )

      if (pending.length === 0) {
        return
      }

      console.log(
        `[ic-reactor] Generating canister bindings for ${pending.length} canisters...`
      )

      const outcomes = await Promise.allSettled(
        pending.map((canisterConfig) =>
          runCanisterPipeline({
            canisterConfig,
            projectRoot,
            globalConfig,
          })
        )
      )

      outcomes.forEach((outcome, index) => {
        const canister = pending[index]
        const source = sources[canisters.indexOf(canister)]
        if (
          outcome.status === "fulfilled" &&
          outcome.value.success &&
          source !== undefined
        ) {
          generatedFrom.set(canister, source)
        } else {
          generatedFrom.delete(canister)
        }
      })

      // Collect every failure before reporting one: a canister failing must not
      // hide what the others did, and the error should name all of them so a CI
      // log shows the whole picture in one go.
      const failures = outcomes.flatMap((outcome, index) => {
        const canister = pending[index]
        const name = canister?.name ?? `canister #${index}`

        if (outcome.status === "rejected") {
          return [
            { canister, detail: `${name}: ${describeError(outcome.reason)}` },
          ]
        }
        if (!outcome.value.success) {
          return [
            {
              canister,
              detail: `${name}: ${outcome.value.error ?? "unknown error"}`,
            },
          ]
        }
        return []
      })

      if (failures.length === 0) {
        return
      }

      const message =
        `Failed to generate ${failures.length} of ${pending.length} canisters:\n` +
        failures.map(({ detail }) => `  - ${detail}`).join("\n")

      // Previously every failure here was a `console.error` and nothing more,
      // so `vite build` exited 0 and CI shipped whatever stale bindings were
      // still on disk — bindings that no longer match the deployed canister.
      if (failOnError ?? command === "build") {
        this.error(`[ic-reactor] ${message}`)
      }

      reportFailure(devServer, message)

      // One entry per canister, so fixing one of them removes only its own line
      // from the replay.
      for (const { canister, detail } of failures) {
        pendingFailures.set(canister, {
          message: `[ic-reactor] Failed to generate ${detail}`,
          stack: "",
        })
      }
    },
  }

  return plugin
}

/** One readable line for whatever the pipeline threw. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The `server.proxy` entry that sends `/api` to `target`, or nothing when the
 * user's Vite config already proxies `/api`.
 *
 * Vite deep-merges the object a `config` hook returns over the user's config,
 * so an `/api` entry returned here replaced the user's own. A project that
 * pointed `/api` at icp-cli's port 8000 got 4943 instead, and nothing reported
 * the swap. Vite's merge skips an undefined value, so returning nothing leaves
 * the user's entry in place.
 */
function apiProxy(userConfig: UserConfig, target: string) {
  if (userConfig.server?.proxy?.["/api"]) {
    debugLog(
      `The Vite config already proxies /api, so the plugin keeps that proxy instead of sending /api to ${target}.`
    )
    return undefined
  }

  return { "/api": { target, changeOrigin: true } }
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
