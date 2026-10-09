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
 * A trap about another package belongs in a `traps.test-d.ts` of its own,
 * registered in `SUITES` of `scripts/verify-traps.mjs`.
 *
 * Checked by `pnpm typecheck` (this file is in the typecheck project), not run
 * by vitest.
 */
import type { Principal } from "@candid-core/schema"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import {
  MutationObserver,
  QueryObserver,
  keepPreviousData,
  skipToken,
  type OmitKeyof,
  type QueryKey,
  type QueryObserverOptions,
  type SkipToken,
} from "@tanstack/query-core"
import {
  createClient,
  formatUnits,
  isReactorError,
  parseUnits,
} from "../src/index.js"
import type { Canister, Network, ReactorError } from "../src/index.js"
import { createTestClient, type TestHandlers } from "../src/testing/index.js"
import { createTestAuth } from "../src/testing/test-auth.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"
import * as skippable from "./fixtures/skippable.js"

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
// The client: who calls is written down exactly once
// ---------------------------------------------------------------------------

const someone = Ed25519KeyIdentity.generate()

// trap: client-says-who-calls
// @ts-expect-error neither identity nor auth: who calls is not written down; pass identity: "anonymous" for a read-only client
createClient({ network: "ic" })

// trap: client-says-who-calls-once
// @ts-expect-error identity and auth together: who calls is written twice; identity fixes the caller, auth signs users in
createClient({ network: "ic", identity: someone, auth: () => createTestAuth() })

// ---------------------------------------------------------------------------
// Canisters: methods, variables and principals come from the generated Actor
// ---------------------------------------------------------------------------

const client = createClient({ network: "ic", identity: "anonymous" })
const ledger = client.canister<icrc1.Actor>(icrc1.actor, {
  id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
})
const shapesCanister = client.canister<shapes.Actor>(shapes.actor, {
  id: "rrkah-fqaaa-aaaaa-aaaaq-cai",
})
declare const owner: Principal
const account: icrc1.Account = { owner, subaccount: null }
declare const transferArg: icrc1.TransferArg

// trap: canister-method-unknown
// @ts-expect-error icrc1_balance is not a method of the ICRC-1 ledger; it is icrc1_balance_of
void ledger.icrc1_balance(account)

// trap: options-method-unknown
// @ts-expect-error a typo in the method name: the builders take the generated Actor's method names only
client.queryOptions(ledger, "icrc1_balance", account)

// trap: options-vars-wrong-type
// @ts-expect-error icrc1_balance_of takes an Account, not its owner: { owner, subaccount: null }
client.queryOptions(ledger, "icrc1_balance_of", owner)

// trap: principal-is-not-plain-text
// @ts-expect-error a principal is checked text: principal("aaaaa-aa") from @candid-core/schema, not a string literal
void ledger.icrc1_balance_of({ owner: "aaaaa-aa", subaccount: null })

// trap: vars-of-two-arguments-are-the-tuple
// @ts-expect-error pair takes two arguments: pass them as the tuple [left, right]
client.queryOptions(shapesCanister, "pair", 1n)

// ---------------------------------------------------------------------------
// The typed guard: `err` is the Err arm of the method it names, not another's
// ---------------------------------------------------------------------------

export const readAnotherMethodsErr = (error: unknown) => {
  if (
    isReactorError(error, ledger, "icrc1_balance_of") &&
    error.kind === "canister_err"
  ) {
    // trap: guard-err-is-the-methods
    // @ts-expect-error icrc1_balance_of has no Err arm; the TransferError is icrc1_transfer's: name the method that was called
    return error.err.tag
  }
  return undefined
}

// What `useSuspenseQuery` of `@tanstack/react-query` takes, written over
// query-core: the options of a `QueryObserver`, without the ones a suspense
// read has no use for, and a `queryFn` that is never `skipToken`, since a
// suspense read cannot wait for its variables.
type SuspenseQueryOptions<T, E, K extends QueryKey> = OmitKeyof<
  QueryObserverOptions<T, E, T, T, K>,
  "queryFn" | "enabled" | "throwOnError" | "placeholderData"
> & {
  queryFn?: Exclude<QueryObserverOptions<T, E, T, T, K>["queryFn"], SkipToken>
}
declare function useSuspenseQuery<T, E, K extends QueryKey>(
  options: SuspenseQueryOptions<T, E, K>
): { data: T }
declare const ready: boolean

// Variables that cannot be skipped give options a suspense read takes as they
// are. The read with variables is a tuple: under the fault of
// options-vars-wrong-type a single argument is `unknown`, which may hold
// `skipToken`, and its read would be refused too.
useSuspenseQuery(client.queryOptions(ledger, "icrc1_fee"))
useSuspenseQuery(client.queryOptions(shapesCanister, "pair", [1n, "x"]))

// Variables that may be skipped give options it refuses. The traps read a
// method without arguments: under the fault of options-vars-wrong-type, which
// widens every argument to `unknown`, the variables of a method with
// arguments can no longer be told from `skipToken`, and one fault must remove
// one trap. packages/react/tests/suspense.test-d.tsx refuses an `Account |
// SkipToken` under the real `useSuspenseQuery`.

