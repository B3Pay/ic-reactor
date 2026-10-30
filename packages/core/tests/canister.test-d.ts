/**
 * Type tests for the canister surface. `pnpm typecheck` compiles this file;
 * nothing here runs. The traps (the mistakes these types exist to refuse) are
 * in `traps.test-d.ts`, where `pnpm verify:traps` proves each one bites.
 */
import type { Principal } from "@meantjs/schema"
import {
  MutationObserver,
  QueryObserver,
  skipToken,
  type QueryKey,
} from "@tanstack/query-core"
import { expectTypeOf } from "vitest"
import * as entry from "../src/index.js"
import {
  createClient,
  type Canister,
  type CanisterTarget,
  type ReactorError,
} from "../src/index.js"
import type {
  CanisterQueryOptions,
  OptInMethod,
  QueryOptionsOptions,
  ReadMethod,
} from "../src/types.js"
import * as archive from "./fixtures/archive.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"

declare const owner: Principal
const account: icrc1.Account = { owner, subaccount: null }
declare const transferArg: icrc1.TransferArg

const client = createClient({ network: "ic", identity: "anonymous" })
const ledger = client.canister<icrc1.Actor>(icrc1.actor, {
  id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
})
const service = client.canister<shapes.Actor>(shapes.actor, {
  id: "rrkah-fqaaa-aaaaa-aaaaq-cai",
})

// ---------------------------------------------------------------------------
// The canister: the generated Actor, with results unwrapped
// ---------------------------------------------------------------------------

expectTypeOf(ledger).toEqualTypeOf<Canister<icrc1.Actor>>()
expectTypeOf(ledger.icrc1_balance_of).parameters.toEqualTypeOf<
  [arg0: icrc1.Account]
>()
expectTypeOf(ledger.icrc1_balance_of).returns.toEqualTypeOf<Promise<bigint>>()
// The Ok payload of TransferResult; the Err one is the error's `err`.
expectTypeOf(ledger.icrc1_transfer).returns.toEqualTypeOf<Promise<bigint>>()
// nat8 is a number, every other integer a bigint.
expectTypeOf(ledger.icrc1_decimals).returns.toEqualTypeOf<Promise<number>>()
expectTypeOf(ledger.icrc1_minting_account).returns.toEqualTypeOf<
  Promise<icrc1.Account | null>
>()

// 0 results: void; n results: the tuple; a lower-case result and a bare ok arm
// are unwrapped; a variant with a third arm is not.
expectTypeOf(service.nothing).returns.toEqualTypeOf<Promise<void>>()
expectTypeOf(service.many).returns.toEqualTypeOf<
  Promise<[bigint, string, boolean]>
>()
expectTypeOf(service.bump).returns.toEqualTypeOf<Promise<bigint>>()
expectTypeOf(service.flag).returns.toEqualTypeOf<Promise<null>>()
expectTypeOf(service.three).returns.toEqualTypeOf<Promise<shapes.Three>>()
expectTypeOf(service.pair).parameters.toEqualTypeOf<
  [arg0: bigint, arg1: string]
>()
expectTypeOf(service.maybe).parameters.toEqualTypeOf<
  [arg0: { some: bigint | null } | null]
>()

// ---------------------------------------------------------------------------
// queryOptions: the key is tagged with the data and the error
// ---------------------------------------------------------------------------

const balance = client.queryOptions(ledger, "icrc1_balance_of", account)
expectTypeOf(client.queryClient.getQueryData(balance.queryKey)).toEqualTypeOf<
  bigint | undefined
>()
const balanceRead = new QueryObserver(client.queryClient, balance)
expectTypeOf(balanceRead.getCurrentResult().data).toEqualTypeOf<
  bigint | undefined
>()
expectTypeOf(
  balanceRead.getCurrentResult().error
).toEqualTypeOf<ReactorError | null>()

// A method without arguments takes no variables, or skipToken.
client.queryOptions(ledger, "icrc1_fee")
client.queryOptions(ledger, "icrc1_fee", undefined)
client.queryOptions(ledger, "icrc1_fee", skipToken)
client.queryOptions(ledger, "icrc1_balance_of", skipToken)
// Two arguments are the tuple.
client.queryOptions(service, "pair", [1n, "x"])
// An update read as a query, opted in.
const address = client.queryOptions(service, "address", "seed", {
  update: "idempotent",
})
expectTypeOf(client.queryClient.getQueryData(address.queryKey)).toEqualTypeOf<
  string | undefined
