/**
 * Fetching a live canister's interface: its `candid:service` metadata, read
 * from certified state with `HttpAgent.readState` and checked against the
 * network's root key, for a `didFile` that is not on disk yet.
 *
 * `@icp-sdk/core` is an optional peer of the plugin, imported here only when a
 * canister is fetched: an app whose `.did` files are all on disk never loads
 * it. Every app on ic-reactor has it already, through `@ic-reactor/core`.
 *
 * A fetch never throws. It resolves with the interface, or with a message that
 * says which of these went wrong and what to do about it: the network could
 * not be reached, the canister does not exist there, the read was refused
 * (the canister keeps its interface private), or the canister publishes no
 * interface at all. `CanisterStatus.request`, which `@icp-sdk/core` deprecates,
 * is not used: it resolves with no value when the network is unreachable,
 * which reads as "no metadata". `readState` throws instead.
 */

import fs from "node:fs"
import path from "node:path"

/**
 * Where a canister to fetch is: `"ic"` (mainnet, checked against the mainnet
 * root key the agent ships with), `"local"` (icp-cli's local network on
 * `http://127.0.0.1:8000`, whose root key is fetched from it), or another
 * replica by its URL. That replica's root key is fetched only when its host is
 * local (`localhost`, `*.localhost` or a loopback address); any other host is
 * checked against mainnet's key, so it cannot hand over a key of its own.
 */
export type CanisterNetwork = "ic" | "local" | { readonly host: string }

/** Mainnet's API boundary, as `@ic-reactor/core` reaches it for `"ic"`. */
const IC_HOST = "https://icp-api.io"

/** icp-cli's local network on its default port: core's `"local"`. */
const LOCAL_HOST = "http://127.0.0.1:8000"

/** How long one fetch may take, its retries included, before it gives up. */
export const FETCH_TIMEOUT_MS = 30_000

/**
 * How many times the agent repeats a request that failed. One network blip
 * should not fail a build, and a canister that refuses the read refuses it
 * every time.
 */
const RETRY_TIMES = 2

/** A network with every decision made. */
interface ResolvedNetwork {
  /** How messages name it: `ic`, `local`, or the host. */
  label: string
  host: string
  /** Whether the root key is fetched from `host`, which only a local host is trusted with. */
  fetchRootKey: boolean
}

/**
 * Whether `hostname` is a local replica: `localhost` and its subdomains, all
 * of 127.0.0.0/8, and `::1`. The rule `@ic-reactor/core`'s `createClient`
 * follows to decide whether a replica's root key may be fetched from it.
 */
function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(hostname) ||
    hostname === "::1" ||
    hostname === "[::1]"
  )
}

/**
 * `network` with its host and root key decided, or a message that says why it
 * is not a network.
 */
export function resolveNetwork(
  network: CanisterNetwork | undefined
): ResolvedNetwork | string {
  if (network === undefined || network === "ic") {
    return { label: "ic", host: IC_HOST, fetchRootKey: false }
  }
  if (network === "local") {
    return { label: "local", host: LOCAL_HOST, fetchRootKey: true }
  }
  const host =
    typeof network === "object" && network !== null
      ? (network as { host?: unknown }).host
      : undefined
  let url: URL | undefined
  try {
    url = typeof host === "string" ? new URL(host) : undefined
  } catch {
    url = undefined
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return `network ${JSON.stringify(network)} is not "ic", "local" or { host: "<http or https URL>" }`
  }
  return {
    label: host as string,
    host: host as string,
    fetchRootKey: isLocalHostname(url.hostname),
  }
}

/** What a fetch asks for. */
export interface FetchRequest {
  canisterId: string
  network: CanisterNetwork | undefined
  /** The `didFile` as messages name it, relative to the Vite root. */
  didFile: string
  timeoutMs?: number
  /** Aborting it stops the fetch, which then resolves as stopped. */
  signal?: AbortSignal
}

/** What a fetch found. */
export type FetchResult =
  | {
      ok: true
      /** The certified `candid:service` text, as the canister publishes it. */
      did: string
      /** The network it was read from, as messages name it. */
      network: string
    }
  | { ok: false; stopped?: boolean; message: string }

/**
 * The first line of a long message, which is the one that says what happened,
 * without the period it may end with: messages quote it in parentheses.
 */
function firstLine(text: string): string {
  return (text.trim().split("\n")[0] ?? "").trim().replace(/\.$/, "")
}

/**
 * Read the certified `candid:service` metadata of `request.canisterId`.
 * Never rejects.
 */
