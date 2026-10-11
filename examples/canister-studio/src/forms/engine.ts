// STUB (FOUNDATION): the types and signatures are the contract; B1 ports the
// draft-tree engine (candid-forms lab engine.ts) behind them.
import type { AnyFieldSchema } from "@candid-core/schema"

export type BytesFormat = "hex" | "utf8" | "base64"

/**
 * The editable state of one value: JSON-serializable, mirrors the schema.
 * Leaves hold raw text; an opt keeps its inner draft while toggled off; a
 * variant keeps one payload draft per arm visited; vec items carry stable ids
 * (React keys).
 */
export type Draft =
  | { readonly k: "leaf"; readonly text: string }
  | { readonly k: "bool"; readonly value: boolean }
  | { readonly k: "fixed" }
  | { readonly k: "bytes"; readonly text: string; readonly format: BytesFormat }
  | { readonly k: "opt"; readonly present: boolean; readonly inner?: Draft }
  | {
      readonly k: "vec"
      readonly items: readonly { readonly id: number; readonly draft: Draft }[]
    }
  | { readonly k: "record"; readonly fields: Readonly<Record<string, Draft>> }
  | { readonly k: "tuple"; readonly items: readonly Draft[] }
  | {
      readonly k: "variant"
      readonly tag: string
      readonly payloads: Readonly<Record<string, Draft>>
    }
  | { readonly k: "func"; readonly principal: string; readonly method: string }
  | { readonly k: "uninhabited" }

/**
 * An issue at a field. `path` uses the codec's grammar under `$args[i]`
 * (`$args[0].to.owner`), the same paths ic-reactor's `invalid_args` issues
 * carry, so both land on the same field.
 */
export interface FieldIssue {
  path: string
  code: string
  message: string
}

export interface DefaultOptions {
  /** Fills principal fields (e.g. the caller); otherwise they start empty. */
  readonly principal?: string
}

/** The result of checking a whole call: parse → validate → encodeArgs. */
export interface CallCheck {
  ok: boolean
  /** One domain value per argument. */
  values?: unknown[]
  /** What ic-reactor's builders take: nothing, the one value, or the tuple. */
  vars?: unknown
  /** The exact Candid message (DIDL…) when everything passed. */
  bytes?: Uint8Array
  issues: FieldIssue[]
  /** Some argument has no finite value: the method cannot be called. */
  uninhabited?: boolean
}

/** A fresh draft for a schema: its default value, as a draft. */
export function initialDraft(
  schema: AnyFieldSchema,
  opts?: DefaultOptions
): Draft {
  void schema
  void opts
  throw new Error("not implemented")
}

/**
 * A draft from any value, tolerantly: a domain value (prefill, history,
 * resendOf) or loose JSON. Anything unusable falls back to the default.
 */
export function draftFromValue(
  schema: AnyFieldSchema,
  value: unknown,
  opts?: DefaultOptions
): Draft {
  void schema
  void value
  void opts
  throw new Error("not implemented")
}

/** Checks a whole call; issues use `$args[i]…` paths. */
export function checkCall(
  args: readonly AnyFieldSchema[],
  drafts: readonly Draft[]
): CallCheck {
  void args
  void drafts
  return { ok: false, issues: [] }
}

/** An `invalid_args` ReactorError's issues as field issues ($args[i] paths). */
export function issuesFromReactorError(e: unknown): FieldIssue[] {
  void e
  return []
}
