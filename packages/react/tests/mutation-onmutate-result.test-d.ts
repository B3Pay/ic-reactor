/**
 * TanStack Query hands the value `onMutate` returns to `onSuccess`, `onError`
 * and `onSettled` as their third argument, and types it with the fourth type
 * parameter of `UseMutationOptions`. `MutationConfig`, `MutationHookOptions`
 * and `UseActorMutationParameters` passed only three, so that result was
 * `unknown`. Every optimistic update in the docs failed to compile where it
 * read the snapshot back, with "Property 'previous' does not exist on type
 * '{}'".
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { Reactor } from "@ic-reactor/core"
import type { ActorHooks } from "../src/createActorHooks.js"
import type { DefineReactorResult } from "../src/defineReactor.js"
import { createMutation } from "../src/createMutation.js"
import { useActorMutation } from "../src/hooks/useActorMutation.js"

interface Service {
  likePost: ActorMethod<[string], { Ok: bigint } | { Err: string }>
}

type Snapshot = { previous: bigint }

declare const reactor: Reactor<Service, "candid">
declare const hooks: ActorHooks<Service, "candid">
declare const defined: DefineReactorResult<
  Service,
  "candid",
  Reactor<Service, "candid">
>

describe("the onMutate result is typed in the later callbacks", () => {
  it("createActorHooks useActorMutation", () => {
    const { context } = hooks.useActorMutation({
      functionName: "likePost",
      onMutate: () => ({ previous: 1n }),
      onSuccess: (_data, _variables, onMutateResult) => {
        expectTypeOf(onMutateResult).toEqualTypeOf<Snapshot>()
      },
      onError: (_error, _variables, onMutateResult) => {
        expectTypeOf(onMutateResult).toEqualTypeOf<Snapshot | undefined>()
        // @ts-expect-error the snapshot has no such field
        const _missing = onMutateResult?.missing
      },
      onSettled: (_data, _error, _variables, onMutateResult) => {
        expectTypeOf(onMutateResult).toEqualTypeOf<Snapshot | undefined>()
      },
    })

    expectTypeOf(context).toEqualTypeOf<Snapshot | undefined>()
  })

  it("an async onMutate, through defineReactor", () => {
    defined.useActorMutation({
      functionName: "likePost",
      onMutate: async (variables) => {
        expectTypeOf(variables).toEqualTypeOf<[string]>()
        return { previous: 1n }
      },
      onError: (_error, _variables, onMutateResult) => {
        expectTypeOf(onMutateResult).toEqualTypeOf<Snapshot | undefined>()
      },
    })
  })

  it("createMutation, from a factory-level onMutate", () => {
    createMutation(reactor, {
      functionName: "likePost",
      onMutate: () => ({ previous: 1n }),
      // Still typed as possibly undefined, from when `execute()` ran no
      // onMutate. It now runs one, so a follow-up could narrow this.
      onSuccess: (_data, _variables, onMutateResult) => {
        expectTypeOf(onMutateResult).toEqualTypeOf<Snapshot | undefined>()
      },
      onError: (_error, _variables, onMutateResult) => {
        expectTypeOf(onMutateResult).toEqualTypeOf<Snapshot | undefined>()
        // @ts-expect-error the snapshot has no such field
        const _missing = onMutateResult?.missing
        return onMutateResult?.previous
      },
    })
  })

  it("createMutation useMutation, from a hook-level onMutate", () => {
    const mutation = createMutation(reactor, { functionName: "likePost" })

    const { context } = mutation.useMutation({
      onMutate: async () => ({ previous: 1n }),
      onSuccess: (_data, _variables, onMutateResult) => {
        expectTypeOf(onMutateResult).toEqualTypeOf<Snapshot>()
      },
      onError: (_error, _variables, onMutateResult) => {
        expectTypeOf(onMutateResult).toEqualTypeOf<Snapshot | undefined>()
        // @ts-expect-error the snapshot has no such field
        const _missing = onMutateResult?.missing
      },
    })

    expectTypeOf(context).toEqualTypeOf<Snapshot | undefined>()
  })

  it("the raw hook, exported as useReactorMutation", () => {
    const { context } = useActorMutation({
      reactor,
      functionName: "likePost",
      onMutate: () => ({ previous: 1n }),
      onSettled: (_data, _error, _variables, onMutateResult) => {
        expectTypeOf(onMutateResult).toEqualTypeOf<Snapshot | undefined>()
      },
    })

    expectTypeOf(context).toEqualTypeOf<Snapshot | undefined>()
  })

  it("stays unknown without an onMutate, and explicit generics still work", () => {
    const { context } = hooks.useActorMutation<"likePost">({
      functionName: "likePost",
    })
    expectTypeOf(context).toEqualTypeOf<unknown>()

    const { mutate } = createMutation<Service, "candid", "likePost">(reactor, {
      functionName: "likePost",
    }).useMutation()
    expectTypeOf(mutate).parameter(0).toEqualTypeOf<[string]>()
  })
})
