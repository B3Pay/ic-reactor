/**
 * The hooks of a DisplayReactor could not be used on a method whose result
 * contains itself through `opt`, `vec` or a tuple, such as Motoko's
 * `type List = opt record { int; List }`. The reactor and its hooks compiled,
 * but every call naming such a method failed with TS2589, "Type instantiation
 * is excessively deep and possibly infinite" (#566). The display types are
 * fixed in @ic-reactor/core; this checks the hooks and factories built on them.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { DisplayReactor } from "@ic-reactor/core"
import { createActorHooks } from "../src/createActorHooks.js"
import { createQuery } from "../src/createQuery.js"
import { createMutation } from "../src/createMutation.js"

/** `type List = opt record { int; List }`, as didc emits it. */
type List = [] | [[bigint, List]]

interface Service {
  get: ActorMethod<[], List>
  set: ActorMethod<[List], List>
}

/** A List as the DisplayReactor returns it. */
type ListView = [string, ListView] | null | undefined

declare const reactor: DisplayReactor<Service>
const hooks = createActorHooks(reactor)

describe("hooks for a method that returns Motoko's List", () => {
  it("useActorQuery", () => {
    const { data } = hooks.useActorQuery({ functionName: "get" })
    // The query cache stores a missing value as null.
    expectTypeOf(data).toEqualTypeOf<[string, ListView] | null | undefined>()
  })

  it("useActorSuspenseQuery", () => {
    const { data } = hooks.useActorSuspenseQuery({ functionName: "get" })
    expectTypeOf(data).toEqualTypeOf<[string, ListView] | null>()
  })

  it("useActorMutation", () => {
    const { mutateAsync } = hooks.useActorMutation({ functionName: "set" })
    expectTypeOf(mutateAsync).parameter(0).toEqualTypeOf<[ListView]>()

    void mutateAsync([["1", ["2", null]]])
    // @ts-expect-error a List holds strings for its int, not bigints
    void mutateAsync([[1n, null]])
  })

  it("createQuery and createMutation", async () => {
    const list = createQuery(reactor, { functionName: "get" })
    expectTypeOf(await list.fetch()).toEqualTypeOf<[string, ListView] | null>()

    const set = createMutation(reactor, { functionName: "set" })
    expectTypeOf(await set.execute([["1", null]])).toEqualTypeOf<ListView>()
  })
})
