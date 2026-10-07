/**
 * Network resolution: which replica a client talks to, whose root key its
 * certificates are checked against, and where a canister id may come from.
 *
 * Only {@link Network} is public. The rest is internal, for the client and
 * the canister builders, and is not exported from the package entry.
 *
 * Everything here decides who is believed, so each rule is a positive
 * allowlist that fails closed:
 *
 * - **A root key is fetched from a replica only when asked for in writing or
 *   when the host is local.** A given key is used and never fetched.
 *   Anything else is checked against the mainnet key the agent ships with, so
 *   a host that is not a local replica can never hand over a key of its own
 *   choosing.
 * - **The `ic_env` cookie is believed only where it is as trustworthy as the
 *   replica it describes.** Cookies are not origin-isolated: any sibling
 *   subdomain of the page's registrable domain can write one. It carries the
 *   root key certificates are verified against and the canister ids calls are
 *   routed to, and certificate verification cannot notice a substituted id
 *   (the attacker names a real canister, whose replies verify against the real
 *   root key). So the cookie is read only in a browser, and only when both the
 *   agent host and the page are a local replica, or the caller wrote
 *   `allowEnvConfig: true`.
 *
 * @module
 */

import { IC_ROOT_KEY } from "@icp-sdk/core/agent"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import { Principal } from "@icp-sdk/core/principal"
import { isServer } from "./runtime.js"

/**
 * Where the canisters are.
 *
 * - `"ic"`: mainnet, through `https://icp-api.io`, checked against the
 *   mainnet root key the agent ships with. Nothing is fetched.
 * - `"local"`: icp-cli's local network, `http://127.0.0.1:8000`. Its root key
 *   is fetched from the replica before the first call. A dfx replica (port
 *   4943) is an object: `{ host: "http://127.0.0.1:4943" }`.
 * - `"env"`: the network of the page this code runs in, as an asset canister
 *   or a dev server describes it. In a browser, a page on a local replica or
 *   on a mainnet boundary domain (and a Codespaces or Gitpod page, which
 *   forwards a local dev server) routes through its own origin. The root key
 *   comes from the `ic_env` cookie, but only where that cookie is trusted:
 *   when both the page and the replica are local, or the client was built
 *   with `allowEnvConfig: true`. A local replica with no key from the cookie
 *   has its root key fetched. A Codespaces or Gitpod page is routed but is
 *   not local, so there the key is neither taken from the cookie nor fetched,
 *   and the agent checks the forwarded replica's certificates against
 *   mainnet's key, so every certified call fails verification. Set
 *   `allowEnvConfig: true` to take the cookie's key, or name the replica with
 *   an object that has a `rootKey` or `fetchRootKey: true`. On a server there
 *   is no page and no cookie: the host is `ICP_HOST` or `IC_HOST` when
 *   `ICP_NETWORK` is `"local"` (`http://127.0.0.1:8000` if neither is set),
 *   and mainnet otherwise. With no `ICP_NETWORK`, dfx's `DFX_NETWORK=local`
 *   counts too, and its default is dfx's `http://127.0.0.1:4943`.
 * - An object: any other replica. `rootKey` is used as given and never
 *   fetched. Without one the root key is fetched only when `host` is local
 *   (`localhost`, `*.localhost` or any loopback address), unless `fetchRootKey`
 *   says otherwise. A replica behind a Codespaces, Gitpod or custom domain is
 *   not local: pass its `rootKey`, or write `fetchRootKey: true` to trust the
 *   key it reports. `name` is the network's segment in query keys and defaults
 *   to `host`.
 */
