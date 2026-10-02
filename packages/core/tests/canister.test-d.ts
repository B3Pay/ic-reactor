/**
 * Type tests for the canister surface. `pnpm typecheck` compiles this file;
 * nothing here runs. The traps (the mistakes these types exist to refuse) are
 * in `traps.test-d.ts`, where `pnpm verify:traps` proves each one bites.
 */
import type { Principal } from "@candid-core/schema"
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
// A result read keeps its error type.
const outcome = client.queryOptions(service, "outcome", 1n)
expectTypeOf(
  new QueryObserver(client.queryClient, outcome).getCurrentResult().error
).toEqualTypeOf<ReactorError<string> | null>()

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
