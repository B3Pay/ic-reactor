import { isReactorError } from "@ic-reactor/core"
import type { CanisterInterface, MethodInfo } from "../interface/types.ts"
import { toHex } from "../lib/hex.ts"
import { errorSummary } from "./error-info.ts"
import { clip, type HistoryEntry } from "./history.ts"

/**
 * Arguments larger than this are not kept: the entry records the call, but
 * cannot replay it. Storage is a few megabytes for the whole site.
 */
export const HISTORY_ARGS_MAX_BYTES = 16 * 1024

/** How a call ended, as the runner saw it. */
export type CallResult =
  | { readonly ok: true; readonly reply: unknown }
  | { readonly ok: false; readonly error: unknown }

export interface SettledCall {
  readonly iface: CanisterInterface
  readonly method: MethodInfo
  /** The principal the call went out as. */
  readonly caller: string
  /** The exact argument bytes sent. */
  readonly bytes: Uint8Array
  readonly result: CallResult
  /** A prefix for the summary, such as "re-send". */
  readonly note?: string
}

/**
 * A value as short, plain text for a history line: bigints as digits, bytes
 * as their length, at most `max` characters. Not a format to read back:
 * the entry's `argsHex` is what replays a call.
 */
export function shortValue(value: unknown, max = 160): string {
  if (value === undefined) return "no reply value"
  let out = ""
  const seen = new Set<object>()
  const walk = (v: unknown, depth: number): void => {
    if (out.length > max) return
    if (v === null || v === undefined) out += String(v)
    else if (typeof v === "bigint") out += v.toString()
    else if (typeof v === "string") out += JSON.stringify(v)
    else if (typeof v !== "object") out += String(v)
    else if (v instanceof Uint8Array) out += `<${v.length} bytes>`
    else if (depth > 8 || seen.has(v)) out += "…"
    else {
      seen.add(v)
      const array = Array.isArray(v)
      const keys = array ? undefined : Object.keys(v)
      const count = keys === undefined ? (v as unknown[]).length : keys.length
      out += array ? "[" : "{"
      // Stops at the budget: a reply can hold a million items.
      for (let i = 0; i < count && out.length <= max; i++) {
        if (i > 0) out += ", "
        const key = keys?.[i]
        if (key !== undefined) out += `${key}: `
        walk(
          key === undefined
            ? (v as unknown[])[i]
            : (v as Record<string, unknown>)[key],
          depth + 1
        )
      }
      out += array ? "]" : "}"
    }
  }
  walk(value, 0)
  return clip(out, max)
}

function summaryOf(result: CallResult): string {
  if (result.ok) return `ok: ${shortValue(result.reply)}`
  const { error } = result
  if (isReactorError(error) && error.kind === "canister_err") {
    return `Err: ${shortValue(error.err)}`
  }
  return errorSummary(error)
}

/**
 * The history entry of a settled call. `at` and `id` come from the caller
 * (an event handler: the clock and randomness never run in render).
 */
export function historyEntryOf(
  call: SettledCall,
  at: number,
  id: string
): HistoryEntry {
  const { iface, method, result } = call
  const keepArgs = call.bytes.length <= HISTORY_ARGS_MAX_BYTES
  const summary = [
    call.note,
    summaryOf(result),
    keepArgs ? undefined : "(arguments too large to keep)",
  ]
    .filter((part): part is string => part !== undefined)
    .join(" ")
  const error = result.ok ? undefined : result.error
  const failure = isReactorError(error) ? error : undefined
  return {
    id,
    at,
    canisterId: iface.canisterId,
    canisterName: clip(iface.name, 120),
    method: method.name,
    mode: method.mode,
    caller: call.caller,
    argsHex: keepArgs ? toHex(call.bytes) : "",
    outcome: result.ok
      ? "ok"
      : failure?.kind === "canister_err"
        ? "canister_err"
        : "error",
    ...(failure === undefined
      ? {}
      : { kind: failure.kind, mayHaveExecuted: failure.mayHaveExecuted }),
    summary: clip(summary),
  }
}
