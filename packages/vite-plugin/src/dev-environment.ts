/**
 * The local IC environment that `vite dev` and `vite preview` inject, kept up
 * to date while detection is incomplete.
 *
 * The dev server usually starts before the canisters are deployed, and
 * sometimes before the local network is up. Detection used to run once, in the
 * `config` hook, and its answer was fixed into `server.headers` and
 * `server.proxy` for the server's lifetime. A canister deployed afterwards
 * never reached the `ic_env` cookie, and a network started afterwards never
 * received `/api`, until the dev server was restarted.
 *
 * Detection now runs again for each page load while it is incomplete, that is
 * while `icp` reports no network or a configured canister has no ID. Once
 * every configured canister has an ID on a detected network it stops, and page
 * loads run no `icp` command. A redeploy into a fresh network, with new IDs and
 * a new root key, still needs a restart.
 *
 * Nothing re-detects a network that went away: the restart is the signal
 * (#881). What the plugin does is stop vouching for it. While a server serves
 * the environment, it holds a connection to the detected network (see
 * `watchNetwork`), so it learns that the network stopped when it stops, not
 * when a request next reaches it. A network started again can give the same
 * IDs to other canisters under the same root key, so from then on page loads
 * get the cookie without them, and the plugin says to restart the dev server.
 * A page load with no cookie to send clears one a browser kept from an earlier
 * server as well.
 */

import type { IncomingMessage, ServerResponse } from "node:http"
import net from "node:net"
import { describeError } from "./describe-value.js"
import {
  buildIcEnvCookie,
  getIcEnvironmentInfo,
  type IcEnvironment,
} from "./env.js"
import { DEFAULT_LOCAL_REPLICA, isLocalHostname } from "./local-host.js"

/**
 * The Internet Identity provider the cookie names when no canister is
 * configured and `icp` reports no network: icp-cli's built-in one, on its
 * default port.
 */
const DEFAULT_INTERNET_IDENTITY_PROVIDER =
  "http://id.ai.localhost:8000/authorize"

/** What the dev server injects, from the latest detection. */
export interface LocalEnvironmentState {
  /** What `icp` reported, or `null` while it has reported no network. */
  environment: IcEnvironment | null
  /** The `ic_env` cookie's value, or `undefined` when no cookie is set. */
  cookie: string | undefined
  /** Where the plugin's `/api` proxy sends requests. */
  proxyTarget: string
  /** Configured canisters with neither a detected nor a configured ID. */
  missingCanisterIds: string[]
  /**
   * `icp` reported a network and every configured canister has an ID, so
   * detection does not run again.
   */
  complete: boolean
  /**
   * The last detection could not start `icp` at all, so the network was never
   * asked about.
   */
  icpNotFound: boolean
  /**
   * A network was detected and then stopped (see `LocalEnvironment.watch`),
   * so a network started again may have given its IDs to other canisters.
   * The cookie carries neither the IDs nor the root key, and detection does
   * not run again, until the dev server restarts.
   */
  lost: boolean
}

export interface LocalEnvironmentOptions {
  /** The configured canisters' names. */
  canisterNames: string[]
  /**
   * IDs set in the plugin config, by canister name. They win over detected
   * ones.
   */
  configuredCanisterIds: ReadonlyMap<string, string>
  /** The directory `icp` runs in. */
  projectRoot: string
  /** Receives each line that explains why an `icp` command failed. */
  onDiagnostic: (message: string) => void
  /**
   * Called after each detection with the state before it, `undefined` for the
   * first, and the state after it.
   */
  onUpdate?: (
    previous: LocalEnvironmentState | undefined,
    next: LocalEnvironmentState
  ) => void
}

export interface LocalEnvironment {
  /** The latest detection's result, once one has finished. */
  readonly state: LocalEnvironmentState | undefined
  /**
   * Ask `icp` again and resolve with the new state. A call while a detection
   * runs shares it. Never rejects. Once the network is lost, it resolves with
   * the current state and runs nothing.
   */
  detect(): Promise<LocalEnvironmentState>
  /**
   * Watch the network that a detection found, now or later, until `close`.
   * When it stops, the environment is lost (see `LocalEnvironmentState.lost`)
   * and `onLost` is called with the lost state, once. A server that serves
   * the environment calls this.
   */
  watch(onLost: (state: LocalEnvironmentState) => void): void
  /** Stop watching, for good. */
  close(): void
}