export type Network =
  | "ic"
  | "local"
  | "env"
  | {
      /** The replica's URL. A host with no scheme is read against the page's protocol, as `HttpAgent` reads it. */
      readonly host: string
      /**
       * The root key certificates are verified against. Used as given and
       * never fetched, even where `fetchRootKey` is `true`.
       */
      readonly rootKey?: Uint8Array
      /** This network's segment in query keys. Defaults to `host`. */
      readonly name?: string
      /**
       * Whether to fetch the root key from the replica when `rootKey` is
       * absent. Defaults to whether `host` is local. Writing `true` for a host
       * that is not local trusts whatever key that host reports, which is why it
       * is never the default.
       */
      readonly fetchRootKey?: boolean
    }

/** What the caller can decide about trusting the `ic_env` cookie. */
export interface NetworkOptions {
  /**
   * `true` trusts the whole cookie (root key and canister ids) wherever the
   * code runs in a browser, `false` never reads it, and absent trusts it only
   * when both the agent host and the page are a local replica. Set it to
   * `true` only when every subdomain of the page's domain is trusted to write
   * cookies.
   */
  readonly allowEnvConfig?: boolean
}

/** A {@link Network} with every decision made. */
export interface ResolvedNetwork {
  /** The network's segment in query keys: `"ic"`, `"local"`, `name ?? host` for a custom network, the resolved host for `"env"`. */
  readonly keySegment: string
  /** The URL the agent connects to. */
  readonly host: string
  /** The root key to verify with. Absent means the agent's own: mainnet's, or the one it fetches when {@link fetchRootKey} is set. */
  readonly rootKey?: Uint8Array
  /** Whether the agent fetches the root key from `host`. Never `true` while {@link rootKey} is set. */
  readonly fetchRootKey: boolean
  /** Whether the `ic_env` cookie is believed. Always `false` outside a browser page. */
  readonly trustsEnv: boolean
}

/** The part of `HttpAgentOptions` a resolved network decides. */
export interface AgentNetworkOptions {
  readonly host: string
  readonly rootKey?: Uint8Array
  readonly shouldFetchRootKey: boolean
}

/** A canister to call: by its id, or by the name the `ic_env` cookie gives it. */
export type CanisterIdTarget =
  { readonly id: string } | { readonly name: string }

/** Why a `{ name }` target could not be resolved. */
export type CanisterIdFailure = "no_browser" | "untrusted_host" | "absent"

/** The result of {@link resolveCanisterId}. */
export type CanisterIdResolution =
  | { readonly ok: true; readonly id: string }
  | {
      readonly ok: false
      readonly reason: CanisterIdFailure
      readonly message: string
    }

/** A value for an error message, without throwing on a value `JSON.stringify` rejects. */
const describe = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

const badTarget = (target: unknown): TypeError =>
  new TypeError(
    `[ic-reactor] a canister target is { id: string } or { name: string }, got ${describe(target)}.`
  )

