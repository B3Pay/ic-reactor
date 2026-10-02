import { principal } from "@candid-core/schema"
import type { Value } from "./canisters/icrc1.ts"

/** Why `text` is not canonical principal text, or `undefined` when it is. */
export function principalProblem(text: string): string | undefined {
  try {
    principal(text)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

export type SubaccountInput =
  { ok: true; bytes: Uint8Array | null } | { ok: false; reason: string }

/** Hex text as subaccount bytes; empty is `null`, the default account. */
export function parseSubaccount(text: string): SubaccountInput {
  const hex = text.trim().replace(/^0x/i, "")
  if (hex === "") return { ok: true, bytes: null }
  if (!/^[0-9a-f]*$/i.test(hex)) {
    return { ok: false, reason: "A subaccount is hex digits only." }
  }
  if (hex.length % 2 !== 0) {
    return { ok: false, reason: "Hex needs an even number of digits." }
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return { ok: true, bytes }
}

/** A long principal cut to its ends: `psith…4ae`. */
export const shortPrincipal = (text: string): string =>
  text.length > 16 ? `${text.slice(0, 5)}…${text.slice(-3)}` : text

/** An `icrc1_metadata` value as text; long text (a logo's data URL) is cut. */
export function metadataText(value: Value): string {
  switch (value.tag) {
    case "Nat":
    case "Int":
      return value.value.toString()
    case "Blob":
      return `0x${toHex(value.value)}`
    case "Text":
      return value.value.length > 60
        ? `${value.value.slice(0, 60)}… (${value.value.length} characters)`
        : value.value
  }
}
