import { Principal } from "@icp-sdk/core/principal"
import { LOCAL_HOSTS, REMOTE_HOSTS } from "./constants.js"
import { BlobKey, RefusedKey } from "./args-key.js"
import { CanisterError } from "../errors/index.js"
import { OkResult } from "../types/index.js"

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Leads the key of a float that JSON has no number for, of a blob, and of a
 * value the reactor refuses. A string that already starts with it gets one
 * more in front, so the count of leading U+0000s tells the cases apart: none
 * for any other string (or a BigInt), exactly one for a tagged float, blob or
 * refused value, two or more for a string that began with U+0000. No string
 * argument can therefore serialise to a tag, and no other JSON type
 * serialises to a string at all.
 */
const SPECIAL_NUMBER_TAG = "\u0000"

/**
 * Serialise call arguments into the query-key segment that identifies them.
 *
 * Equal Candid values must give equal keys, and different values different
 * ones, which plain `JSON.stringify` does not ensure:
 *
 * - Record fields are unordered in Candid, and TanStack Query hashes object
 *   keys order-independently, so plain objects are written with their keys
 *   sorted. Otherwise `{ owner, subaccount }` and `{ subaccount, owner }` —
 *   the same record, the same bytes on the wire — got separate cache entries,
 *   and `getQueryData` / `invalidateQueries` spelled one way missed the other.
 * - JSON writes NaN, Infinity and -Infinity all as `null`, and -0 as `0`, so a
 *   query for one float was answered from another's cache entry. They are
 *   written as `"\u0000NaN"`, `"\u0000Infinity"`, `"\u0000-Infinity"` and
 *   `"\u0000-0"`, and a string that starts with U+0000 gets one more in front,
 *   so no string argument can produce that tag. It has to be unforgeable: this
 *   function is public and an infinite query's `getKeyArgs` may return any
 *   value, so a bare `"Infinity"` would let `[Infinity]` and `["Infinity"]`
 *   share a cache entry.
 * - A blob given as a `Uint8Array`, a byte array or (to a DisplayReactor) hex
 *   text sends the same bytes in every form. `Reactor.generateQueryKey` hands
 *   each blob of the method's arguments over as a `BlobKey`, written here as
 *   `"\u0000blob:"` and its lowercase hex. It carries the same tag, so no
 *   argument can produce it: not hex text given to a Reactor, which refuses it,
 *   and not a BigInt, whose digits are also hex.
 * - A value the reactor refuses can have the JSON of one it takes: `undefined`
 *   is written as `null` in an array, and a BigInt as its digits. The key hands
 *   such a value over as a `RefusedKey`, written here as `"\u0000refused:"` and
 *   the key of the value alone, behind the same tag.
 *
 * BigInts are written as decimal strings. Everything else — including every
 * string that does not start with U+0000, and an object whose keys are already
 * in sorted order — serialises exactly as before.
 */
export const generateKey = (args: any[]): string => {
  return JSON.stringify(args, (_, v: unknown) => {
    if (v instanceof BlobKey) return `${SPECIAL_NUMBER_TAG}blob:${v.hex}`
    if (v instanceof RefusedKey) {
      return `${SPECIAL_NUMBER_TAG}refused:${generateKey([v.value])}`
    }
    if (typeof v === "string") {
      return v.startsWith(SPECIAL_NUMBER_TAG) ? SPECIAL_NUMBER_TAG + v : v
    }
    if (typeof v === "bigint") return v.toString()
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return SPECIAL_NUMBER_TAG + String(v)
      if (Object.is(v, -0)) return SPECIAL_NUMBER_TAG + "-0"
      return v
    }
    if (isPlainObject(v)) {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((key) => [key, v[key]])
      )
    }
    return v
  })
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
 * A loopback address: all of 127.0.0.0/8, and the IPv6 `::1` with or without
 * the brackets a URL's `hostname` keeps around it.
 */