/** Validates principal text, and returns the reason it is not one. */
const principalProblem = (text: string): string | undefined => {
  try {
    // `fromText` also accepts the JSON form `{"__principal__":"..."}`, which is
    // not an id: only the text it prints back is.
    return Principal.fromText(text).toText() === text
      ? undefined
      : "it is not in canonical text form"
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

const IC_HOST = "https://icp-api.io"
/** icp-cli's local network: its gateway's default port is 8000. */
const LOCAL_HOST = "http://127.0.0.1:8000"
/** dfx's local replica, the default only when `DFX_NETWORK` is the signal. */
const DFX_LOCAL_HOST = "http://127.0.0.1:4943"

/** The domains whose pages route agent traffic through their own origin. */
const MAINNET_DOMAINS = ["ic0.app", "icp0.io", "icp-api.io"]

/**
 * Dev containers that forward a local dev server and replica to the browser
 * over generated subdomains. Their pages route through their own origin, but
 * they are never local: every workspace on them is a sibling of every
 * stranger's.
 */
const REMOTE_DEV_SUFFIXES = [".github.dev", ".gitpod.io"]

/** 127.0.0.0/8: the entire IPv4 loopback range, not just 127.0.0.1. */
const IPV4_LOOPBACK = /^127\.(?:\d{1,3}\.){2}\d{1,3}$/

/**
 * Whether `hostname` is a local replica: `localhost` and its subdomains, all
 * of 127.0.0.0/8, and the IPv6 `::1` with or without the brackets a URL's
 * `hostname` keeps around it.
 *
 * This is a positive allowlist, and deliberately not "anything that is not
 * mainnet": a production dapp on a custom domain, a Codespaces host and a
 * Gitpod host are all outside it. The names are matched whole or as a
 * `.localhost` subdomain, so `notlocalhost` and `localhost.example.com` are
 * not local.
 */
const isLocalHostname = (hostname: string | undefined): boolean => {
  if (!hostname) return false
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    IPV4_LOOPBACK.test(hostname) ||
    hostname === "::1" ||
    hostname === "[::1]"
  )
}

/**
 * The URL `HttpAgent` connects to for `host`, found the way the agent
 * finds it (`determineHost` in `@icp-sdk/core`): on a page, a host that does
 * not start with a scheme, such as `127.0.0.1:4943` or a bare Codespaces
 * domain, is read against the page's protocol. The agent's scheme test is
 * copied as is, so `localhost:4943`, which it reads as the scheme `localhost:`,
 * has no hostname here either, and neither has a scheme-less host where there
 * is no page. A host the agent cannot read is not local.
 */
const agentUrlOf = (host: string): URL | undefined => {
  try {
    return !/^[a-z]+:/.test(host) && typeof window !== "undefined"
      ? new URL(`${window.location.protocol}//${host}`)
      : new URL(host)
  } catch {
    return undefined
  }
}

/** The hostname of {@link agentUrlOf}. */
const agentHostnameOf = (host: string): string | undefined =>
  agentUrlOf(host)?.hostname

/** The hostname of a page origin, or `undefined` when it is not a URL (an opaque origin reads as `"null"`). */
const pageHostnameOf = (origin: string | undefined): string | undefined => {
  if (!origin) return undefined
  try {
    return new URL(origin).hostname || undefined
  } catch {
    return undefined
  }
}

/**
 * The origin of the page this code runs for. A web worker has no `window`,
 * but its global scope has a `location` (the worker script's URL), whose
 * origin is that of the page that started it. Node has neither. Deno 2 has no
 * `window`, and reading its `location` throws unless it was started with
 * `--location`. React Native defines `window` with no `location` at all.
 */
const pageOrigin = (): string | undefined => {
  try {
    const location =
      typeof window !== "undefined"
        ? window.location
        : (globalThis as { location?: { origin?: string } }).location
    return location?.origin
  } catch {
    return undefined
  }
}

/** Whether the page this code runs in is a local replica's page. A worker has no cookie to protect, so it is never one. */
const pageIsLocal = (): boolean =>
  typeof window !== "undefined" && isLocalHostname(pageHostnameOf(pageOrigin()))

/**
 * The page's own origin when agent traffic can route through it: a local page
 * (a dev server or a locally deployed asset canister proxies `/api`), a
 * mainnet boundary domain, or a Codespaces or Gitpod page, which forwards a
 * local dev server. An ordinary web host (Vercel, Cloudflare, a custom domain)
 * cannot, so it is left to the fallback; so is a page with no usable origin.
 *
 * A Codespaces page used to fall back to mainnet, and a dev app in a codespace
 * sent its local canister ids to mainnet, where whatever canister had that id
 * answered.
 */
const routableOrigin = (): string | undefined => {
  const origin = pageOrigin()
  const hostname = pageHostnameOf(origin)
  if (origin === undefined || hostname === undefined) return undefined
  const routable =
    isLocalHostname(hostname) ||
    MAINNET_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    ) ||
    REMOTE_DEV_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  return routable ? origin : undefined
}

/** `process.env`, or `undefined` where there is no `process`. */
const processEnv = (): Record<string, string | undefined> | undefined => {
  try {
    return typeof process !== "undefined" ? process.env : undefined
  } catch {
    return undefined
  }
}

