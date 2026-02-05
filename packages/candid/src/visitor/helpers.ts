import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"

export const extractAndSortArgs = <T extends Record<string, unknown>>(
  argsObject: T
): Array<T[keyof T]> => {
  if (!argsObject || typeof argsObject !== "object") return []

  const args: Array<T[keyof T]> = []
  let index = 0

  while (Object.prototype.hasOwnProperty.call(argsObject, `arg${index}`)) {
    args.push(argsObject[`arg${index}`] as T[keyof T])
    index++
  }

  return args
}

/**
 * Normalize form state by converting objects with numeric string keys to arrays.
 * TanStack Form sometimes creates { "0": value, "1": value } instead of [value, value]
 * when using indexed field paths like "parent.0.child".
 *
 * This function also handles the variant cleanup case where objects have mixed
 * numeric and named keys (e.g., { "0": old, "Add": current }) by removing
 * orphaned numeric keys.
 *
 * This function recursively processes the form state and fixes these issues.
 */
export const normalizeFormState = <T>(value: T): T => {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value
  }

  // Handle arrays - recursively normalize each element
  if (Array.isArray(value)) {
    return value.map(normalizeFormState) as T
  }

  // Handle objects
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)

    // Separate numeric and non-numeric keys
    const numericKeys = keys.filter((k) => /^\d+$/.test(k))
    const namedKeys = keys.filter((k) => !/^\d+$/.test(k))

    // Case 1: All keys are numeric - convert to array
    if (numericKeys.length > 0 && namedKeys.length === 0) {
      const sortedNums = numericKeys.map(Number).sort((a, b) => a - b)
      // Check if keys are consecutive starting from 0
      if (sortedNums.every((num, idx) => num === idx)) {
        return sortedNums.map((k) => normalizeFormState(obj[String(k)])) as T
      }
    }

    // Case 2: Mixed keys (variant case) - keep only named keys, remove orphan numeric keys
    if (numericKeys.length > 0 && namedKeys.length > 0) {
      const result: Record<string, unknown> = {}
      for (const key of namedKeys) {
        result[key] = normalizeFormState(obj[key])
      }
      return result as T
    }

    // Case 3: All named keys - recursively normalize all values
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(obj)) {
      result[key] = normalizeFormState(val)
    }
    return result as T
  }

  // Return primitives as-is
  return value
}

export const convertNanoToDate = (nano: bigint) => {
  return new Date(Number(nano) / 1000000)
}

export const convertToCycle = (cycles: bigint) => {
  const mcycles = cycles / BigInt(1_000_000)
  if (mcycles >= BigInt(1_000_000)) {
    const tcycles = mcycles / BigInt(1_000_000)
    return `${tcycles.toLocaleString()} T`
  }
  return `${mcycles.toLocaleString()} M`
}

export const convertStringToNumber = (value: string) => {
  const bits = value.length
  if (bits >= 16) {
    return BigInt(value)
  } else {
    return Number(value)
  }
}

export const validateNumberError = (t: IDL.Type) => {
  return function validate(value: string) {
    if (value === "") {
      return true
    }

    const bits = value.length
    if (bits >= 16) {
      try {
        const valueAsBigInt = BigInt(value)
        t.covariant(valueAsBigInt)
        return true
      } catch (error) {
        return (error as Error).message || "Failed to convert to BigInt"
      }
    } else {
      try {
        const valueAsNumber = Number(value)
        t.covariant(valueAsNumber)
        return true
      } catch (error) {
        return (error as Error).message || "Failed to convert to number"
      }
    }
  }
}

export const validateError = (t: IDL.Type) => {
  return function validate(value: unknown) {
    try {
      t.covariant(value)
      return true
    } catch (error) {
      return (error as Error).message || "An error occurred"
    }
  }
}

export function isQuery(func: IDL.FuncClass): boolean {
  return (
    func.annotations.includes("query") ||
    func.annotations.includes("composite_query")
  )
}

export function isUrl(str: string): boolean {
  if (typeof str !== "string") return false
  return str.startsWith("http") || str.startsWith("https")
}

export function isImage(str: string): boolean {
  if (typeof str !== "string") return false
  // Check if the string starts with 'data:image' (indicating base64-encoded image)
  if (str.startsWith("data:image")) {
    return true
  }

  // List of common image file extensions
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".svg"]

  // Check if the string ends with any of the image extensions (indicating image URL)
  if (imageExtensions.some((ext) => str.endsWith(ext))) {
    return true
  }

  return false
}

export function isUuid(str: string): boolean {
  if (typeof str !== "string") return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str
  )
}

export function isPrincipalId(str: string): boolean {
  if (typeof str !== "string") return false
  try {
    Principal.fromText(str)
    return true
  } catch {
    return false
  }
}

export function isCanisterId(str: string): boolean {
  if (typeof str !== "string") return false
  if (!isPrincipalId(str)) return false
  if (str.length !== 27) return false
  // All canister IDs end with "-cai"
  return str.endsWith("-cai")
}

export function isBtcAddress(str: string): boolean {
  if (typeof str !== "string") return false
  // Bech32 (Mainnet: bc1, Testnet: tb1, Regtest: bcrt1)
  if (/^(bc1|tb1|bcrt1)[a-zA-HJ-NP-Z0-9]{25,60}$/.test(str)) return true
  // Base58 (Mainnet: 1/3, Testnet: m/n/2)
  if (/^[13mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(str)) return true
  return false
}

export function isEthAddress(str: string): boolean {
  if (typeof str !== "string") return false
  return /^0x[a-fA-F0-9]{40}$/.test(str)
}

export function isAccountIdentifier(str: string): boolean {
  if (typeof str !== "string") return false
  // 64 characters hex string (standard for ICP account ids and hashes)
  return /^[a-fA-F0-9]{64}$/.test(str)
}

export function isIsoDate(str: string): boolean {
  if (typeof str !== "string") return false
  // Basic ISO 8601 / RFC 3339 format check
  // YYYY-MM-DDTHH:mm:ss.sssZ (optional milliseconds/nanoseconds and timezone)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(
    str
  )
}

export function uint8ArrayToHexString(bytes: Uint8Array | number[]): string {
  if (!bytes) return ""
  if (Array.isArray(bytes)) {
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("")
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
