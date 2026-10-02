/**
 * Type tests for `createTestClient` and `TestHandlers`. `pnpm typecheck`
 * compiles this file; nothing here runs. The mistakes the handler types exist
 * to refuse (a `number` for a `nat`, a handler for a method the service does
 * not have) are in `traps.test-d.ts`, where `pnpm verify:traps` proves each
 * one bites.
 */
import { principal, type Principal } from "@candid-core/schema"
import type { Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { expectTypeOf } from "vitest"
import type { Client } from "../src/index.js"
import { createTestClient, type TestHandlers } from "../src/testing/index.js"
import type { FakeReplicaRequest } from "../src/testing/fake-replica.js"
import type { TestAuth } from "../src/testing/test-auth.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as management from "./fixtures/management.js"
import * as shapes from "./fixtures/shapes.js"

const LEDGER = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")

/** The context every handler is given after the method's arguments. */
type Context = { readonly caller: Principal }

// ---------------------------------------------------------------------------
// Handlers: the generated Actor's methods, in domain values, plus a context
// ---------------------------------------------------------------------------

type Ledger = TestHandlers<icrc1.Actor>

// Every method is optional: a test mocks the ones the code under test calls.
export const none: Ledger = {}

// Arguments come first, then the context; fewer parameters are fine.
export const ledger: Ledger = {
  icrc1_fee: () => 10_000n,
  icrc1_decimals: () => 8,
  icrc1_symbol: async () => "ICP",
  icrc1_minting_account: () => null,
  icrc1_balance_of: ({ owner }, { caller }) => (owner === caller ? 1n : 0n),
  icrc1_transfer: (arg, ctx) =>
    arg.amount > 0n && ctx.caller !== arg.to.owner
      ? { tag: "Ok", value: arg.amount }
      : { tag: "Err", value: { tag: "TooOld" } },
}

expectTypeOf<
  NonNullable<Ledger["icrc1_balance_of"]>
>().parameters.toEqualTypeOf<[arg0: icrc1.Account, ctx: Context]>()
expectTypeOf<NonNullable<Ledger["icrc1_fee"]>>().parameters.toEqualTypeOf<
  [ctx: Context]
>()
// A handler replies what the method replies, or a promise of it: for a result
// method that is the variant, not the unwrapped Ok payload.
expectTypeOf<NonNullable<Ledger["icrc1_fee"]>>().returns.toEqualTypeOf<
  bigint | Promise<bigint>
>()
expectTypeOf<NonNullable<Ledger["icrc1_transfer"]>>().returns.toEqualTypeOf<
  icrc1.TransferResult | Promise<icrc1.TransferResult>
>()
// nat8 is a number, as in every generated module.
expectTypeOf<NonNullable<Ledger["icrc1_decimals"]>>().returns.toEqualTypeOf<
  number | Promise<number>
>()

// The reply collapse: one value, a tuple for several results, void for none.
type Shapes = TestHandlers<shapes.Actor>
expectTypeOf<NonNullable<Shapes["many"]>>().returns.toEqualTypeOf<
  [bigint, string, boolean] | Promise<[bigint, string, boolean]>
>()
expectTypeOf<NonNullable<Shapes["pair"]>>().parameters.toEqualTypeOf<
  [arg0: bigint, arg1: string, ctx: Context]
>()
expectTypeOf<
  NonNullable<Shapes["nothing"]>
>().returns.toEqualTypeOf<void | Promise<void>>()
export const shapesHandlers: Shapes = {
  many: () => [1n, "two", true],
  pair: (left, right) => ({ left, right }),
  nothing: () => {},
  note: async () => {},
  who: ({ caller }) => caller,
}

// The caller is checked principal text: comparable with the principals of the
// handler's own arguments, and usable as one.
export const echoCaller: Shapes = {
  lookup: (who, { caller }) => (who === caller ? "me" : null),
}

// The management canister's methods are handled like any other's.
export const managementHandlers: TestHandlers<management.Actor> = {
  stop_canister: ({ canister_id }, { caller }) => {
    void canister_id
    void caller
  },
}

// ---------------------------------------------------------------------------
// createTestClient: its options and what it returns
// ---------------------------------------------------------------------------

const identity: Identity = Ed25519KeyIdentity.generate()

createTestClient()
createTestClient({})
createTestClient({ identity })
createTestClient({ identity: 2, signedIn: false })
createTestClient({ network: "ic" })
createTestClient({ network: { host: "http://127.0.0.1:4943", name: "dev" } })
createTestClient({ allowEnvConfig: true, maxDepth: 512 })
// @ts-expect-error a seed is the `identity` option's number: there is no `seed` option
createTestClient({ seed: 2 })
// @ts-expect-error an identity is an Identity or a seed (a number), not text
createTestClient({ identity: "2" })
// @ts-expect-error a network is "ic", "local", "env" or an object
createTestClient({ network: "mainnet" })

const test = createTestClient()

expectTypeOf(test.client).toEqualTypeOf<Client>()
expectTypeOf(test.auth).toEqualTypeOf<TestAuth>()
expectTypeOf(test.requests).toEqualTypeOf<readonly FakeReplicaRequest[]>()
expectTypeOf(test.dropNextReply).toEqualTypeOf<() => void>()
expectTypeOf(test.refuseNext).parameters.toEqualTypeOf<
  [status: number, times?: number]
>()
// Calling it from a handler ends the handler: it never returns.
expectTypeOf(test.reject).parameters.toEqualTypeOf<
  [code: 1 | 2 | 3 | 4 | 5 | 6, message?: string]
>()
expectTypeOf(test.reject).returns.toBeNever()
// @ts-expect-error 7 is not a reject code of the interface specification
test.reject(7)

// The methods can be taken apart: nothing in them reads `this`.
export const { client, auth, mock, reject, dropNextReply, refuseNext } =
  createTestClient()

// `mock` takes the generated module's `actor` and its `Actor` type.
mock<icrc1.Actor>(icrc1.actor, LEDGER, {
  icrc1_fee: () => 10_000n,
  icrc1_transfer: () => reject(4, "no funds"),
})
mock<management.Actor>(management.actor, "aaaaa-aa", managementHandlers)
// @ts-expect-error without the Actor type no method is known: write mock<Actor>(actor, id, handlers)
mock(icrc1.actor, LEDGER, { icrc1_fee: () => 10_000n })

// The canister the handlers answer for is the one the client calls.
export const canister = client.canister<icrc1.Actor>(icrc1.actor, {
  id: LEDGER,
})
expectTypeOf(canister.icrc1_fee).returns.toEqualTypeOf<Promise<bigint>>()
void dropNextReply
void refuseNext
void auth
