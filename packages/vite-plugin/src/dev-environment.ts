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
 */

import type { IncomingMessage, ServerResponse } from "node:http"
import {
  buildIcEnvCookie,
  getIcEnvironmentInfo,
  type IcEnvironment,
} from "./env.js"

/** Where `/api` goes while `icp` reports no network. */
export const DEFAULT_LOCAL_REPLICA = "http://127.0.0.1:4943"

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
}

export interface LocalEnvironmentOptions {
  /** The configured canisters' names. */
  canisterNames: string[]
  /** IDs set in the plugin config. They win over detected ones. */
  configuredCanisterIds: Record<string, string>
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
   * runs shares it. Never rejects.
   */
  detect(): Promise<LocalEnvironmentState>
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
  // complete.
  const requiredNames = [...new Set(canisterNames)]
  const lookupNames = requiredNames.includes("internet_identity")
    ? requiredNames
    : [...requiredNames, "internet_identity"]

  let state: LocalEnvironmentState | undefined
  let running: Promise<LocalEnvironmentState> | undefined

  const toState = (
    environment: IcEnvironment | null
  ): LocalEnvironmentState => {
    const canisterIds = {
      ...environment?.canisterIds,
      ...configuredCanisterIds,
    }
    const missingCanisterIds = requiredNames.filter(
      (name) => !canisterIds[name]
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
        {},
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
    }
  }

  const run = async (): Promise<LocalEnvironmentState> => {
    const previous = state
    try {
      const { environment, diagnostics } = await getIcEnvironmentInfo(
        lookupNames,
        projectRoot
      )
      diagnostics.forEach(onDiagnostic)
      state = toState(
        mergeDetections(previous?.environment ?? null, environment)
      )
    } catch (error) {
      // getIcEnvironmentInfo reports failures in its result. This is for
      // anything else, which must not fail the page request that waits here.
      onDiagnostic(
        `Detecting the local IC environment failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      state = previous ?? toState(null)
    }

    try {
      onUpdate?.(previous, state)
    } catch (error) {
      onDiagnostic(
        `Applying the detected IC environment failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
    return state
  }

  return {
    get state() {
      return state
    },
    detect() {
      running ??= run().finally(() => {
        running = undefined
      })
      return running
    },
  }
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
  const canisterIds = { ...previous.canisterIds, ...next.canisterIds }
  return {
    ...next,
    canisterIds,
    // The built-in provider stands in only for a project that has no
    // internet_identity canister, as getIcEnvironmentInfo decides it.
    internetIdentityProvider: canisterIds.internet_identity
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
  const existing = res.getHeader("Set-Cookie")
  const others = (
    existing === undefined
      ? []
      : Array.isArray(existing)
        ? existing
        : [String(existing)]
  ).filter((cookie) => !cookie.startsWith("ic_env="))
  const cookie = `ic_env=${value}; Path=/; SameSite=Lax;`
  res.setHeader("Set-Cookie", others.length > 0 ? [...others, cookie] : cookie)
}

/**
 * Connect middleware that sets the `ic_env` cookie on each response.
 *
 * For a page load while detection is incomplete, it first asks `icp` again and
 * waits for the answer, so the page that loads after a deploy already carries
 * the new ID. Other requests, and every request once detection is complete,
 * get the cookie from the latest detection without running `icp`.
 */
export function icEnvMiddleware(environment: LocalEnvironment) {
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void
  ): void => {
    const respond = (state: LocalEnvironmentState | undefined) => {
      if (state?.cookie !== undefined) setIcEnvCookie(res, state.cookie)
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
