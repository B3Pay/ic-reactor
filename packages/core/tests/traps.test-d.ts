/**
 * Trap types: the mistakes the types of `@ic-reactor/core` are written to make
 * a compile error, each proven to bite.
 *
 * A `@ts-expect-error` is only worth something while the line below it really
 * is an error. If a refactor widens a type until the line compiles, TypeScript
 * reports the directive as unused (TS2578), but only to whoever runs `tsc`
 * over this file, and a trap that stopped trapping looks the same as a trap
 * that still does in a green build. `scripts/verify-traps.mjs`
 * (`pnpm verify:traps`, a CI gate) closes that gap: for every trap below it
 * applies a fault that removes exactly that trap to a copy of this package,
 * runs `tsc` on the copy, and requires TS2578 on exactly the trap's line and
 * nothing else. A trap with no fault fixture, or a fixture whose fault leaves
 * the trap standing, fails CI.
 *
 * ## Adding a trap
 *
 * 1. Write the line that must not compile, with a tag on the line above the
 *    directive, the id first and the directive straight after it:
 *
 *        // trap: <id>
 *        // @ts-expect-error <what the line gets wrong, and what to do instead>
 *        theLineThatMustNotCompile()
 *
 *    The id is lowercase words joined by `-`. Several lines may share one id
 *    when one fault removes them all. A `@ts-expect-error` with no tag, a tag
 *    with no directive under it, and any `@ts-ignore` or `@ts-nocheck` in this
 *    file fail the script.
 *
 * 2. Write `scripts/traps/<id>.json`, the fault that makes the line compile:
 *
 *        {
 *          "file": "src/units.ts",
 *          "search": "export function formatUnits(\n  value: bigint,",
 *          "replace": "export function formatUnits(\n  value: bigint | number,"
 *        }
 *
 *    `file` is relative to this package, and `search` must occur exactly once
 *    in it. For several edits write `{ "edits": [ { "file", "search",
 *    "replace" }, ... ] }`; for more than text replacement, write
 *    `scripts/traps/<id>.mjs` exporting a default function that takes
 *    `{ dir, applyEdits }`, where `dir` is the copy of this package and
 *    `applyEdits(edits)` applies a list of the same edits.
 *
 *    The fault is the *natural* regression: widening the type, dropping the
 *    check, exporting the internal. It must change nothing else: no other
 *    diagnostic may appear, so repair what the fault breaks in the same
 *    fixture.
 *
 * 3. Run `pnpm verify:traps`, then check by hand that the fault is one a
 *    refactor could really commit.
 *
 * Other slices add their traps here as their API lands (the client's
 * `identity | auth` choice, an unknown method name, wrong variables, ...);
 * a trap about another package belongs in a `traps.test-d.ts` of its own,
 * registered in `SUITES` of `scripts/verify-traps.mjs`.
 *
 * Checked by `pnpm typecheck` (this file is in the typecheck project), not run
 * by vitest.
 */
import { formatUnits, parseUnits } from "../src/index.js"
import type { Network, ReactorError } from "../src/index.js"

// What a generated module's `Err` arm looks like for ICRC-1 `icrc1_transfer`.
type TransferError =
  | { BadFee: { expected_fee: bigint } }
  | { InsufficientFunds: { balance: bigint } }

// `icrc1_decimals : () -> (nat8) query` and a balance that is still loading.
declare const decimals: number
declare const balance: bigint
declare const loading: bigint | undefined

// ---------------------------------------------------------------------------
// Units: a `Number` is the lossy input they exist to replace
// ---------------------------------------------------------------------------

// trap: format-units-refuses-number
// @ts-expect-error a Number amount cannot hold every balance; pass the bigint a ledger returned
formatUnits(1.5, 8)

// trap: format-units-refuses-missing-value
// @ts-expect-error the amount may still be loading; show a placeholder instead of formatting undefined
formatUnits(loading, 8)

// trap: parse-units-refuses-number
// @ts-expect-error read the text a person typed, not a Number: Number math turns 0.29 into 28999999
parseUnits(1.5, decimals)

