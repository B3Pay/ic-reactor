import { resolveSchema, type AnyFieldSchema } from "@candid-core/schema"
import { isReactorError } from "@ic-reactor/core"
import type { HintResolver } from "../forms/hints.ts"
import type { CanisterInterface, MethodInfo } from "../interface/types.ts"
import { prepareCall, type PreparedCall } from "./prepare.ts"

// ICRC-1 ledgers (and the ICP ledger's own `transfer`) run a transaction at
// most once per sender within their window when it carries
// `created_at_time`: the same bytes from the same sender answer `Duplicate`.
// That is the only thing that makes re-sending a write with an unknown
// outcome safe, so the studio fills the field by default and offers
// `client.resendOf()` only through it. The field's shape only says a
// canister may deduplicate: the registry names the methods known to.

const FIELD = "created_at_time"

/** The argument path of the dedupe field, in the codec's grammar (what hints and issues use). */
export const DEDUPE_PATH = `$args[0].${FIELD}`

/**
 * How a method's one argument carries `created_at_time`:
 * `nat64` (`opt nat64`, ICRC-1 and ICRC-2) or `timestamp`
 * (`opt record { timestamp_nanos : nat64 }`, the ICP ledger's `transfer`).
 */
export type DedupeShape = "nat64" | "timestamp"

const isNat64 = (schema: AnyFieldSchema): boolean => {
  const node = resolveSchema(schema)
  return node.kind === "primitive" && node.primitive === "nat64"
}

/**
 * The shape of the method's dedupe field, or `undefined` when its argument
 * is not a single record with `created_at_time : opt nat64` (or the ICP
 * ledger's timestamp record).
 */
export function dedupeShapeOf(method: MethodInfo): DedupeShape | undefined {
  const [arg] = method.args
  if (method.args.length !== 1 || arg === undefined) return undefined
  const record = resolveSchema(arg)
  if (record.kind !== "record" || !Object.hasOwn(record.fields, FIELD)) {
    return undefined
  }
  const field = record.fields[FIELD]
  if (field === undefined) return undefined
  const opt = resolveSchema(field)
  if (opt.kind !== "opt") return undefined
  if (isNat64(opt.inner)) return "nat64"
  const inner = resolveSchema(opt.inner)
  if (
    inner.kind === "record" &&
    Object.keys(inner.fields).length === 1 &&
    Object.hasOwn(inner.fields, "timestamp_nanos") &&
    inner.fields.timestamp_nanos !== undefined &&
    isNat64(inner.fields.timestamp_nanos)
  ) {
    return "timestamp"
  }
  return undefined
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

/**
 * The `dedupedBy` of `client.resendOf()` for these methods: the argument's
 * `created_at_time`, or `null` when it has none (nothing is offered then).
 */
export function createdAtTimeOf(arg: unknown): unknown {
  return isObject(arg) && Object.hasOwn(arg, FIELD)
    ? (arg[FIELD] ?? null)
    : null
}

/** The nanoseconds a `created_at_time` value stands for, either shape. */
export function createdAtNanos(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value
  if (isObject(value) && typeof value.timestamp_nanos === "bigint") {
    return value.timestamp_nanos
  }
  return undefined
}

/** Whether prefilled values already carry a `created_at_time` (a replayed call). */
export function hasCreatedAtTime(
  values: readonly unknown[] | undefined
): boolean {
  return values !== undefined && createdAtTimeOf(values[0]) !== null
}

/**
 * The call with `created_at_time` set to `nanos`, re-encoded. A new argument
 * object every time: an argument that was sent must never change, or
 * `resendOf` would stop offering it (and a held one is refused `arg_changed`).
 * Returns `undefined` when the stamped arguments do not encode.
 */
export function stampCreatedAtTime(
  method: MethodInfo,
  shape: DedupeShape,
  call: PreparedCall,
  nanos: bigint
): PreparedCall | undefined {
  const [first, ...rest] = call.values
  if (!isObject(first)) return undefined
  // A spread copies own keys as data properties, so a field named
  // "__proto__" stays a field.
  const stamped: Record<string, unknown> = {
    ...first,
    [FIELD]: shape === "nat64" ? nanos : { timestamp_nanos: nanos },
  }
  return prepareCall(method, [stamped, ...rest])
}

/**
 * Hides the `created_at_time` field while the runner stamps it, so the form
 * never shows a time that is not the one sent. The form's own "now" default
 * stays off: the field starts empty, so turning the runner's switch off
 * really sends no deduplication key until the user sets one.
 */
export const hideDedupeField: HintResolver = (ctx) =>
  ctx.path === DEDUPE_PATH ? { hidden: true, nowByDefault: false } : undefined

/**
 * Whether the canister is known to run this method at most once per sender
 * and argument carrying `created_at_time` (the registry's `dedupedMethods`).
 * A runtime or pasted interface never is: on those the studio words the
 * re-send as conditional, since nothing proves the canister deduplicates.
 */
export function knownDeduplicating(
  iface: CanisterInterface,
  method: MethodInfo
): boolean {
  return (
    dedupeShapeOf(method) !== undefined &&
    iface.registry?.dedupedMethods?.includes(method.name) === true
  )
}

/**
 * The Err tag a deduplicating canister answers to the same bytes again:
 * ICRC-1 and ICRC-2 say `Duplicate`; the ICP ledger's own `transfer`, the
 * timestamp shape, says `TxDuplicate`.
 */
export function duplicateTagOf(
  shape: DedupeShape
): "Duplicate" | "TxDuplicate" {
  return shape === "timestamp" ? "TxDuplicate" : "Duplicate"
}

/**
 * The tag of a canister_err payload that says the write had already run:
 * `Duplicate` (ICRC-1, ICRC-2) or `TxDuplicate` (the ICP ledger's
 * `transfer`); `undefined` for any other payload.
 */
export function duplicateTagIn(
  err: unknown
): "Duplicate" | "TxDuplicate" | undefined {
  if (!isObject(err)) return undefined
  return err.tag === "Duplicate" || err.tag === "TxDuplicate"
    ? err.tag
    : undefined
}

/** Whether a canister_err payload says the write had already run. */
export const isDuplicateErr = (err: unknown): boolean =>
  duplicateTagIn(err) !== undefined

/**
 * Why a re-send that failed leaves the first send's outcome unknown, as a
 * clause. An Err other than a duplicate answers only the re-send: an ICRC-1
 * ledger checks the fee and the time window (`BadFee`, `TooOld`) before it
 * looks for a duplicate. A re-send that never ran says nothing either.
 */
export function resendLeftOpen(error: unknown): string {
  if (!isReactorError(error)) {
    return "the re-send failed, which says nothing about the first send"
  }
  if (error.kind === "canister_err") {
    const err: unknown = error.err
    const tag = isObject(err) && typeof err.tag === "string" ? err.tag : "Err"
    return `the canister answered the re-send ${tag}, which says nothing about the first send: a ledger checks the fee and the time window before it looks for a duplicate`
  }
  const kind =
    error.code === undefined ? error.kind : `${error.kind}/${error.code}`
  return `the re-send did not run (${kind}), so it says nothing about the first send`
}