export async function fetchCandid(request: FetchRequest): Promise<FetchResult> {
  const { canisterId, didFile, signal } = request
  const timeoutMs = request.timeoutMs ?? FETCH_TIMEOUT_MS
  const stopped: FetchResult = {
    ok: false,
    stopped: true,
    message: "was stopped",
  }
  if (signal?.aborted) return stopped

  const network = resolveNetwork(request.network)
  if (typeof network === "string") return { ok: false, message: network }
  // A network named by its host is named once, where the host is.
  const where =
    network.label === network.host
      ? canisterId
      : `${canisterId} on ${network.label}`
  const ownFile = `or write ${didFile} yourself, and the plugin reads it instead of fetching`

  let sdk: {
    agent: typeof import("@icp-sdk/core/agent")
    principal: typeof import("@icp-sdk/core/principal")
  }
  try {
    const [agent, principal] = await Promise.all([
      import("@icp-sdk/core/agent"),
      import("@icp-sdk/core/principal"),
    ])
    sdk = { agent, principal }
  } catch (error) {
    return {
      ok: false,
      message:
        `${didFile} does not exist, and fetching it from ${where} needs @icp-sdk/core, which could not be loaded ` +
        `(${firstLine(error instanceof Error ? error.message : String(error))}). ` +
        `Install it next to @ic-reactor/core (npm install @icp-sdk/core), ${ownFile}.`,
    }
  }
  const {
    HttpAgent,
    StatePaths,
    AgentError,
    HttpErrorCode,
    HttpFetchErrorCode,
    TrustError,
  } = sdk.agent

  let principal: import("@icp-sdk/core/principal").Principal
  try {
    principal = sdk.principal.Principal.fromText(canisterId)
  } catch (error) {
    return {
      ok: false,
      message: `canisterId "${canisterId}" is not a canister ID: ${firstLine(error instanceof Error ? error.message : String(error))}`,
    }
  }

  // Every request of the fetch, retries included, shares one deadline, and the
  // caller's signal ends them all.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const stop = () => controller.abort()
  signal?.addEventListener("abort", stop, { once: true })
  const fetchWithin: typeof fetch = (input, init) =>
    globalThis.fetch(input, { ...init, signal: controller.signal })

  try {
    const agent = HttpAgent.createSync({
      host: network.host,
      fetch: fetchWithin,
      shouldFetchRootKey: network.fetchRootKey,
      retryTimes: RETRY_TIMES,
    })
    const candidPath = StatePaths.canisterCandid(principal)
    const { values } = await agent.readState(
      { canisterId: principal },
      { paths: [candidPath] }
    )
    if (signal?.aborted) return stopped
    const did = values.get(candidPath)
    if (did === null || did === undefined) {
      return {
        ok: false,
        message:
          `${canisterId} on ${network.label} publishes no candid:service metadata, so it has no interface to fetch. ` +
          `Get its .did from the canister's developers and save it as ${didFile}, ` +
          `or check that canisterId and network name the canister you mean.`,
      }
    }
    return { ok: true, did, network: network.label }
  } catch (error) {
    if (signal?.aborted) return stopped
    if (timedOut) {
      return {
        ok: false,
        message:
          `${network.host} did not answer within ${timeoutMs / 1000}s, so the candid:service of ${where} could not be read. ` +
          `Check the connection and build again, ${ownFile}.`,
      }
    }
    if (error instanceof AgentError && error.hasCode(HttpFetchErrorCode)) {
      const cause = (error.code as InstanceType<typeof HttpFetchErrorCode>)
        .error
      const local =
        network.label === "local"
          ? ` Is the local network running? Start it with \`icp network start\`.`
          : ` Check the connection and build again.`
      return {
        ok: false,
        message:
          `could not reach ${network.host} to read the candid:service of ${where} ` +
          `(${firstLine(describeCause(cause))}).${local} Or write ${didFile} yourself, and the plugin reads it instead of fetching.`,
      }
    }
    if (error instanceof AgentError && error.code instanceof HttpErrorCode) {
      const { status, bodyText = "" } = error.code
      const answer = firstLine(bodyText) || error.code.statusText
      if (status === 401 || status === 403) {
        return {
          ok: false,
          message:
            `${network.host} refused to read the candid:service of ${where} (HTTP ${status}: ${answer}). ` +
            `The canister keeps its interface private, and only its controllers can read it: ` +
            `get the .did from the canister's developers and save it as ${didFile}.`,
        }
      }
      if (/canister_not_found/.test(bodyText)) {
        return {
          ok: false,
          message:
            `${canisterId} does not exist on ${network.label} (${network.host} answered HTTP ${status}: ${answer}). ` +
            `Check canisterId, and set network to the network the canister is on.`,
        }
      }
      return {
        ok: false,
        message:
          `${network.host} answered HTTP ${status} to the read of the candid:service of ${where}: ${answer}. ` +
          `Build again later, ${ownFile}.`,
      }
    }
    const reason = firstLine(
      error instanceof Error ? error.message : String(error)
    )
    if (error instanceof TrustError) {
      return {
        ok: false,
        message:
          `the certificate ${network.host} sent for the candid:service of ${where} did not verify against ${rootKeyOf(network)} (${reason}). ` +
          `Check that network names the network the canister is on, ${ownFile}.`,
      }
    }
    return {
      ok: false,
      message: `could not read the certified candid:service of ${where} (${reason}). Build again, ${ownFile}.`,
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", stop)
  }
}

/**
 * The root key a certificate from `network` is checked against, as a message
 * names it. A host that is not local never hands over a key of its own.
 */
function rootKeyOf(network: ResolvedNetwork): string {
  if (network.fetchRootKey) return `the root key fetched from ${network.host}`
  return network.label === "ic"
    ? "mainnet's root key"
    : `mainnet's root key, since the root key of a host that is not local is never fetched from it`
}

/** What `fetch` threw, with the network error Node keeps in its `cause`. */
function describeCause(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause)
  const inner = (cause as Error & { cause?: unknown }).cause
  const detail =
    inner instanceof Error
      ? ((inner as Error & { code?: unknown }).code ?? inner.message)
      : undefined
  return detail ? `${cause.message}: ${String(detail)}` : cause.message
}

/**
 * Write `text` to `file`, creating its directory, through a file renamed into
 * place: a watcher or a second build never reads half of it.
 */
export function writeDid(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const partial = `${file}.${process.pid}.partial`
  fs.writeFileSync(partial, text)
  try {
    fs.renameSync(partial, file)
  } catch (error) {
    fs.rmSync(partial, { force: true })
    throw error
  }
}
