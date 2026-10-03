// Text from the command line to the values a call takes, or a refusal before
// anything is sent.
//
// Library rules shown here (packages/core/llms.txt, "Values"):
// - a principal is made with `principal(text)`, which throws for text that is
//   not one; the refusal is caught and reported, never cast around;
// - a token amount is read with `parseUnits(text, decimals)`, which throws for
//   "1e3", "1,5", a negative or too many fraction digits. Never `Number()`.
//
// Every function throws a UsageError: exit code 2, kind "usage", nothing sent.
import { principal, type Principal } from "@candid-core/schema"
import { parseUnits } from "@ic-reactor/core"

/** Input refused by this tool before the client was asked to do anything. */
export class UsageError extends Error {
  override name = "UsageError"
  /** The command the input was for, when the command line got that far. */
  readonly command: string | undefined

  constructor(message: string, command?: string) {
    super(message)
    this.command = command
  }
}

const reason = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^\[ic-reactor\] /,
    ""
  )

/** A principal typed by a person or an agent. */
export function principalArg(text: string, what: string): Principal {
  try {
    return principal(text)
  } catch (error) {
    throw new UsageError(
      `${what} ${JSON.stringify(text)} is not a principal (${reason(error)})`
    )
  }
}

/** An amount in tokens, such as "1.5", as base units of a ledger with `decimals`. */
export function amountArg(
  text: string,
  decimals: number,
  what: string
): bigint {
  try {
    return parseUnits(text, decimals)
  } catch (error) {
    throw new UsageError(
      `${what} ${JSON.stringify(text)} is not an amount of a token with ${decimals} decimals (${reason(error)})`
    )
  }
}

/** Hex text as bytes; `length` pins the byte count. */
export function hexArg(
  text: string,
  what: string,
  length?: number
): Uint8Array {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(text)) {
    throw new UsageError(`${what} ${JSON.stringify(text)} is not hex`)
  }
  const bytes = Uint8Array.from(text.match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16)
  )
  if (length !== undefined && bytes.length !== length) {
    throw new UsageError(
      `${what} is ${length} bytes (${length * 2} hex digits), got ${bytes.length}`
    )
  }
  return bytes
}

/** An ICRC-1 subaccount: exactly 32 bytes of hex. */
export const subaccountArg = (text: string, what: string): Uint8Array =>
  hexArg(text, what, 32)

/**
 * A whole number of nanoseconds. Only the form is checked here: a value past
 * the `nat64` range is left to the client, which refuses to encode it
 * (`invalid_args`) before sending.
 */
export function nanosArg(text: string, what: string): bigint {
  if (!/^\d+$/.test(text)) {
    throw new UsageError(
      `${what} ${JSON.stringify(text)} is not a whole number of nanoseconds`
    )
  }
  return BigInt(text)
}

/** A polling interval in milliseconds, at least 100. */
export function intervalArg(text: string): number {
  const ms = /^\d+$/.test(text) ? Number.parseInt(text, 10) : Number.NaN
  if (!Number.isSafeInteger(ms) || ms < 100) {
    throw new UsageError(
      `--interval ${JSON.stringify(text)} is not a number of milliseconds of at least 100`
    )
  }
  return ms
}

/** Bytes as lowercase hex. */
export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