/**
 * The host `"env"` falls back to when no page routes the agent. With
 * `ICP_NETWORK` set to `"local"` that is `ICP_HOST` or `IC_HOST`, else
 * icp-cli's local network, `"local"`'s `http://127.0.0.1:8000`. The older
 * `DFX_NETWORK` counts only when `ICP_NETWORK` is not set (which overrides
 * it): with `DFX_NETWORK=local` it is `ICP_HOST` or `IC_HOST`, else dfx's own
 * replica, `http://127.0.0.1:4943`, because that variable says the project
 * runs dfx. Any other value, or none, is mainnet. v3 fell back to
 * `https://ic0.app` here; this is the same mainnet host `"ic"` uses.
 */
const fallbackHost = (): string => {
  const env = processEnv()
  const fromIcp = env?.ICP_NETWORK !== undefined
  const network = fromIcp ? env?.ICP_NETWORK : env?.DFX_NETWORK
  if (network !== "local") return IC_HOST
  return (
    env?.ICP_HOST || env?.IC_HOST || (fromIcp ? LOCAL_HOST : DFX_LOCAL_HOST)
  )
}

/**
 * Whether the `ic_env` cookie is believed for an agent on `host`.
 *
 * Both sides must be a local replica, because the page decides who can write
 * the cookie: a document on `app.example.com` pointed at a loopback replica
 * shares its cookie jar with every sibling of `example.com`, and the agent host
 * says nothing about that. `allowEnvConfig` overrides the pair either way,
 * except that outside a browser page there is no cookie to believe at all.
 */
const trustsEnvFor = (
  host: string,
  allowEnvConfig: boolean | undefined
): boolean => {
  if (isServer()) return false
  return (
    allowEnvConfig ?? (isLocalHostname(agentHostnameOf(host)) && pageIsLocal())
  )
}

/** The cookie's entries. Only ever called for a trusted page. */
const readCanisterEnv = (): Readonly<Record<string, unknown>> | undefined =>
  safeGetCanisterEnv()

/** The root key the cookie carries, or `undefined` when it carries none. */
const cookieRootKey = (): Uint8Array | undefined => {
  const rootKey = readCanisterEnv()?.IC_ROOT_KEY
  return rootKey instanceof Uint8Array ? rootKey : undefined
}

/** Builds a {@link ResolvedNetwork}, leaving `rootKey` out rather than `undefined`. */
const resolved = (
  parts: Omit<ResolvedNetwork, "rootKey"> & { rootKey?: Uint8Array }
): ResolvedNetwork => {
  const { rootKey, ...rest } = parts
  return rootKey === undefined ? rest : { ...rest, rootKey }
}

/**
 * Decides everything about a network that the client needs before it builds an
 * agent: the host, the root key (given, taken from a trusted cookie, or to be
 * fetched), the key segment, and whether the `ic_env` cookie is believed.
 *
 * Reads the page it runs in, so it is called once, when the client is built.
 * The legacy v3 option `allowEnvRootKey` is not carried over: `allowEnvConfig`
 * is the only opt-in, and it covers the whole cookie.
 *
 * @throws TypeError for a network that is not one of the allowed shapes: a
 * programmer error at build time.
 */