const isLoopbackAddress = (hostname: string): boolean =>
  IPV4_LOOPBACK.test(hostname) || hostname === "::1" || hostname === "[::1]"

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
 * Accepted: loopback and `localhost` and its subdomains. Everything else must
 * opt in explicitly through `allowEnvConfig`, including the Codespaces and
 * Gitpod domains that forward a local replica (`network` `"remote"`). Every
 * user of those platforms gets a subdomain of the same parent, which is not a
 * public suffix, so a page in a stranger's workspace can set `ic_env` for
 * yours. They used to be accepted.
 *
 * This answers the question for ONE host. `ClientManager` asks it of both the
 * agent host and the page origin — the page being what decides who can write
 * the cookie — and resolves the pair once into `trustsEnvConfig`. Prefer
 * reading that over calling this again, so every consumer of the cookie
 * agrees.
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
  // to 127.0.0.2 is exactly as local as one on 127.0.0.1, and so is ::1.
  return isLoopbackAddress(hostname)
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
 * Every loopback address is local, not only the literal `127.0.0.1`: a replica
 * on `[::1]` or `127.0.0.2` classified as "ic" was never asked for its root
 * key, so each certified response from it failed verification against the
 * pinned mainnet key.
 *
 * @param hostname - The hostname to evaluate.
 * @returns A string indicating the network type: "local", "remote", or "ic".
 */
