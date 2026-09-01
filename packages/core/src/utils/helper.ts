import { LOCAL_HOSTS, REMOTE_HOSTS } from "./constants.js"
import { CanisterError } from "../errors/index.js"
import { OkResult } from "../types/index.js"

export const generateKey = (args: any[]) => {
  return JSON.stringify(args, (_, v) =>
    typeof v === "bigint" ? v.toString() : v
  )
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Make one query-key segment safe for React Query's `JSON.stringify` hashing by
 * rendering BigInt values as strings.
 *
 * Only arrays and plain objects are walked. Class instances (a `Principal`, a
 * `Date`) are returned untouched so their existing hash is preserved — this
 * converts what would otherwise throw, and changes nothing else.
 */
export const toHashableKeySegment = (value: unknown): unknown => {
  if (typeof value === "bigint") return value.toString()
  if (Array.isArray(value)) return value.map(toHashableKeySegment)
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        toHashableKeySegment(item),
      ])
    )
  }
  return value
}

const getEnv = () => {
  try {
    return process.env
  } catch {
    return undefined
  }
}

/**
 * Checks if the current environment is local or development.
 *
 * Honors both legacy `DFX_NETWORK` (dfx) and `ICP_NETWORK` (icp-cli).
 *
 * @returns `true` if running in a local or development environment, otherwise `false`.
 */
export const isInLocalOrDevelopment = () => {
  const env = getEnv()
  return env?.DFX_NETWORK === "local" || env?.ICP_NETWORK === "local"
}

/**
 * Retrieves the network from the process environment variables.
 *
 * Honors both legacy `DFX_NETWORK` (dfx) and `ICP_NETWORK` (icp-cli),
 * with `ICP_NETWORK` taking precedence when both are set.
 *
 * @returns The network name, defaulting to "ic" if not specified.
 */
export const getProcessEnvNetwork = () => {
  const env = getEnv()
  return env?.ICP_NETWORK ?? env?.DFX_NETWORK ?? "ic"
}

/**
 * Detect whether the runtime should be considered *development*.
 *
 * Checks in order:
 * - `import.meta.env?.DEV` (Vite / ESM environments)
 * - `process.env.NODE_ENV === 'development'` (Node)
 * - `process.env.DFX_NETWORK === 'local'` (dfx local replica)
 * - `process.env.ICP_NETWORK === 'local'` (icp-cli local network)
 */
export const isDev = (): boolean => {
  const importMetaDev =
    typeof import.meta !== "undefined" && (import.meta as any).env?.DEV
  const env = getEnv()
  const nodeDev =
    env?.NODE_ENV === "development" ||
    env?.DFX_NETWORK === "local" ||
    env?.ICP_NETWORK === "local"

  return Boolean(importMetaDev || nodeDev)
}

/**
 * Extract the hostname from a host string that may or may not carry a scheme.
 *
 * @returns the hostname, or `undefined` when the value cannot be parsed.
 */
const parseHostname = (host: string): string | undefined => {
  try {
    return new URL(
      host.startsWith("http")
        ? host
        : `${typeof window !== "undefined" ? window.location.protocol : "https:"}//${host}`
    ).hostname
  } catch {
    return undefined
  }
}

/** 127.0.0.0/8 — the entire IPv4 loopback range, not just 127.0.0.1. */
const IPV4_LOOPBACK = /^127\.(?:\d{1,3}\.){2}\d{1,3}$/

/**
 * Whether the configuration carried by the `ic_env` cookie may be trusted for a
 * host: its root key, its Internet Identity provider, and the canister IDs a
 * reactor resolves by name.
 *
 * This is a POSITIVE allowlist, and deliberately not `!isMainnetHost(host)`.
 * `isMainnetHost` recognises exactly three mainnet domains, so every other host
 * — including a production dapp served from an `ic-domains` custom domain —
 * fell through it and accepted a root key supplied by a cookie. Cookies are not
 * origin-isolated, so any sibling subdomain of the registrable domain could
 * substitute the key that certificate verification is checked against.
 *
 * The same reasoning covers the canister ID a `Reactor` resolves when none is
 * configured: a substituted ID is not something certificate verification can
 * catch, because the attacker names a real canister whose responses verify
 * against the real root key.
 *
 * Accepted: loopback, `localhost` and its subdomains, and the dev-container
 * domains that tunnel a local replica. Everything else must opt in explicitly
 * through `allowEnvConfig`. `ClientManager` resolves this once into
 * `trustsEnvConfig`; prefer reading that over calling this again, so every
 * consumer of the cookie agrees.
 *
 * @param host - The host URL to evaluate.
 * @returns `true` only for hosts that are unambiguously a local replica.
 */