const gated = client.queryOptions(
  ledger,
  "icrc1_fee",
  ready ? undefined : skipToken
)
// trap: suspense-refuses-skippable-read
// @ts-expect-error a suspense read cannot be skipped: render it once it can run, or read it with useQuery
useSuspenseQuery(gated)
// trap: suspense-refuses-skippable-read
// @ts-expect-error skipToken is for useQuery; a suspense read always runs
useSuspenseQuery(client.queryOptions(ledger, "icrc1_fee", skipToken))

// Variables of a type `skipToken` is assignable to may always be skipped, and
// the options keep SkipToken: a Candid `reserved` argument, which the
// generator writes `unknown`, and an empty record written `{}` by hand
// (`candid-core-cli gen` writes `record {}` as `Record<string, never>`, which
// a symbol is not). tests/skip.test-d.ts pins what the generator writes.
const skippableIds = { id: "rrkah-fqaaa-aaaaa-aaaaq-cai" }
const gen = client.canister<skippable.Actor>(skippable.actor, skippableIds)
declare const braces: Canister<{ braces: (r: {}) => Promise<bigint> }>
// trap: suspense-refuses-vars-skip-fits
// @ts-expect-error a reserved argument may be skipToken, so a suspense read refuses it; read it with useQuery
useSuspenseQuery(client.queryOptions(gen, "anything", skipToken))
// trap: suspense-refuses-vars-skip-fits
// @ts-expect-error skipToken is assignable to `{}`, so a suspense read refuses it; read it with useQuery
useSuspenseQuery(client.queryOptions(braces, "braces", skipToken))

// An argument `skipToken` is not assignable to, such as an empty record as the
// generator writes it, still takes `skipToken` in its place, and the options
// keep SkipToken.
// trap: suspense-refuses-argument-skip
// @ts-expect-error skipToken is for useQuery; a suspense read always runs
useSuspenseQuery(client.queryOptions(gen, "empty_record", skipToken))

// ---------------------------------------------------------------------------
// The test client: handlers answer in the generated Actor's domain values
// ---------------------------------------------------------------------------

type LedgerHandlers = TestHandlers<icrc1.Actor>

// trap: test-handler-nat-is-bigint
// @ts-expect-error icrc1_fee replies a nat, which is a bigint: 10_000 is a number, write 10_000n
export const feeAsNumber: LedgerHandlers = { icrc1_fee: () => 10_000 }

// trap: test-handler-method-unknown
// @ts-expect-error icrc1_balance is not a method of the ICRC-1 ledger; it is icrc1_balance_of
export const balanceTypo: LedgerHandlers = { icrc1_balance: () => 1n }

// trap: test-handler-takes-the-domain-value
// @ts-expect-error icrc1_balance_of takes an Account, not text: ({ owner }) => ...
export const ofText: LedgerHandlers = { icrc1_balance_of: (_o: string) => 1n }

// A refusal aimed at a method: an option it does not have would be ignored,
// and the refusal would land on whatever request came next.
const { refuseNext } = createTestClient()
refuseNext(429, { method: "icrc1_transfer", times: 3 })
// trap: refuse-next-unknown-option
// @ts-expect-error refuseNext() has no option `methd`; it is `method`
refuseNext(429, { methd: "icrc1_transfer" })

// ---------------------------------------------------------------------------
// Known holes (D36): these COMPILE on purpose
// ---------------------------------------------------------------------------
//
// D36 records what the types do not stop, and decides against an ESLint plugin
// to stop it: each is a mistake the eval scores, a runtime refusal where there
// is one, and a line in the guide's "Do not" list. They are written here as
// code that compiles, with no directive and no trap tag, so that nobody adds a
// `@ts-expect-error` for one, and so that the day a type does start refusing
// one shows up as a failing build here: a decision, not a surprise.

// D36: spreading `retry: 3` into the options of a write. A mutation is never
// retried (an update re-sent after an unknown outcome can run twice), but the
// options are plain TanStack options, so nothing refuses the spread.
export const retriedWrite = new MutationObserver(client.queryClient, {
  ...client.mutationOptions(ledger, "icrc1_transfer"),
  retry: 3,
})

// D36: `placeholderData: keepPreviousData` on a read. The previous key's data
// is shown for the new key, which for a caller-scoped key can be another
// principal's balance. It is a TanStack option; the type cannot tell.
export const previousBalance = new QueryObserver(client.queryClient, {
  ...client.queryOptions(ledger, "icrc1_balance_of", account),
  placeholderData: keepPreviousData,
})

// D36: an array-literal key. Typed by hand it is a `QueryKey` like any other,
// so it compiles, and then matches nothing the client builds: keys start with
// "ic-reactor" and hold the caller. `client.queryKey(...)` is the only builder.
void client.queryClient.invalidateQueries({ queryKey: ["balance", owner] })

// D36: a hand-built query function calling an update. To TanStack any
// function is a query function: this runs the transfer again on every
// refetch, as whoever is signed in at that moment, not the key's caller.
export const transferAsRead = new QueryObserver(client.queryClient, {
  queryKey: ["transfer", owner],
  queryFn: () => ledger.icrc1_transfer(transferArg),
})