// trap: parse-units-unknown-option
// @ts-expect-error v3 called it allowNegative; the option is `signed`
parseUnits("-1", 8, { allowNegative: true })

// trap: format-units-unknown-option
// @ts-expect-error v3 had rounding modes; this cuts and never rounds
formatUnits(balance, 8, { roundingMode: "halfExpand" })

// ---------------------------------------------------------------------------
// Networks: one of the names, or an object with a host
// ---------------------------------------------------------------------------

// trap: network-refuses-unknown-name
// @ts-expect-error a network is "ic", "local", "env" or an object; "mainnet" would be a typo that falls through
export const unknownName: Network = "mainnet"

// ---------------------------------------------------------------------------
// Errors: `err` is typed only where the canister returned one
// ---------------------------------------------------------------------------

export const readNeverErr = (error: ReactorError) => {
  if (error.kind === "canister_err") {
    // trap: never-err-has-no-type
    // @ts-expect-error a method without an Err arm has no typed `err`; it is undefined for every kind
    return error.err.BadFee
  }
  return undefined
}

export const readErrOffTheArm = (error: ReactorError<TransferError>) => {
  if (error.kind !== "canister_err") {
    // trap: err-only-on-canister-err
    // @ts-expect-error `err` is undefined for every kind but canister_err; check the kind first
    return "BadFee" in error.err
  }
  return undefined
}

// ---------------------------------------------------------------------------
// The entry: the classifier and the resolver are the client's, not an app's
// ---------------------------------------------------------------------------

// trap: internals-not-exported
// @ts-expect-error classifyError is internal; an app reads `mayHaveExecuted` off the error it is given
import { classifyError } from "../src/index.js"
// trap: internals-not-exported
// @ts-expect-error resolveNetwork is internal; an app passes a Network to createClient
import { resolveNetwork } from "../src/index.js"

export const internals = { classifyError, resolveNetwork }

// ---------------------------------------------------------------------------
// Known holes (D36): these COMPILE on purpose
// ---------------------------------------------------------------------------
//
// D36 records what the types do not stop, and decides against an ESLint plugin
// to stop it: each is a mistake the eval scores, a runtime refusal where there
// is one, and a line in the guide's "Do not" list. They are written here, as
// comments, so that nobody adds a `@ts-expect-error` for one and so that the
// day a type does start refusing it shows up as a decision rather than a
// surprise.
//
// TODO(IR2t, #782): `client.mutationOptions` and `client.queryOptions` do not
// exist yet. When they land, turn each block below into real code that
// compiles (no directive, no trap tag), next to a comment naming D36.
//
//   // Spreading `retry: 3` into the options of a write: a mutation does not
//   // retry (an update re-sent after an unknown outcome runs twice), and the
//   // option object is plain TanStack options, so nothing refuses the spread.
//   const write = { ...client.mutationOptions(ledger, "icrc1_transfer"), retry: 3 }
//
//   // `placeholderData: keepPreviousData` on a read: the previous key's data
//   // is shown for the new key, which for a caller-scoped key can be another
//   // principal's balance. It is a TanStack option; the type cannot tell.
//   const read = {
//     ...client.queryOptions(ledger, "icrc1_balance_of", account),
//     placeholderData: keepPreviousData,
//   }
//
//   // A hand-built `useQuery` around a write: `queryFn: () => ledger.icrc1_transfer(args)`
//   // is any function to TanStack. It runs the update on every refetch and
//   // reads the caller at that moment, not the key's.
//   useQuery({ queryKey: ["transfer", args], queryFn: () => ledger.icrc1_transfer(args) })
//
//   // An array-literal key: `queryKey: ["ic-reactor", "ic", ...]` typed by hand
//   // is a `QueryKey` like any other, so it compiles and then matches nothing
//   // the client invalidates. `client.queryKey(...)` is the only builder.
//   useQuery({ queryKey: ["balance", owner], queryFn: () => ledger.icrc1_balance_of(account) })