export function createLocalEnvironment(
  options: LocalEnvironmentOptions
): LocalEnvironment {
  const {
    canisterNames,
    configuredCanisterIds,
    projectRoot,
    onDiagnostic,
    onUpdate,
  } = options

  // Two entries can share a name. internet_identity is looked up as well, but
  // it is routinely not deployed, so it is not needed for detection to be
  // complete. Another name with a configured `canisterId` is not looked up:
  // that ID wins over what `icp` says (`toState`), and each lookup is an `icp`
  // process, one more per page load while detection is incomplete (#980).
  // internet_identity is looked up even then, because what `icp` says about
  // it decides whether the built-in provider is named in the cookie.
  const requiredNames = [...new Set(canisterNames)]
  const lookupNames = (
    requiredNames.includes("internet_identity")
      ? requiredNames
      : [...requiredNames, "internet_identity"]
  ).filter(
    (name) => name === "internet_identity" || !configuredCanisterIds.get(name)
  )

  let state: LocalEnvironmentState | undefined
  let running: Promise<LocalEnvironmentState> | undefined
  // Set by `watch`, until `close`.
  let onLost: ((state: LocalEnvironmentState) => void) | undefined
  let closed = false
  let watched: { target: string; stop: () => void } | undefined

  const toState = (
    environment: IcEnvironment | null,
    icpNotFound = false
  ): LocalEnvironmentState => {
    // By name in a `Map`, as everywhere a canister's name is a key: a canister
    // named `__proto__` keeps its ID, and one named `toString` or
    // `constructor` without one is missing, where a plain object would find
    // `Object.prototype`'s.
    const canisterIds = new Map([
      ...(environment?.canisterIds ?? []),
      ...configuredCanisterIds,
    ])
    const missingCanisterIds = requiredNames.filter(
      (name) => !canisterIds.get(name)
    )

    let cookie: string | undefined
    if (environment) {
      cookie = buildIcEnvCookie(
        canisterIds,
        environment.rootKey,
        environment.internetIdentityProvider
      )
    } else if (requiredNames.length === 0) {
      // Env-only mode: there are no canister IDs to carry, but the app can
      // still sign in with icp-cli's built-in Internet Identity.
      cookie = buildIcEnvCookie(
        new Map(),
        undefined,
        DEFAULT_INTERNET_IDENTITY_PROVIDER
      )
    }

    return {
      environment,
      cookie,
      proxyTarget: environment?.proxyTarget ?? DEFAULT_LOCAL_REPLICA,
      missingCanisterIds,
      complete: environment !== null && missingCanisterIds.length === 0,
      icpNotFound: environment === null && icpNotFound,
      lost: false,
    }
  }

  const run = async (): Promise<LocalEnvironmentState> => {
    const previous = state
    let next: LocalEnvironmentState
    try {
      const { environment, diagnostics, icpNotFound } =
        await getIcEnvironmentInfo(lookupNames, projectRoot)
      diagnostics.forEach(onDiagnostic)
      next = toState(
        mergeDetections(previous?.environment ?? null, environment),
        icpNotFound
      )
    } catch (error) {
      // getIcEnvironmentInfo reports failures in its result. This is for
      // anything else, which must not fail the page request that waits here.
      onDiagnostic(
        `Detecting the local IC environment failed: ${describeError(error)}`
      )
      next = previous ?? toState(null)
    }
    // The network was lost while `icp` ran: it stays lost, since what `icp`
    // answered may describe a restarted network.
    if (state?.lost) return state
    state = next

    try {
      onUpdate?.(previous, state)
    } catch (error) {
      onDiagnostic(
        `Applying the detected IC environment failed: ${describeError(error)}`
      )
    }
    follow()
    return state
  }

  /** Watch the detected network, if there is one to watch. */
  const follow = () => {
    if (!onLost || closed || !state || state.lost) return
    if (state.environment === null) return
    const target = state.proxyTarget
    if (watched?.target === target) return
    watched?.stop()
    watched = { target, stop: watchNetwork(target, lose) }
  }

  const lose = () => {
    if (!state || state.lost || closed) return
    watched = undefined
    // What a server that never found a network sends: in env-only mode, the
    // built-in Internet Identity provider, and otherwise no cookie.
    state = {
      ...state,
      cookie: toState(null).cookie,
      complete: false,
      lost: true,
    }
    try {
      onLost?.(state)
    } catch (error) {
      onDiagnostic(
        `Reporting the stopped IC network failed: ${describeError(error)}`
      )
    }
  }

  return {
    get state() {
      return state
    },
    detect() {
      if (state?.lost) return Promise.resolve(state)
      running ??= run().finally(() => {
        running = undefined
      })
      return running
    },
    watch(listener) {
      onLost = listener
      follow()
    },
    close() {
      closed = true
      watched?.stop()
      watched = undefined
    },
  }
}

