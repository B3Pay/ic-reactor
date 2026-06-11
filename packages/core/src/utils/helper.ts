import { LOCAL_HOSTS, REMOTE_HOSTS } from "./constants"
import { CanisterError } from "../errors"
import { OkResult } from "../types"

export const generateKey = (args: any[]) => {
  return JSON.stringify(args, (_, v) =>
    typeof v === "bigint" ? v.toString() : v
  )
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
 * Checks if a given host URL is a mainnet Internet Computer boundary node host.
 *
 * @param host - The host URL to evaluate.
 * @returns `true` if the host is a mainnet host, default to true if host is undefined, otherwise `false`.
 */
export const isMainnetHost = (host?: string): boolean => {
  if (!host) return true

  try {
    const url = new URL(
      host.startsWith("http")
        ? host
        : `${typeof window !== "undefined" ? window.location.protocol : "https:"}//${host}`
    )
    const hostname = url.hostname
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