>()
// The opt-in read's options are those of any read: variables that cannot be
// skipped give a queryFn that is never skipToken, and variables that may be
// skipped keep it.
expectTypeOf(address).toEqualTypeOf<
  CanisterQueryOptions<string, never, never>
>()
expectTypeOf(
  client.queryOptions(service, "address", skipToken, { update: "idempotent" })
).toEqualTypeOf<CanisterQueryOptions<string, never>>()
expectTypeOf(
  client.queryOptions(service, "three", undefined, { update: "idempotent" })
).toEqualTypeOf<CanisterQueryOptions<shapes.Three, never, never>>()
// A query may pass the opt-in too, as before modes were read.
expectTypeOf(
  client.queryOptions(ledger, "icrc1_fee", undefined, { update: "idempotent" })
).toEqualTypeOf<CanisterQueryOptions<bigint, never, never>>()
// A result read keeps its error type.
const outcome = client.queryOptions(service, "outcome", 1n)
expectTypeOf(
  new QueryObserver(client.queryClient, outcome).getCurrentResult().error
).toEqualTypeOf<ReactorError<string> | null>()

// ---------------------------------------------------------------------------
// The methods a read is built from, by the mode the generated Actor says
// ---------------------------------------------------------------------------

// Without the opt-in: the queries and the composite query, never an update or
// the oneway. tests/traps.test-d.ts proves that queryOptions refuses the rest.
expectTypeOf<ReadMethod<shapes.Actor>>().toEqualTypeOf<
  | "one"
  | "who"
  | "maybe"
  | "composite"
  | "many"
  | "pair"
  | "nothing"
  | "lookup"
  | "small"
  | "bytes"
  | "outcome"
>()
// With { update: "idempotent" }: the updates too, still never the oneway.
expectTypeOf<OptInMethod<shapes.Actor>>().toEqualTypeOf<
  Exclude<keyof shapes.Actor, "fire">
>()
expectTypeOf<ReadMethod<icrc1.Actor>>().toEqualTypeOf<
  Exclude<keyof icrc1.Actor, "icrc1_transfer">
>()
// An Actor written by hand says no mode: every method passes, and the client
// checks the mode at run time.
type HandWritten = {
  fee: () => Promise<bigint>
  transfer: (arg: icrc1.TransferArg) => Promise<bigint>
  notify: (text: string) => Promise<void>
}
expectTypeOf<ReadMethod<HandWritten>>().toEqualTypeOf<
  "fee" | "transfer" | "notify"
>()
expectTypeOf<OptInMethod<HandWritten>>().toEqualTypeOf<
  "fee" | "transfer" | "notify"
>()
// A generated Actor with methods added by hand: the generated update is
// refused, the added method is not.
expectTypeOf<
  ReadMethod<icrc1.Actor & { icrc2_approve: (arg: unknown) => Promise<bigint> }>
>().toEqualTypeOf<
  Exclude<keyof icrc1.Actor, "icrc1_transfer"> | "icrc2_approve"
>()
// The mode does not reach the canister's methods: a direct call of an update
// is a plain async function.
expectTypeOf(ledger.icrc1_transfer).toEqualTypeOf<
  (arg0: icrc1.TransferArg) => Promise<bigint>
>()

// Calls that compiled on beta.4 and no longer do, though each may run
// without a TypeError (the CHANGELOG's 4.0.0-beta.5 entry says so).
//
// A method whose type is not one name the Actor marks as a read. First, a
// wrapper generic over the method name: TypeScript cannot tell that a method
// `M extends keyof A & string` is a ReadMethod<A>, whatever M is.
export function readOf<A, M extends keyof A & string>(
  canister: Canister<A>,
  method: M,
  vars: never
) {
  // @ts-expect-error M may be an update of a generated Actor: not a ReadMethod<A>
  return client.queryOptions(canister, method, vars)
}
// Its escape: explicit type arguments, with `any` for the method. The call
// compiles, and the run-time check still refuses an update or a oneway.
export function readOfAny<A, M extends keyof A & string>(
  canister: Canister<A>,
  method: M,
  vars: never
) {
  return client.queryOptions<A, any>(canister, method, vars)
}
// Its data is unknown, and its error type never: the wrapper states both.
expectTypeOf(readOfAny(ledger, "icrc1_fee", undefined as never)).toEqualTypeOf<
  CanisterQueryOptions<unknown, never, never>