/** How long the watch waits before it connects again after a close. */
const RECONNECT_MS = 250
/** How long it waits between attempts while the network is still starting. */
const RETRY_MS = 1_000

/**
 * Watch the network at `target`, and call `onStopped` once when it stops.
 * Returns a function that ends the watch.
 *
 * The watch holds a TCP connection to the network and sends nothing on it.
 * When the network closes it, because it stopped or because it drops idle
 * connections, the watch connects again: a refusal means nothing listens there
 * anymore, so the network stopped. Until a first connection succeeds the
 * network may still be starting, and a refusal is tried again.
 */
function watchNetwork(target: string, onStopped: () => void): () => void {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return () => {}
  }
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1")
  const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80)

  let reached = false
  let ended = false
  let socket: net.Socket | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const connect = () => {
    let connected = false
    let refused = false
    socket = net.connect({ host, port })
    // Neither the connection nor the timer keeps the process running.
    socket.unref()
    socket.on("connect", () => {
      connected = true
      reached = true
    })
    socket.on("error", (error) => {
      refused = !connected && isConnectionRefused(error)
    })
    socket.on("close", () => {
      if (ended) return
      if (reached && refused) {
        ended = true
        onStopped()
        return
      }
      timer = setTimeout(connect, connected ? RECONNECT_MS : RETRY_MS)
      timer.unref()
    })
  }
  connect()

  return () => {
    ended = true
    clearTimeout(timer)
    socket?.destroy()
  }
}

/**
 * Whether a connection failed because nothing listens at its address. (Node's
 * `AggregateError` for a host with several addresses carries the `code` too.)
 */
function isConnectionRefused(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ECONNREFUSED"
  )
}

/**
 * Combine a detection with the one before it.
 *
 * `icp` can fail for a moment, during a deploy say. A detection that finds no
 * network keeps the last one that did, and on the same network, which the
 * root key identifies, a canister keeps the ID it had. A cookie that works is
 * not taken away by a command that failed once.
 */
function mergeDetections(
  previous: IcEnvironment | null,
  next: IcEnvironment | null
): IcEnvironment | null {
  if (!next) return previous
  if (!previous || previous.rootKey !== next.rootKey) return next
  const canisterIds = new Map([...previous.canisterIds, ...next.canisterIds])
  return {
    ...next,
    canisterIds,
    // The built-in provider stands in only for a project that has no
    // internet_identity canister, as getIcEnvironmentInfo decides it.
    internetIdentityProvider: canisterIds.get("internet_identity")
      ? undefined
      : next.internetIdentityProvider,
  }
}

/**
 * Whether `req` loads a page, which is when the app reads the `ic_env` cookie.
 *
 * Browsers put `text/html` in the Accept header of a navigation, and not in
 * that of a script, a stylesheet, a `fetch` call or an HMR request.
 */
