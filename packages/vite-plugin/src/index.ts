/**
 * @ic-reactor/vite-plugin
 *
 * Vite plugin that:
 * 1. Generates hooks at build time (using @ic-reactor/codegen pipeline)
 * 2. Injects `ic_env` cookie for local development (via proxy)
 * 3. Hot-reloads when .did files change
 */

import type {
  Plugin,
  ProxyOptions,
  ResolvedConfig,
  UserConfig,
  ViteDevServer,
} from "vite"
import fs from "node:fs"
import path from "node:path"
import {
  findSharedOutDirs,
  runCanisterPipeline,
  sharedOutDirMessage,
  type CanisterConfig,
  type CodegenConfig,
  type CodegenTarget,
} from "@ic-reactor/codegen"
import {
  createLocalEnvironment,
  icEnvMiddleware,
  type LocalEnvironment,
  type LocalEnvironmentState,
} from "./dev-environment.js"

const PLUGIN_NAME = "ic-reactor-plugin"

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
   * Inject the local IC environment under `vite dev` and `vite preview`: set
   * the `ic_env` cookie on each response and proxy `/api` to the network the
   * `icp` CLI reports.
   *
   * Until `icp` reports a network and every configured canister has an ID
   * (a configured `canisterId` counts), each page load asks `icp` again, so a
   * deploy after the server started needs only a reload. Once detection is
   * complete, page loads run no `icp` command, and a redeploy into a fresh
   * network needs a restart. An `/api` proxy that the Vite config or another
   * plugin sets is left alone.
   *
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

  /**
   * The local IC environment `vite dev` and `vite preview` inject. The
   * `config` hook creates it when `injectEnvironment` is on.
   */
  let localEnvironment: LocalEnvironment | undefined

  /** The options of the plugin's `/api` proxy, as Vite hands them over. */
  const apiProxyOptions = new Set<ProxyOptions>()

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

  /** How an error names an entry: its position, since names can repeat. */
  const describeEntry = (canister: CanisterConfig) =>
    `canisters[${canisters.indexOf(canister)}] (${JSON.stringify(canister.name)})`

  /**
   * The CLI's error for an entry that generates into the directory of an
   * earlier entry, or `undefined` when it has a directory of its own.
   *
   * The pipeline's owner marker records a name, so two entries with the same
   * `name` and `outDir` both passed it. Both generated into one directory at
   * once, and which one's output survived changed from run to run while the
   * build succeeded. Every configured entry takes part, including ones this run
   * does not regenerate. Called right before each entry's pipeline starts: an
   * earlier entry's pipeline creates its directory before its first await, so
   * a later entry reaching that directory through a symlink or a spelling that
   * differs only in case is caught too, as the CLI catches it.
   */
  const sharedOutDirError = (canister: CanisterConfig): string | undefined => {
    const first = findSharedOutDirs(
      canisters.map((entry) => [entry, entry] as const),
      outDir,
      projectRoot
    ).get(canister)
    return first === undefined
      ? undefined
      : sharedOutDirMessage(describeEntry(canister), describeEntry(first))
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

    const sharedError = sharedOutDirError(canisterConfig)
    if (sharedError !== undefined) {
      pendingFailures.set(
        canisterConfig,
        reportFailure(server, `Regeneration failed for ${sharedError}`)
      )
      return Promise.resolve()
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

    async config(userConfig, { command: viteCommand }) {
      command = viteCommand

      if (viteCommand !== "serve" || !injectEnvironment) {
        return {}
      }

      // ── Local Development Proxy & Cookies ────────────────────────────────

      // The plugin's own `/api` entry, unless the Vite config has one.
      const ownsApiProxy = !userConfig.server?.proxy?.["/api"]

      const environment = createLocalEnvironment({
        canisterNames: canisters
          .map((canister) => canister.name)
          .filter((name): name is string => !!name),
        configuredCanisterIds,
        // `configResolved` has not run yet, so resolve the root the way Vite
        // will. icp finds the project from the directory it starts in, and
        // with `vite apps/web` or a `root` option that is not the process cwd.
        projectRoot: path.resolve(userConfig.root ?? process.cwd()),
        onDiagnostic: debugLog,
        onUpdate: (previous, next) => {
          for (const proxyOptions of apiProxyOptions) {
            proxyOptions.target = next.proxyTarget
          }
          if (previous) {
            // Only a proxy the plugin kept following moves with detection.
            reportDetectionProgress(previous, next, apiProxyOptions.size > 0)
          }
        },
      })
      localEnvironment = environment

      const state = await environment.detect()
      warnAboutIncompleteDetection(state, canisters.length > 0, ownsApiProxy)

      return {
        server: {
          // The cookie is not a static `server.headers` entry: the middleware
          // that configureServer adds sets it per response, from the latest
          // detection. See dev-environment.ts.
          proxy: apiProxy(userConfig, state.proxyTarget, (proxyOptions) => {
            // A plugin whose config hook runs after this one can proxy /api
            // as well. Vite merges its entry over the one returned here and
            // keeps this `configure`, so a target other than the one returned
            // here is that plugin's, and it stays where that plugin put it.
            if (proxyOptions.target !== state.proxyTarget) {
              debugLog(
                "Another plugin changed the target of the /api proxy, so the plugin leaves that proxy alone."
              )
              return
            }
            // Vite hands the proxy these options on every request, so a new
            // target set here takes effect on the next one.
            apiProxyOptions.add(proxyOptions)
            proxyOptions.target =
              environment.state?.proxyTarget ?? state.proxyTarget
          }),
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

      // Added here rather than returned as a post hook, so it runs before
      // Vite's own middlewares, which serve the page.
      if (localEnvironment) {
        server.middlewares.use(icEnvMiddleware(localEnvironment))
      }

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

    // `vite preview` resolves the config with the `serve` command too, and
    // used to inherit the cookie from `server.headers`.
    configurePreviewServer(server) {
      if (localEnvironment) {
        server.middlewares.use(icEnvMiddleware(localEnvironment))
      }
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
      // run used to rewrite the generated files even when their content was
      // the same, those files are in the module graph, and the watcher then
      // started another rebuild, which regenerated again: one edit to any
      // source file looped forever. Codegen now leaves an unchanged file alone,
      // and a rebuild still regenerates only the entries whose `.did` changed
      // since they last generated, which skips parsing and formatting the
      // rest. A failed entry is retried.
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

      // Each entry is checked just before its pipeline starts, so the check
      // sees the directories the entries before it have claimed.
      const outcomes = await Promise.allSettled(
        pending.map((canisterConfig) => {
          const sharedError = sharedOutDirError(canisterConfig)
          if (sharedError !== undefined) {
            return Promise.reject(new SharedOutDirError(sharedError))
          }
          return runCanisterPipeline({
            canisterConfig,
            projectRoot,
            globalConfig,
          })
        })
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
          // The shared-outDir error names the entry itself.
          const detail =
            outcome.reason instanceof SharedOutDirError
              ? outcome.reason.message
              : `${name}: ${describeError(outcome.reason)}`
          return [{ canister, detail }]
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

/** An entry refused because an earlier entry generates into its directory. */
class SharedOutDirError extends Error {}

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
 *
 * `configure` receives the options object Vite builds the proxy from. Every
 * supported Vite major copies it for each request, so the target can follow
 * detection while the server runs.
 */
function apiProxy(
  userConfig: UserConfig,
  target: string,
  configure: (options: ProxyOptions) => void
): Record<string, ProxyOptions> | undefined {
  if (userConfig.server?.proxy?.["/api"]) {
    debugLog(
      `The Vite config already proxies /api, so the plugin keeps that proxy instead of sending /api to ${target}.`
    )
    return undefined
  }

  return {
    "/api": {
      target,
      changeOrigin: true,
      configure: (_proxy, options) => configure(options),
    },
  }
}

/** `"a"`, or `"a", "b"`: canister names as the warnings quote them. */
function quoteNames(names: string[]): string {
  return names.map((name) => `"${name}"`).join(", ")
}

/**
 * Warn at startup when detection is incomplete, and say what the plugin does
 * about it: it asks `icp` again on each page load until detection completes.
 *
 * Failing detection used to be indistinguishable from success: no cookie was
 * set, no warning was printed, and the app only broke later on an undefined
 * canister id.
 */
function warnAboutIncompleteDetection(
  state: LocalEnvironmentState,
  hasCanisters: boolean,
  ownsApiProxy: boolean
): void {
  if (!state.environment) {
    // Env-only mode (no canisters configured) has nothing to inject.
    if (!hasCanisters) return
    const proxyNote = ownsApiProxy
      ? ` and /api goes to ${state.proxyTarget} for now`
      : ""
    console.warn(
      `[ic-reactor] Could not detect the local IC environment, so no ic_env cookie is set${proxyNote}. ` +
        `Is the local network running? The plugin asks \`icp\` again on each page load until it answers` +
        `${ownsApiProxy ? ", then sends /api to the network it reports" : ""}: start the network ` +
        `(\`icp network start\`) and reload the page. Re-run with DEBUG=ic-reactor to see the \`icp\` output.`
    )
    return
  }

  // The network can be up while a configured canister has never been
  // deployed. Every `icp canister status <name>` then fails and that id is
  // absent, so the cookie carries a root key and no PUBLIC_CANISTER_ID for it,
  // which is the same silent failure. Only configured canisters count, and one
  // with a configured `canisterId` is resolved.
  const missing = state.missingCanisterIds
  if (missing.length > 0) {
    const it = missing.length === 1 ? "it" : "them"
    console.warn(
      `[ic-reactor] The local replica is running, but no canister ID could be resolved for ${quoteNames(missing)}. ` +
        `Until one is, the ic_env cookie carries no PUBLIC_CANISTER_ID for ${it} and the app will see an ` +
        `undefined canister id. Deploy ${it} (\`icp deploy\`) and reload the page: the plugin asks \`icp\` ` +
        `again on each page load until every configured canister has an ID. ` +
        `Re-run with DEBUG=ic-reactor to see the \`icp\` output.`
    )
  }
}

/**
 * Report what a detection after startup found that the one before had not.
 *
 * @param followsApiProxy - Whether the `/api` proxy moves with detection. It
 * does not when the Vite config or another plugin set its target.
 */
function reportDetectionProgress(
  previous: LocalEnvironmentState,
  next: LocalEnvironmentState,
  followsApiProxy: boolean
): void {
  if (!previous.environment && next.environment) {
    console.log(
      `[ic-reactor] Detected the local IC network: the ic_env cookie now carries its root key` +
        (followsApiProxy ? ` and /api goes to ${next.proxyTarget}.` : ".")
    )
  }

  const resolved = previous.missingCanisterIds.filter(
    (name) => !next.missingCanisterIds.includes(name)
  )
  if (next.environment && resolved.length > 0) {
    console.log(
      `[ic-reactor] The ic_env cookie now carries the canister ID${
        resolved.length === 1 ? "" : "s"
      } for ${quoteNames(resolved)}.`
    )
  }

  if (next.complete && !previous.complete) {
    console.log(
      "[ic-reactor] Every configured canister has an ID, so page loads no longer run `icp`. " +
        "Restart the dev server after redeploying into a fresh network."
    )
  }
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
