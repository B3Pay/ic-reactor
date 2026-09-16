/**
 * `onCanisterError` receives the `CanisterError` for a canister's `Err`
 * variant, and its JSDoc promises the typed Err value. `MutationConfig` typed
 * it as `CanisterError<unknown>`, although `MutationHookOptions` and the raw
 * hook already used the method's Err type. The bound `useActorMutation` and a
 * `createMutation` config both take `MutationConfig`, so the error handling
 * docs failed to compile where they read the variant, with "'error.err' is of
 * type 'unknown'".
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { CanisterError, Reactor } from "@ic-reactor/core"
import type { ActorHooks } from "../src/createActorHooks.js"
import type { DefineReactorResult } from "../src/defineReactor.js"
import { createMutation } from "../src/createMutation.js"

type TransferError =
  | { InsufficientFunds: { balance: bigint; required: bigint } }
  | { InvalidRecipient: null }

interface Service {
  transfer: ActorMethod<
    [string, bigint],
    { Ok: bigint } | { Err: TransferError }
  >
  withdraw: ActorMethod<[bigint], { Ok: bigint } | { Err: string }>
}

declare const reactor: Reactor<Service, "candid">
declare const hooks: ActorHooks<Service, "candid">
declare const defined: DefineReactorResult<
  Service,
  "candid",
  Reactor<Service, "candid">
>

describe("onCanisterError receives the method's Err type", () => {
  it("createActorHooks useActorMutation", () => {
    hooks.useActorMutation({
      functionName: "transfer",
      onCanisterError: (error, variables) => {
        expectTypeOf(error.err).toEqualTypeOf<TransferError>()
        expectTypeOf(variables).toEqualTypeOf<[string, bigint]>()

        if ("InsufficientFunds" in error.err) {
          expectTypeOf(
            error.err.InsufficientFunds.balance
          ).toEqualTypeOf<bigint>()
        }
        // @ts-expect-error not one of the Err variants
        const _unknown = error.err.Unknown
      },
    })
  })

  it("a text Err, through defineReactor", () => {
    defined.useActorMutation({
      functionName: "withdraw",
      onCanisterError: (error) => {
        expectTypeOf(error.err).toEqualTypeOf<string>()
      },
    })
  })

  it("createMutation, at the factory level", () => {
    createMutation(reactor, {
      functionName: "transfer",
      onCanisterError: (error) => {
        expectTypeOf(error.err).toEqualTypeOf<TransferError>()
        // @ts-expect-error not one of the Err variants
        const _unknown = error.err.Unknown
      },
    })
  })

  it("still accepts a handler written for CanisterError<unknown>", () => {
    const report = (error: CanisterError<unknown>) => error.code

    hooks.useActorMutation({
      functionName: "transfer",
      onCanisterError: report,
    })
    createMutation(reactor, {
      functionName: "transfer",
      onCanisterError: report,
    })
  })
})