export const resolveNetwork = (
  network: Network,
  options: NetworkOptions = {}
): ResolvedNetwork => {
  const { allowEnvConfig } = options

  if (network === "ic") {
    return resolved({
      keySegment: "ic",
      host: IC_HOST,
      fetchRootKey: false,
      trustsEnv: trustsEnvFor(IC_HOST, allowEnvConfig),
    })
  }

  if (network === "local") {
    return resolved({
      keySegment: "local",
      host: LOCAL_HOST,
      fetchRootKey: true,
      trustsEnv: trustsEnvFor(LOCAL_HOST, allowEnvConfig),
    })
  }

  if (network === "env") {
    const host = routableOrigin() ?? fallbackHost()
    const trustsEnv = trustsEnvFor(host, allowEnvConfig)
    // The key is the replica's, so it is taken only from a cookie that is as
    // trustworthy as the replica. Without one, a local replica is asked.
    const rootKey = trustsEnv ? cookieRootKey() : undefined
    return resolved({
      keySegment: host,
      host,
      rootKey,
      fetchRootKey:
        rootKey === undefined && isLocalHostname(agentHostnameOf(host)),
      trustsEnv,
    })
  }

  if (
    typeof network !== "object" ||
    network === null ||
    typeof network.host !== "string"
  ) {
    throw new TypeError(
      `[ic-reactor] unknown network ${describe(network)}: expected "ic", "local", "env", or { host: string, rootKey?, name?, fetchRootKey? }.`
    )
  }

  const { host, name, fetchRootKey } = network
  const rootKey = network.rootKey ?? undefined
  return resolved({
    keySegment: name ?? host,
    host,
    rootKey,
    // A key the caller gave is the one to verify with, so nothing is fetched to
    // replace it. Otherwise a replica is asked only when it is local, or when
    // the caller wrote it out.
    fetchRootKey:
      rootKey === undefined &&
      (fetchRootKey ?? isLocalHostname(agentHostnameOf(host))),
    trustsEnv: trustsEnvFor(host, allowEnvConfig),
  })
}

/**
 * The agent options a resolved network decides, so that every `HttpAgent` is
 * built from one place. A given or cookie-supplied `rootKey` is passed and
 * `shouldFetchRootKey` is `false`: the agent holds that key from the start and
 * never requests `/api/v2/status`. With neither, the agent holds mainnet's, or
 * (when `shouldFetchRootKey` is `true`) asks the replica on its first request.
 */
export const agentOptionsFor = (net: ResolvedNetwork): AgentNetworkOptions => ({
  host: net.host,
  ...(net.rootKey === undefined ? {} : { rootKey: net.rootKey }),
  shouldFetchRootKey: net.fetchRootKey,
})

/**
 * The canister a target names.
 *
 * `{ id }` is validated now, and an id that is not principal text throws a
 * `TypeError` that names it: a programmer error at build time, never something
 * a deployed app hits at run time.
 *
 * `{ name }` is read from the `PUBLIC_CANISTER_ID:<name>` entry of the
 * `ic_env` cookie, and only when the network trusts the cookie. It never
 * throws and sends nothing: where the id cannot be had it says why, in one of
 * three ways that need three different fixes, so a refused cookie is not
 * reported as an absent one, and a server render is not blamed on the host
 * for having no cookie jar:
 *
 * - `no_browser`: there is no page, so no cookie jar to read.
 * - `untrusted_host`: the cookie is there to read but not trusted for this
 *   network, so it was not read.
 * - `absent`: the cookie was read and has no usable entry under that name.
 *   An entry that is not principal text counts as absent.
 */
