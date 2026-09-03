/**
 * `createActorHooks(...).useActorMutation` must type its variables from the
 * service, the way the standalone hook and `createMutation` already do. It
 * used to omit `TVariables` from `UseMutationResult`, which defaults to
 * `unknown`, so `mutate` / `mutateAsync` accepted any argument and a wrong
 * shape surfaced only as an IDL encode failure at runtime. Every consumer of
 * `createActorHooks` inherited the hole: `defineReactor` and generated hooks.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest: each `@ts-expect-error` below is an unused directive, and therefore
 * a compile error, if the wrong shape is accepted.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { ActorHooks } from "../src/createActorHooks.js"
import type { Reactor } from "@ic-reactor/core"
import type { DefineReactorResult } from "../src/defineReactor.js"

interface Service {
  updateGreet: ActorMethod<[string], string>
  transfer: ActorMethod<[{ to: string; amount: bigint }], { Ok: bigint }>
}

declare const hooks: ActorHooks<Service, "candid">
declare const defined: DefineReactorResult<
  Service,
  "candid",
  Reactor<Service, "candid">
>

describe("createActorHooks useActorMutation variables", () => {
  it("types mutate and mutateAsync from the method's arguments", () => {
    const { mutate, mutateAsync, variables } = hooks.useActorMutation({
      functionName: "updateGreet",
    })

    expectTypeOf(mutate).parameter(0).toEqualTypeOf<[string]>()
    expectTypeOf(mutateAsync).parameter(0).toEqualTypeOf<[string]>()
    expectTypeOf(variables).toEqualTypeOf<[string] | undefined>()

    mutate(["hello"])
    // @ts-expect-error a number is not a string
    mutate([123])
    // @ts-expect-error an object is not the argument tuple
    mutateAsync({ nope: true })
    // @ts-expect-error a bare string is not the argument tuple
    mutateAsync("hello")
  })

  it("carries record arguments through", () => {
    const { mutateAsync } = hooks.useActorMutation({
      functionName: "transfer",
    })

    mutateAsync([{ to: "aaaaa-aa", amount: 1n }])
    // @ts-expect-error amount must be a bigint
    mutateAsync([{ to: "aaaaa-aa", amount: 1 }])
    // @ts-expect-error missing field
    mutateAsync([{ to: "aaaaa-aa" }])
  })

  it("applies through defineReactor, which exposes the same hooks", () => {
    const { mutateAsync } = defined.useActorMutation({
      functionName: "updateGreet",
    })

    expectTypeOf(mutateAsync).parameter(0).toEqualTypeOf<[string]>()
    // @ts-expect-error a number is not a string
    mutateAsync([123])
  })
})