>()
// A union that may name an update, such as a method picker typed
// `keyof Actor & string`: it runs whenever the value names a query, but its
// type is not a ReadMethod. A union of queries compiles.
declare const picked: "icrc1_name" | "icrc1_transfer"
// @ts-expect-error the union may name an update: not a ReadMethod<Actor>
client.queryOptions(ledger, picked, undefined as never)
expectTypeOf(
  client.queryOptions<icrc1.Actor, any>(ledger, picked, undefined as never)
).toEqualTypeOf<CanisterQueryOptions<unknown, never, never>>()
declare const pickedRead: "icrc1_name" | "icrc1_symbol"
client.queryOptions(ledger, pickedRead)
// A function generic over the Actor type, with the method's name written out:
// TypeScript cannot relate a generic A to ReadMethod<A>, so even a name every
// such A marks as a query does not compile. The escape is the same.
export function feeOf<A extends { icrc1_fee: () => Promise<bigint> }>(
  canister: Canister<A>
) {
  // @ts-expect-error A is generic: "icrc1_fee" is not known to be a ReadMethod<A>
  return client.queryOptions(canister, "icrc1_fee", undefined as never)
}
export function feeOfAny<A extends { icrc1_fee: () => Promise<bigint> }>(
  canister: Canister<A>
) {
  return client.queryOptions<A, any>(canister, "icrc1_fee", undefined as never)
}
// The variables under `<A, any>` (#874): a method named by data has the type
// `any`, and its variables follow the run-time rule, not `unknown[]`: the
// value for a one-argument method, the tuple for several, and `undefined` or
// `[]` for none. The client checks them against the method's schemas.
declare const named: string
declare const ok: boolean
expectTypeOf(
  client.queryOptions<icrc1.Actor, any>(ledger, named, account)
).toEqualTypeOf<CanisterQueryOptions<unknown, never, never>>()
expectTypeOf(
  client.queryOptions<icrc1.Actor, any>(ledger, named, undefined)
).toEqualTypeOf<CanisterQueryOptions<unknown, never, never>>()
expectTypeOf(
  client.queryOptions<icrc1.Actor, any>(ledger, named, [])
).toEqualTypeOf<CanisterQueryOptions<unknown, never, never>>()
expectTypeOf(
  client.queryOptions<shapes.Actor, any>(service, named, [1n, "x"])
).toEqualTypeOf<CanisterQueryOptions<unknown, never, never>>()
expectTypeOf(
  client.queryOptions<icrc1.Actor, any>(ledger, named, ok ? account : skipToken)
).toEqualTypeOf<CanisterQueryOptions<unknown, never, typeof skipToken>>()
expectTypeOf(
  client.queryOptions<icrc1.Actor, any>(ledger, named, skipToken)
).toEqualTypeOf<CanisterQueryOptions<unknown, never, typeof skipToken>>()
// A function generic over the Actor: a read takes the real value too.
export function balanceOfAny<
  A extends { icrc1_balance_of: (account: icrc1.Account) => Promise<bigint> },
>(canister: Canister<A>, owned: icrc1.Account) {
  return client.queryOptions<A, any>(canister, "icrc1_balance_of", owned)
}
expectTypeOf(balanceOfAny(ledger, account)).toEqualTypeOf<
  CanisterQueryOptions<unknown, never, never>
>()
client.queryOptions<icrc1.Actor, any>(ledger, named, account, {
  update: "idempotent",
})
expectTypeOf(
  client.queryKey<icrc1.Actor, any>(ledger, named, account)
).toEqualTypeOf<QueryKey>()
client.queryKey<icrc1.Actor, any>(ledger, named, undefined)
client.queryKey<icrc1.Actor, any>(ledger, named, [])
const anyWrite = client.mutationOptions<icrc1.Actor, any>(ledger, named)
declare const mutationContext: Parameters<
  NonNullable<typeof anyWrite.mutationFn>
>[1]
void anyWrite.mutationFn?.(transferArg, mutationContext)
void anyWrite.mutationFn?.([1n, "x"], mutationContext)
void anyWrite.mutationFn?.(undefined, mutationContext)
expectTypeOf(anyWrite.mutationFn)
  .parameter(0)
  .toEqualTypeOf<
    string | number | bigint | boolean | object | null | undefined
  >()
declare const anyError: unknown
const anyOffer = client.resendOf<icrc1.Actor, any>(anyError, ledger, named, {
  dedupedBy: (arg) => {
    expectTypeOf(arg).toEqualTypeOf<
      string | number | bigint | boolean | object | null | undefined
    >()
    return (arg as icrc1.TransferArg).created_at_time
  },
})
if (anyOffer !== undefined) {
  expectTypeOf(anyOffer.arg).toEqualTypeOf<
    string | number | bigint | boolean | object | null | undefined
  >()
}