export const resolveCanisterId = (
  target: CanisterIdTarget,
  net: ResolvedNetwork
): CanisterIdResolution => {
  if (typeof target !== "object" || target === null) throw badTarget(target)

  if ("id" in target) {
    const problem = principalProblem(target.id)
    if (problem !== undefined) {
      throw new TypeError(
        `[ic-reactor] ${describe(target.id)} is not a valid canister id: ${problem}`
      )
    }
    return { ok: true, id: target.id }
  }

  if (typeof target.name !== "string") throw badTarget(target)

  const key = `PUBLIC_CANISTER_ID:${target.name}`
  const what = `the canister id for { name: ${describe(target.name)} }`
  const fail = (
    reason: CanisterIdFailure,
    message: string
  ): CanisterIdResolution => ({
    ok: false,
    reason,
    message: `[ic-reactor] cannot resolve ${what}: ${message}`,
  })

  if (isServer()) {
    return fail(
      "no_browser",
      `there is no ic_env cookie to read outside a browser page (a server render, or a web worker). ` +
        `Use { id } for a canister you call from there.`
    )
  }

  if (!net.trustsEnv) {
    const origin = pageOrigin()
    return fail(
      "untrusted_host",
      `the ic_env cookie is not trusted for this network (agent host ${net.host}` +
        // The agent host is often the library's mainnet fallback rather than
        // anywhere the reader recognises, so name the page too.
        `${origin ? `, page ${origin}` : ""}), so it was not read. ` +
        `It is trusted only when both the agent host and the page are a local replica ` +
        `(localhost, *.localhost or a loopback address), because any sibling subdomain can write it. ` +
        `Use { id } (bake the id in at build time) or, only if you trust every subdomain of this domain, ` +
        `set allowEnvConfig: true, which trusts the whole cookie, its root key included.`
    )
  }

  const value = readCanisterEnv()?.[key]
  if (typeof value !== "string" || value === "") {
    return fail(
      "absent",
      `the ic_env cookie has no "${key}" entry. Check the name against the canister's name in the project config, or use { id }.`
    )
  }
  // The cookie is trusted, not validated: a value that is not a principal must
  // not become a canister id.
  if (principalProblem(value) !== undefined) {
    return fail(
      "absent",
      `the "${key}" entry of the ic_env cookie is not principal text. Use { id }.`
    )
  }
  return { ok: true, id: value }
}

// ---------------------------------------------------------------------------
// What the auth factory is told about the network
// ---------------------------------------------------------------------------

/**
 * Internet Identity's canister: its id on mainnet, and the id icp-cli installs
 * its built-in Internet Identity at on every local network it starts.
 */
const INTERNET_IDENTITY = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/** Where a sign-in ceremony runs and which canister mints its delegations: `@icp-sdk/auth` 10's `identityProvider`. */
export interface IdentityProvider {
  readonly authorizeUrl: string
  readonly canisterId: string
}

/**
 * What the client hands its `auth` factory, under `@icp-sdk/auth` 10's own
 * option names, so that `(network) => new AuthClient(network)` signs in on
 * the client's network.
 */
export interface AuthNetwork {
  readonly agentOptions: AgentNetworkOptions
  readonly identityProvider?: IdentityProvider
}

/** The result of {@link authNetworkFor}. */
export interface AuthNetworkResolution {
  readonly network: AuthNetwork
  /**
   * Set when the network is not mainnet's and no identity provider could be
   * named for it: why, as a clause for a warning. An auth built without one
   * signs in with mainnet's Internet Identity, whose delegations a replica
   * with another root key rejects.
   */
  readonly gap?: string
}

const hexOf = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

/**
 * Whether the agent verifies against mainnet's root key: it fetches none, and
 * holds either none of its own (the agent's default is mainnet's) or one equal
 * to mainnet's (a mainnet asset canister's cookie carries it).
 */
const verifiesAsMainnet = (net: ResolvedNetwork): boolean =>
  !net.fetchRootKey &&
  (net.rootKey === undefined || hexOf(net.rootKey) === IC_ROOT_KEY)

/** The cookie's `INTERNET_IDENTITY_PROVIDER`, when it is an http(s) URL. */
const cookieAuthorizeUrl = (
  env: Readonly<Record<string, unknown>> | undefined
): string | undefined => {
  const value = env?.INTERNET_IDENTITY_PROVIDER
  if (typeof value !== "string" || value === "") return undefined
  try {
    const { protocol } = new URL(value)
    return protocol === "http:" || protocol === "https:" ? value : undefined
  } catch {
    return undefined
  }
}

/** The cookie's `PUBLIC_CANISTER_ID:internet_identity`, when it is principal text. */
const cookieInternetIdentity = (
  env: Readonly<Record<string, unknown>> | undefined
): string | undefined => {
  const value = env?.["PUBLIC_CANISTER_ID:internet_identity"]
  return typeof value === "string" &&
    value !== "" &&
    principalProblem(value) === undefined
    ? value
    : undefined
}