export function getNetworkByHostname(
  hostname: string
): "local" | "remote" | "ic" {
  if (
    LOCAL_HOSTS.some((host) => hostname.endsWith(host)) ||
    isLoopbackAddress(hostname)
  ) {
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
 * A Result is a variant, so only a variant arm is unwrapped: an object whose
 * one key is the tag, besides the `_type` discriminant a display-transformed
 * variant carries, which names that tag. A record that merely has a field named
 * `ok` or `err` next to others is a value like any other, and is returned
 * whole, also when that other field is a `_type` naming something else.
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

  const arm = result as Record<string, unknown>
  const keys = Object.keys(arm)
  const tags = keys.filter((key) => key !== "_type")
  // `{ [tag]: payload }`, or `{ _type: tag, [tag]: payload }` from the display
  // codec. A `_type` naming anything else is a record's own field:
  // `{ _type: "health", ok: true }` is a two-field record, not an `ok` arm.
  const isArm =
    tags.length === 1 && (keys.length === 1 || arm._type === tags[0])
  if (!isArm) {
    // Not a variant arm (a record, a tuple, ...): not a Result.
    return result as OkResult<T>
  }

  switch (tags[0]) {
    // { Ok: T } (Rust convention) and { ok: T } (Motoko convention)
    case "Ok":
    case "ok":
      return arm[tags[0]] as OkResult<T>
    // { Err: E } and { err: E } - throw CanisterError
    case "Err":
    case "err":
      throw new CanisterError(arm[tags[0]])
    default:
      // Non-Result type, return as-is
      return result as OkResult<T>
  }
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
 * Converts a hex string to Uint8Array (accepts with or without 0x prefix).
 *
 * Every byte is two hex digits, so an odd number of digits is refused. It
 * used to be padded with a leading zero, which shifts every byte by one digit:
 * a 64-digit subaccount that lost its last digit in a copy became a different
 * 32-byte subaccount, which a ledger accepts.
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

  if (stripped.length % 2 !== 0) {
    throw new TypeError(
      `[ic-reactor] hexToUint8Array: invalid hex string "${hex}" — it has an odd number of hex digits (${stripped.length}), and every byte is two`
    )
  }

  const normalized = stripped.toLowerCase()

  return new Uint8Array(
    normalized.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  )
}

/**
 * Formats hex string with 0x prefix for display purposes
 */
export const formatHexDisplay = (hex: string): `0x${string}` => {
  const normalized = hex.replace(/^0x/i, "")
  return `0x${normalized}`
}

/** The longest principal the Internet Computer accepts, in bytes. */
const MAX_PRINCIPAL_BYTES = 29

/**
 * Whether `value` is the text of a principal: a user, canister or the
 * anonymous principal, as a person pastes it into a form.
 *
 * It is `true` exactly when `value` is the canonical text of a principal of
 * at most 29 bytes, the most the Internet Computer accepts: lowercase, grouped
 * by dashes, with a matching checksum and no whitespace, so trim what a person
 * typed first. `Principal.fromText` also reads the JSON form
 * `{"__principal__":"aaaaa-aa"}`, with whitespace around it; this refuses it,
 * so text that passes is the principal's own text, fit to show, compare or put
 * in a URL. Use it where an input is validated, instead of a `try` around
 * `Principal.fromText`. A `DisplayReactor` then takes the text as it is; a
 * `Reactor` takes `Principal.fromText(text)`.
 *
 * It returns a `boolean`, not a type guard, so a `string` it refuses is still
 * typed a `string` afterwards.
 *
 * @param value - Anything; only a string can pass.
 * @returns `true` for the text of a principal.
 *
 * @example
 * ```ts
 * import { isPrincipalText } from "@ic-reactor/core"
 *
 * isPrincipalText("ryjl3-tyaaa-aaaaa-aaaba-cai") // true: a canister
 * isPrincipalText("aaaaa-aa") // true: the management canister
 * isPrincipalText("2vxsx-fae") // true: the anonymous principal
 * isPrincipalText("ryjl3-tyaaa") // false: the checksum does not match
 * isPrincipalText(" aaaaa-aa") // false: trim first
 * isPrincipalText("RYJL3-TYAAA-AAAAA-AAABA-CAI") // false: not canonical
 * isPrincipalText('{"__principal__":"aaaaa-aa"}') // false: JSON, not text
 * ```
 */
export const isPrincipalText = (value: unknown): boolean => {
  if (typeof value !== "string") return false
  try {
    const principal = Principal.fromText(value)
    // `fromText` checks its checksum against the text it decoded, which is
    // the inner text when `value` is the JSON form, so compare with `value`.
    return (
      principal.toText() === value &&
      principal.toUint8Array().length <= MAX_PRINCIPAL_BYTES
    )
  } catch {
    return false
  }
}

/** A principal, from this copy of `@icp-sdk/core` or another. */
const isPrincipalValue = (value: unknown): value is { toText(): string } =>
  typeof value === "object" &&
  value !== null &&
  (value as { _isPrincipal?: unknown })._isPrincipal === true &&
  typeof (value as { toText?: unknown }).toText === "function"

/**
 * Writes a value as indented JSON text, to show or log what a canister call
 * returned. `JSON.stringify` throws on a `bigint` and writes a principal and a
 * blob in forms nobody reads, so the values a `Reactor` returns are written as
 * a `DisplayReactor` shows them:
 *
 * - a `bigint` as its decimal digits, in quotes: `"100000000"`;
 * - a `Principal` as its text, `"aaaaa-aa"`, where `JSON.stringify` writes
 *   `{"__principal__":"aaaaa-aa"}`;
 * - a `Uint8Array` (a `blob`) as lowercase hex without `0x`, `"0a0b"`, where
 *   `JSON.stringify` writes an object keyed by index, `{"0":10,"1":11}`;
 * - any other typed array (a `vec nat16`, `vec int64`, ...) as an array of its
 *   numbers, a `bigint` among them as its digits.
 *
 * Everything else is written as `JSON.stringify(value, null, 2)` writes it. The
 * text is for people: it does not say which strings were a `bigint`, a
 * principal or bytes, so it does not parse back into the value.
 *
 * @param value - The value to write, such as a call's result.
 * @returns The value as JSON, indented by two spaces.
 *
 * @example
 * ```ts
 * import { jsonToString } from "@ic-reactor/core"
 * import { Principal } from "@icp-sdk/core/principal"
 *
 * jsonToString({
 *   owner: Principal.fromText("aaaaa-aa"),
 *   subaccount: [new Uint8Array([1, 2])],
 *   amount: 5n,
 * })
 * // {
 * //   "owner": "aaaaa-aa",
 * //   "subaccount": [
 * //     "0102"
 * //   ],
 * //   "amount": "5"
 * // }
 * ```
 */
export const jsonToString = (value: unknown): string => {
  return JSON.stringify(
    value,
    function (this: unknown, key: string, json: unknown) {
      // `json` has already been through `toJSON`, which a Principal defines,
      // so read the value itself from the object holding it.
      const raw = (this as Record<string, unknown>)[key]
      if (isPrincipalValue(raw)) return raw.toText()
      if (raw instanceof Uint8Array) return uint8ArrayToHex(raw)
      if (ArrayBuffer.isView(raw) && !(raw instanceof DataView)) {
        return Array.from(raw as unknown as ArrayLike<number | bigint>)
      }
      return typeof json === "bigint" ? json.toString() : json
    },
    2
  )
}
