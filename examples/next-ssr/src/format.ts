// Display helpers shared by server and client components. Nothing here turns a
// bigint into a number: amounts go through `formatUnits`.
import { isPrincipal } from "@candid-core/schema"
import { formatUnits } from "@ic-reactor/core"
import type { Value } from "@/canisters/icrc1"

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

/** `units` base units as tokens: `formatUnits` places the point, exactly. */
export const tokens = (units: bigint, decimals: number, symbol: string) =>
  `${formatUnits(units, decimals)} ${symbol}`

/**
 * What a value is at run time, as the page shows it next to the value: how a
 * reader sees that hydration gave back a `bigint` or a `Uint8Array`, and not
 * the string or the object of numbered keys JSON would have made of it.
 */
export function runtimeType(value: unknown): string {
  if (value instanceof Uint8Array) return `Uint8Array(${value.length})`
  if (value === null) return "null"
  return typeof value
}

/**
 * A Candid `principal` is principal text at run time (candid-core's
 * `Principal` is a branded string). After hydration it must still be
 * canonical principal text, which `isPrincipal` checks.
 */
export const principalType = (text: string): string =>
  isPrincipal(text) ? "principal text" : "not principal text"

/** An `icrc1_metadata` value as text; a long one (a logo's data URL) is cut. */
export function metadataText(value: Value): string {
  switch (value.tag) {
    case "Nat":
    case "Int":
      return value.value.toString()
    case "Blob":
      return `0x${toHex(value.value)}`
    case "Text":
      return value.value.length > 48
        ? `${value.value.slice(0, 48)}… (${value.value.length} characters)`
        : value.value
  }
}