/**
 * icp-cli's built-in Internet Identity for a gateway at `host`:
 * `id.ai.localhost` on the gateway's scheme and port. The same rule as the
 * Vite plugin's `localInternetIdentityProvider`, which puts this URL in the
 * `ic_env` cookie.
 */
const builtInAuthorizeUrl = (host: string): string | undefined => {
  const url = agentUrlOf(host)
  if (url === undefined) return undefined
  return `${url.protocol}//id.ai.localhost${url.port ? `:${url.port}` : ""}/authorize`
}

/**
 * What the client tells its `auth` factory: the agent options of its own
 * agents, and the identity provider to sign in with, by these rules in order.
 *
 * 1. A trusted `ic_env` cookie that names `INTERNET_IDENTITY_PROVIDER`: that
 *    URL, with the cookie's `PUBLIC_CANISTER_ID:internet_identity`, or
 *    Internet Identity's own id when it names none.
 * 2. A trusted cookie that names an `internet_identity` canister but no URL
 *    (the project deploys its own): none, and a gap unless the network is
 *    mainnet's. Its URL cannot be derived from its id.
 * 3. `"local"`, or a network object whose host is local: icp-cli's built-in
 *    Internet Identity on that host's port.
 * 4. `"env"` on a local page: none, and a gap. The agent's host is the
 *    page's (a dev server, or a gateway serving an asset canister), which
 *    does not say where icp-cli's built-in Internet Identity is.
 * 5. Any other network that does not verify against mainnet's root key: none,
 *    and a gap.
 * 6. Mainnet: none. `AuthClient`'s defaults are mainnet's.
 *
 * Reads the cookie, so it is called when the factory is, in a browser.
 */
export const authNetworkFor = (
  network: Network,
  net: ResolvedNetwork
): AuthNetworkResolution => {
  const agentOptions = agentOptionsFor(net)
  const env = net.trustsEnv ? readCanisterEnv() : undefined
  const authorizeUrl = cookieAuthorizeUrl(env)
  const projectCanister = cookieInternetIdentity(env)

  if (authorizeUrl !== undefined) {
    return {
      network: {
        agentOptions,
        identityProvider: {
          authorizeUrl,
          canisterId: projectCanister ?? INTERNET_IDENTITY,
        },
      },
    }
  }

  const mainnet = verifiesAsMainnet(net)
  if (projectCanister !== undefined) {
    return mainnet
      ? { network: { agentOptions } }
      : {
          network: { agentOptions },
          gap:
            `the ic_env cookie names an internet_identity canister (${projectCanister}) ` +
            `but no INTERNET_IDENTITY_PROVIDER, and its sign-in URL cannot be derived from its id`,
        }
  }

  const localHost =
    network === "local" ||
    (typeof network === "object" &&
      isLocalHostname(agentHostnameOf(network.host)))
  const builtIn = localHost ? builtInAuthorizeUrl(net.host) : undefined
  if (builtIn !== undefined) {
    return {
      network: {
        agentOptions,
        identityProvider: {
          authorizeUrl: builtIn,
          canisterId: INTERNET_IDENTITY,
        },
      },
    }
  }

  if (network === "env" && pageIsLocal()) {
    const why = net.trustsEnv
      ? `whose ic_env cookie names no INTERNET_IDENTITY_PROVIDER`
      : `with allowEnvConfig: false, so no INTERNET_IDENTITY_PROVIDER is read from the ic_env cookie`
    return {
      network: { agentOptions },
      gap:
        `network "env" on a local page ${why}: ` +
        `the agent's host (${net.host}) does not say where icp-cli's built-in Internet Identity is`,
    }
  }

  if (!mainnet) {
    return {
      network: { agentOptions },
      gap: `its root key is not mainnet's, and nothing names an identity provider for it`,
    }
  }

  return { network: { agentOptions } }
}
