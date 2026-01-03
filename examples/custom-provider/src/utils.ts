/**
 * Utility function to stringify values with BigInt support.
 */
export const jsonToString = (value: unknown): string => {
  return JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2
  )
}
