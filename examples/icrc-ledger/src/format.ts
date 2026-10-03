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

/** An ICRC-1 subaccount is exactly this many bytes; a ledger traps on others. */
export const SUBACCOUNT_BYTES = 32

/**
 * Hex text as subaccount bytes; empty is `null`, the default account.
 *
 * A subaccount is 32 bytes, and a ledger traps on any other length, so the
 * text is refused here rather than sent. Fewer than 64 digits are read as a
 * number and padded with zeros on the left, as wallets show subaccounts
 * (`1` is subaccount 1): the bytes are always 32 long.
 */
export function parseSubaccount(text: string): SubaccountInput {
  const hex = text.trim().replace(/^0x/i, "")
  if (hex === "") return { ok: true, bytes: null }
  if (!/^[0-9a-f]*$/i.test(hex)) {
    return { ok: false, reason: "A subaccount is hex digits only." }
  }
  if (hex.length > SUBACCOUNT_BYTES * 2) {
    return {
      ok: false,
      reason: `A subaccount is ${SUBACCOUNT_BYTES} bytes: at most ${SUBACCOUNT_BYTES * 2} hex digits.`,
    }
  }
  const padded = hex.padStart(SUBACCOUNT_BYTES * 2, "0")
  const bytes = new Uint8Array(SUBACCOUNT_BYTES)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16)
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
