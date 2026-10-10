/**
 * The types of `client.resendOf()`: the offer carries the method's own
 * argument and data, `dedupedBy` reads that argument, and the error may be
 * anything a mutation or a `catch` holds.
 *
 * Checked by `pnpm typecheck`, not run by vitest.
 */
import { MutationObserver, QueryClient } from "@tanstack/query-core"
import { expectTypeOf } from "vitest"
import { createClient, type ReactorError } from "../src/index.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"

const client = createClient({ network: "ic", identity: "anonymous" })
const ledger = client.canister<icrc1.Actor>(icrc1.actor, {
  id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
})
declare const caught: unknown

// The offer of a transfer: its argument, the sender, and a send that resolves
// with the block index, the `Ok` payload.
const again = client.resendOf(caught, ledger, "icrc1_transfer", {
  dedupedBy: (arg) => {
    expectTypeOf(arg).toEqualTypeOf<icrc1.TransferArg>()
    return arg.created_at_time
  },
})
expectTypeOf(again).toEqualTypeOf<
  | {
      readonly arg: icrc1.TransferArg
      readonly from: string
      send(): Promise<bigint>
    }
  | undefined
>()
if (again !== undefined) {
  expectTypeOf(again.arg).toEqualTypeOf<icrc1.TransferArg>()
  expectTypeOf(again.send()).toEqualTypeOf<Promise<bigint>>()
}

// A mutation's error and variables go in and come back as they are: the
// offer's argument is what `mutate` takes.
const mutation = new MutationObserver(
  new QueryClient(),
  client.mutationOptions(ledger, "icrc1_transfer")
)
const { error } = mutation.getCurrentResult()
expectTypeOf(error).toEqualTypeOf<ReactorError<icrc1.TransferError> | null>()
const offer = client.resendOf(error, ledger, "icrc1_transfer", {
  dedupedBy: (arg) => arg.created_at_time,
})
if (offer !== undefined) void mutation.mutate(offer.arg)

// Several arguments: the offer's argument is their tuple, as `mutate` takes it.
const shapesCanister = client.canister<
  shapes.Actor & { swap: (a: bigint, b: string) => Promise<string> }
>(shapes.actor, { id: "rrkah-fqaaa-aaaaa-aaaaq-cai" })
const swap = client.resendOf(caught, shapesCanister, "swap", {
  dedupedBy: ([a]) => a,
})
expectTypeOf(swap?.arg).toEqualTypeOf<[a: bigint, b: string] | undefined>()