export const allowsEnvRootKey = (host?: string): boolean => {
  if (!host) return false

  const hostname = parseHostname(host)
  if (!hostname) return false

  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true
  // The whole of 127.0.0.0/8 is loopback, not just 127.0.0.1 — a replica bound
  // to 127.0.0.2 is exactly as local, and rejecting it here would leave the
  // agent on the pinned mainnet key (getNetworkByHostname also classifies it as
  // "ic", so nothing else would fetch the replica's key either) and every
  // certified call to it would fail.
  if (
    IPV4_LOOPBACK.test(hostname) ||
    hostname === "::1" ||
    hostname === "[::1]"
  ) {
    return true
  }

  // Codespaces / Gitpod forward a local replica over a generated domain.
  return getNetworkByHostname(hostname) === "remote"
}

/**
 * Checks if a given host URL is a mainnet Internet Computer boundary node host.
 *
 * Note this recognises only the canonical boundary domains: a mainnet dapp on a
 * custom domain returns `false`. Do not use it as a "safe to trust local
 * configuration" test — see {@link allowsEnvRootKey}.
 *
 * @param host - The host URL to evaluate.
 * @returns `true` if the host is a mainnet host, default to true if host is undefined, otherwise `false`.
 */
export const isMainnetHost = (host?: string): boolean => {
  if (!host) return true

  try {
    const hostname = parseHostname(host)
    if (!hostname) return false
    return (
      hostname === "ic0.app" ||
      hostname.endsWith(".ic0.app") ||
      hostname === "icp0.io" ||
      hostname.endsWith(".icp0.io") ||
      hostname === "icp-api.io" ||
      hostname.endsWith(".icp-api.io")
    )
  } catch {
    return false
  }
}

/**
 * Determines the network type based on the provided hostname.
 *
 * @param hostname - The hostname to evaluate.
 * @returns A string indicating the network type: "local", "remote", or "ic".
 */
export function getNetworkByHostname(
  hostname: string
): "local" | "remote" | "ic" {
  if (LOCAL_HOSTS.some((host) => hostname.endsWith(host))) {
    return "local"
  } else if (REMOTE_HOSTS.some((host) => hostname.endsWith(host))) {
    return "remote"
  } else {
    return "ic"
  }
}

/**
 * Helper function for extracting the value from a compiled result { Ok: T } or throw a CanisterError if { Err: E }
 * Supports both uppercase (Ok/Err - Rust) and lowercase (ok/err - Motoko) conventions.
 *
 * @param result - The compiled result to extract from.
 * @returns The extracted value from the compiled result.
 * @throws CanisterError with the typed error value if result is { Err: E } or { err: E }
 */
export function extractOkResult<T>(result: T): OkResult<T> {
  if (!result || typeof result !== "object") {
    // Non-object, return as-is
    return result as OkResult<T>
  }

  // Handle { Ok: T } (Rust convention)
  if ("Ok" in result) {
    return result.Ok as OkResult<T>
  }
  // Handle { ok: T } (Motoko convention)
  if ("ok" in result) {
    return result.ok as OkResult<T>
  }

  // Handle { Err: E } (Rust convention) - throw CanisterError
  if ("Err" in result) {
    throw new CanisterError(result.Err)
  }
  // Handle { err: E } (Motoko convention) - throw CanisterError
  if ("err" in result) {
    throw new CanisterError(result.err)
  }

  // Non-Result type, return as-is
  return result as OkResult<T>
}

export const isNullish = (value: unknown): value is null | undefined =>
  value === null || value === undefined

export const nonNullish = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined

/**
 * Converts a Uint8Array or number array to a hex string (without 0x prefix)
 */
export const uint8ArrayToHex = (bytes: Uint8Array | number[]): string => {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Converts a hex string to Uint8Array (accepts with or without 0x prefix)
 */
export const hexToUint8Array = (hex: string): Uint8Array<ArrayBuffer> => {
  // Strip optional 0x prefix
  const stripped = hex.replace(/^0x/i, "")

  // Reject any character that is not a valid hex digit
  if (/[^0-9a-f]/i.test(stripped)) {
    throw new TypeError(
      `[ic-reactor] hexToUint8Array: invalid hex string "${hex}" — only 0-9 and a-f characters are allowed (optional 0x prefix accepted)`
    )
  }

  const normalized = stripped.toLowerCase()

  // Handle odd-length hex strings by padding with leading zero
  const paddedHex = normalized.length % 2 ? `0${normalized}` : normalized

  return new Uint8Array(
    paddedHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  )
}

/**
 * Formats hex string with 0x prefix for display purposes
 */
export const formatHexDisplay = (hex: string): `0x${string}` => {
  const normalized = hex.replace(/^0x/i, "")
  return `0x${normalized}`
}

/**
 * Converts a JSON-serializable value to a string, handling BigInt values.
 * @param value - The value to convert
 * @returns A string representation of the value
 */
export const jsonToString = (value: any): string => {
  return JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2
  )
}
