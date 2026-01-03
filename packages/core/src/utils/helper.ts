import { LOCAL_HOSTS, REMOTE_HOSTS } from "./constants"
import { CanisterError } from "../errors"
import { OkResult } from "../types"

export const generateKey = (args: any[]) => {
  return JSON.stringify(args, (_, v) =>
    typeof v === "bigint" ? v.toString() : v
  )
}

/**
 * Checks if the current environment is local or development.
 *
 * @returns `true` if running in a local or development environment, otherwise `false`.
 */
export const isInLocalOrDevelopment = () => {
  return typeof process !== "undefined" && process.env.DFX_NETWORK === "local"
}

/**
 * Retrieves the network from the process environment variables.
 *
 * @returns The network name, defaulting to "ic" if not specified.
 */
export const getProcessEnvNetwork = () => {
  if (typeof process === "undefined") return "ic"
  else return process.env.DFX_NETWORK ?? "ic"
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

export const uint8ArrayToHex = (
  bytes: Uint8Array | number[]
): `0x${string}` => {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `0x${hex}`
}

export const hexToUint8Array = (hex: string): Uint8Array<ArrayBuffer> => {
  if (hex.startsWith("0x")) {
    hex = hex.slice(2)
  }
  return new Uint8Array(
    hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  )
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