export function isDocumentRequest(req: IncomingMessage): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false
  const { accept } = req.headers
  return typeof accept === "string" && accept.includes("text/html")
}

/** Add the `ic_env` cookie to `res`, keeping any other cookie set on it. */
function setIcEnvCookie(res: ServerResponse, value: string): void {
  replaceIcEnvCookie(res, `ic_env=${value}; Path=/; SameSite=Lax;`)
}

/**
 * Clear an `ic_env` cookie the browser holds, keeping any other cookie set on
 * `res`. An empty value with `Max-Age=0` and the same `Path` removes the
 * session cookie `setIcEnvCookie` sets.
 */
function clearIcEnvCookie(res: ServerResponse): void {
  replaceIcEnvCookie(res, "ic_env=; Path=/; SameSite=Lax; Max-Age=0")
}

/** Put `cookie` in `res`'s `Set-Cookie` in place of any `ic_env` entry. */
function replaceIcEnvCookie(res: ServerResponse, cookie: string): void {
  const existing = res.getHeader("Set-Cookie")
  const others = (
    existing === undefined
      ? []
      : Array.isArray(existing)
        ? existing
        : [String(existing)]
  ).filter((entry) => !entry.startsWith("ic_env="))
  res.setHeader("Set-Cookie", others.length > 0 ? [...others, cookie] : cookie)
}

/**
 * Whether a request's `Host` names this machine: `localhost`, `*.localhost`,
 * 127.0.0.0/8 or `[::1]`, the hosts on which `@ic-reactor/core` believes the
 * cookie. A request with no `Host`, or one that is not a host, counts as
 * loopback, so it is not warned about.
 */
function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return true
  let hostname: string
  try {
    hostname = new URL(`http://${host}`).hostname
  } catch {
    return true
  }
  return isLocalHostname(hostname)
}

/**
 * The warning for a page loaded by a host that is not loopback, such as a LAN
 * address after `vite --host`, a Docker host name or a tunnel.
 */
function nonLoopbackPageWarning(host: string): string {
  return (
    `[ic-reactor] a page was loaded from ${host}, which is not localhost. ` +
    `network: "env" is for localhost pages: on this host @ic-reactor/core does not believe the ic_env cookie, ` +
    `so { name } canisters do not resolve and certified calls fail verification. ` +
    `A LAN address or a known tunnel or codespace domain sends its calls to this dev server; any other host falls back to mainnet (https://icp-api.io), where { id } canisters are mainnet's. ` +
    `Open the app on localhost, or give the client a { host, rootKey } network and { id } canisters. (Logged once.)`
  )
}

/**
 * Connect middleware that sets the `ic_env` cookie on each response.
 *
 * For a page load while detection is incomplete, it first asks `icp` again and
 * waits for the answer, so the page that loads after a deploy already carries
 * the new ID. Other requests, and every request once detection is complete,
 * get the cookie from the latest detection without running `icp`.
 *
 * A page load with no cookie to set, because no network was detected or the
 * detected one was lost, clears the browser's `ic_env` cookie instead.
 *
 * The first page load by a `Host` that is not loopback is reported through
 * `warn`, once per middleware.
 */
export function icEnvMiddleware(
  environment: LocalEnvironment,
  warn: (message: string) => void = (message) => console.warn(message)
) {
  let warned = false
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void
  ): void => {
    if (
      !warned &&
      isDocumentRequest(req) &&
      !isLoopbackHost(req.headers.host)
    ) {
      warned = true
      warn(nonLoopbackPageWarning(String(req.headers.host)))
    }
    const respond = (state: LocalEnvironmentState | undefined) => {
      if (state?.cookie !== undefined) setIcEnvCookie(res, state.cookie)
      // With nothing to send, a page load clears what the browser kept: the
      // cookie of a network this server lost, or an earlier server's.
      else if (state && isDocumentRequest(req)) clearIcEnvCookie(res)
      next()
    }

    const { state } = environment
    if (state?.complete || !isDocumentRequest(req)) {
      respond(state)
      return
    }

    void environment.detect().then(respond)
  }
}