// An opt-in that may be undefined: an update without `{ update: "idempotent" }`
// throws at run time, so a fourth argument the type does not know is the
// opt-in does not compile for an update. For a query it compiles as before.
declare const maybeOptIn: QueryOptionsOptions | undefined
// @ts-expect-error the opt-in may be undefined, and an update without it throws
client.queryOptions(ledger, "icrc1_transfer", transferArg, maybeOptIn)
expectTypeOf(
  client.queryOptions(ledger, "icrc1_fee", undefined, maybeOptIn)
).toEqualTypeOf<CanisterQueryOptions<bigint, never, never>>()

// ---------------------------------------------------------------------------
// mutationOptions: the variables, the data and the typed Err
// ---------------------------------------------------------------------------

const transfer = new MutationObserver(
  client.queryClient,
  client.mutationOptions(ledger, "icrc1_transfer")
)
expectTypeOf(transfer.mutate).parameter(0).toEqualTypeOf<icrc1.TransferArg>()
expectTypeOf(transfer.getCurrentResult().data).toEqualTypeOf<
  bigint | undefined
>()
expectTypeOf(
  transfer.getCurrentResult().error
).toEqualTypeOf<ReactorError<icrc1.TransferError> | null>()
export const readErr = (error: ReactorError<icrc1.TransferError>) =>
  error.kind === "canister_err" ? error.err.tag : undefined
void transfer.mutate(transferArg)

const note = new MutationObserver(
  client.queryClient,
  client.mutationOptions(service, "note")
)
expectTypeOf(note.getCurrentResult().data).toEqualTypeOf<void | undefined>()
const nothing = new MutationObserver(
  client.queryClient,
  client.mutationOptions(service, "nothing")
)
void nothing.mutate()

// An onMutate of the app's composes with the given one: it spreads the given
// one's result (the canister and reads resolved for the run) into its own,
// and onSettled still reads them from the context.
const transferOptions = client.mutationOptions(ledger, "icrc1_transfer")
const optimistic = new MutationObserver(client.queryClient, {
  ...transferOptions,
  onMutate: (variables: icrc1.TransferArg, context?: unknown) => ({
    ...transferOptions.onMutate(variables, context),
    previous: client.queryClient.getQueryData(balance.queryKey),
  }),
})
expectTypeOf(optimistic.getCurrentResult().context?.previous).toEqualTypeOf<
  bigint | undefined
>()
expectTypeOf(
  optimistic.getCurrentResult().error
).toEqualTypeOf<ReactorError<icrc1.TransferError> | null>()

// TanStack's optimistic-update recipe as written, an onMutate that replaces
// the given one, compiles as well: onSettled takes whatever an onMutate of
// the app's returns, and finds the run through the run's context instead.
const replaced = new MutationObserver(client.queryClient, {
  ...transferOptions,
  onMutate: () => ({
    previous: client.queryClient.getQueryData(balance.queryKey),
  }),
})
expectTypeOf(replaced.getCurrentResult().context?.previous).toEqualTypeOf<
  bigint | undefined
>()

// Reads of any canister of the client, or of one of their methods.
client.mutationOptions(ledger, "icrc1_transfer", {
  invalidates: [
    ledger,
    service,
    [ledger, "icrc1_balance_of"],
    [service, "one"],
  ],
})
client.mutationOptions(ledger, "icrc1_transfer", { invalidates: [] })

// ---------------------------------------------------------------------------
// queryKey, func, and the entry
// ---------------------------------------------------------------------------

expectTypeOf(client.queryKey(ledger)).toEqualTypeOf<QueryKey>()
expectTypeOf(
  client.queryKey(ledger, "icrc1_balance_of", account)
).toEqualTypeOf<QueryKey>()

declare const callback: archive.QueryArchiveFn
const read = client.func<
  (arg: archive.GetBlocksArgs) => Promise<archive.BlockRange>
>(archive.QueryArchiveFn, callback)
expectTypeOf(read).returns.toEqualTypeOf<Promise<archive.BlockRange>>()

export const byId: CanisterTarget = { id: "aaaaa-aa", certified: true }
export const byName: CanisterTarget = { name: "backend" }
// @ts-expect-error a target names its canister one way, not both
export const both: CanisterTarget = { id: "aaaaa-aa", name: "backend" }

// The helpers stay internal: the entry adds Canister and CanisterTarget only.
// @ts-expect-error Unwrap is not exported
export type NotExported = entry.Unwrap<bigint>
// @ts-expect-error the call path is not exported
void entry.invoke
