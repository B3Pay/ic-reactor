/**
 * @ic-reactor/vite-plugin
 *
 * Vite plugin that injects the `ic_env` cookie and proxies `/api` to the local
 * IC network under `vite dev` and `vite preview`.
 *
 * On the v4 line this is the environment half of the 3.x plugin. The 3.x
 * binding generation ran `@ic-reactor/codegen`, which is deleted on this
 * branch; generation returns as a `candid-core-cli gen` child process in the
 * slim-plugin slice (IR7).
 */

import type { Plugin, ProxyOptions, UserConfig } from "vite"
import path from "node:path"
import {
  createLocalEnvironment,
  icEnvMiddleware,
  type LocalEnvironment,
  type LocalEnvironmentState,
} from "./dev-environment.js"

const PLUGIN_NAME = "ic-reactor-plugin"

export interface IcReactorPluginOptions {
  /**
   * The canisters whose IDs the `ic_env` cookie carries: each one's name in
   * the `icp` project, and optionally a fixed ID, which wins over the ID
   * `icp` reports.
   */
  canisters: { name: string; canisterId?: string }[]
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
}

export function icReactor(options: IcReactorPluginOptions): Plugin {
  const { canisters, injectEnvironment = true } = options

  const configuredCanisterIds = Object.fromEntries(
    canisters
      .filter((canister) => !!canister.canisterId)
      .map((canister) => [canister.name, canister.canisterId as string])
  )

  /**
   * The local IC environment `vite dev` and `vite preview` inject. The
   * `config` hook creates it when `injectEnvironment` is on.
   */
  let localEnvironment: LocalEnvironment | undefined

  /** The options of the plugin's `/api` proxy, as Vite hands them over. */
  const apiProxyOptions = new Set<ProxyOptions>()

  const plugin: Plugin = {
    name: PLUGIN_NAME,
    enforce: "pre", // Run before other plugins

    async config(userConfig, { command: viteCommand }) {
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

    configureServer(server) {
      // Added here rather than returned as a post hook, so it runs before
      // Vite's own middlewares, which serve the page.
      if (localEnvironment) {
        server.middlewares.use(icEnvMiddleware(localEnvironment))
      }
    },

    // `vite preview` resolves the config with the `serve` command too, and
    // used to inherit the cookie from `server.headers`.
    configurePreviewServer(server) {
      if (localEnvironment) {
        server.middlewares.use(icEnvMiddleware(localEnvironment))
      }
    },
  }

  return plugin
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
