/**
 * Creates a stable string representation of any JavaScript value
 * Handles circular references and maintains consistent object key ordering
 */
export function stringifyStable(value: unknown): string {
  const seen = new WeakSet()

  return JSON.stringify(value, (_, value) => {
    if (value === undefined) return "[undefined]"
    if (value === null) return "[null]"
    if (Number.isNaN(value)) return "[NaN]"
    if (value === Infinity) return "[Infinity]"
    if (value === -Infinity) return "[-Infinity]"
    if (typeof value === "bigint") return value.toString()
    if (typeof value === "function") return value.toString()
    if (value instanceof Date) return value.toISOString()
    if (value instanceof RegExp) return value.toString()
    if (ArrayBuffer.isView(value)) {
      return Array.from(value as Uint8Array).join(",")
    }

    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]"
      seen.add(value)

      if (Array.isArray(value)) {
        return value
      }

      const sortedObj: Record<string, unknown> = {}
      const sortedKeys = Object.keys(value).sort()
      for (const key of sortedKeys) {
        sortedObj[key] = value[key]
      }
      return sortedObj
    }

    return value
  })
}

/**
 * Creates a simple numeric hash code and returns it as a hex string
 * @param value - Any JavaScript value
 * @param length - Desired length of the hex string (default: 8)
 * @returns string - Hex string of specified length
 */
export function createSimpleHash(value: unknown, length = 8): string {
  const str = stringifyStable(value)
  let hash = 0

  // Generate a more distributed hash
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }

  // Convert to positive hex string and ensure proper length
  const positiveHash = Math.abs(hash)
  const hexString = positiveHash.toString(16)

  // Pad with zeros to match desired length
  return hexString.padStart(length, "0")
}
