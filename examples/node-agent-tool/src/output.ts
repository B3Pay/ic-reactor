// Scenario 6, machine-readable output for agents: `--json` on every command.
//
// What an agent can rely on (the README's "JSON output" section):
//
// - stdout carries one JSON document per line: one per command, and for
//   `watch` and `demo` one per event (newline-delimited JSON);
// - every document has `ok` and `command`; a failure is
//   `{ ok: false, command, kind, mayHaveExecuted, message, ... }`, where `kind`
//   is the ReactorError kind (or "usage", "unexpected") and `mayHaveExecuted`
//   says whether a write may have happened anyway;
// - a bigint (a `nat`, a balance, a block index, nanoseconds) is a decimal
//   string, never a number, so no digit is lost; bytes are lowercase hex;
// - the exit code is the kind's (src/failure.ts).
//
// Without --json the same results are lines for a person, and failures go to
// stderr.
//
// Text a ledger sends (its name and symbol, an error message) ends up in that
// output, and a terminal acts on some characters instead of showing them: an
// escape sequence can move the cursor, rewrite lines already printed or set
// the clipboard, a line break can add a line that looks like the CLI's own,
// and a bidirectional override can reverse an amount. So no such character is
// printed raw, in either mode.
import { formatUnits } from "@ic-reactor/core"
import type { FailureKind } from "./failure.ts"
import { toHex } from "./input.ts"

/** Where output goes: the process's streams, or a buffer in the tests and the demo. */
export interface Io {
  readonly stdout: (line: string) => void
  readonly stderr: (line: string) => void
}

/** A value a document can hold. `bigint` and `Uint8Array` are written as text. */
export type Json =
  | null
  | boolean
  | number
  | string
  | bigint
  | Uint8Array
  | readonly Json[]
  | { readonly [field: string]: Json | undefined }

/** A command's result. */
export interface SuccessDoc {
  readonly ok: true
  readonly command: string
  readonly [field: string]: Json | undefined
}

/** A command's failure. */
export interface FailureDoc {
  readonly ok: false
  /** `null` when the command line itself could not be read. */
  readonly command: string | null
  readonly kind: FailureKind
  readonly mayHaveExecuted: boolean
  readonly message: string
  readonly [field: string]: Json | undefined
}

/**
 * Whether a terminal may act on a character rather than show it: a C0 or C1
 * control (line breaks and escape included), DEL, or a bidirectional
 * formatting character.
 */
function unsafe(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x61c ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  )
}

/** `text` with each unsafe character written by `escape`. */
function escapeUnsafe(text: string, escape: (code: number) => string): string {
  let escaped = ""
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    escaped += unsafe(code) ? escape(code) : char
  }
  return escaped
}

/**
 * A line a terminal shows as written: each unsafe character spelled out, an
 * escape as `\u{1b}`.
 */
export const printable = (line: string): string =>
  escapeUnsafe(line, (code) => `\\u{${code.toString(16)}}`)

/**
 * One line of JSON: bigints as decimal strings, bytes as hex. JSON escapes
 * the C0 controls itself; the other unsafe characters are escaped here
 * (`\u009b`), so the line holds none raw and parses back to the same text.
 */
export function stringify(doc: Json): string {
  const text = JSON.stringify(doc, (_key, value: unknown) =>
    typeof value === "bigint"
      ? value.toString()
      : value instanceof Uint8Array
        ? toHex(value)
        : value
  )
  return escapeUnsafe(
    text,
    (code) => `\\u${code.toString(16).padStart(4, "0")}`
  )
}

/**
 * Prints results and failures in the mode the command line chose. Without
 * --json each line goes through `printable`, so an entry of `lines` is one
 * line: a line break inside it is shown as `\u{a}`, not taken.
 */
export interface Output {
  readonly json: boolean
  /** A result: its document in --json mode, else `lines` on stdout. */
  result(doc: SuccessDoc, lines: readonly string[]): void
  /** A failure: its document on stdout in --json mode, else `lines` on stderr. */
  failure(doc: FailureDoc, lines: readonly string[]): void
  /** A line for a person (progress, a hint); nothing in --json mode. */
  note(line: string): void
}

export function createOutput(io: Io, json: boolean): Output {
  return {
    json,
    result(doc, lines) {
      if (json) io.stdout(stringify(doc))
      else for (const line of lines) io.stdout(printable(line))
    },
    failure(doc, lines) {
      if (json) io.stdout(stringify(doc))
      else for (const line of lines) io.stderr(printable(line))
    },
    note(line) {
      if (!json) io.stdout(printable(line))
    },
  }
}

/** An amount as an agent reads it: base units for arithmetic, tokens to show. */
export const amount = (
  units: bigint,
  decimals: number
): { units: bigint; tokens: string } => ({
  units,
  tokens: formatUnits(units, decimals),
})

/** Label and value rows, the labels padded to one width. */
export function rows(
  entries: ReadonlyArray<readonly [label: string, value: string]>
): string[] {
  const width = Math.max(...entries.map(([label]) => label.length))
  return entries.map(([label, value]) => `${label.padEnd(width)}  ${value}`)
}
