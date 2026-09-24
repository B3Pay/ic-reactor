/**
 * `defineDisplayReactor` returns what `defineReactor({ display: true })`
 * returned, typed the same, and the deprecated flag keeps its typing (#746).
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import type { DisplayReactor, Reactor } from "@ic-reactor/core"
import {
  defineDisplayReactor,
  defineReactor,
  type DefineReactorResult,
} from "../src/index.js"

interface Service {
  get_balance: ActorMethod<[Principal], bigint>
}

declare const idlFactory: IDL.InterfaceFactory

const base = {
  name: "ledger",
  idlFactory,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
}

type DisplayResult = DefineReactorResult<
  Service,
  "display",
  DisplayReactor<Service>
>

describe("defineDisplayReactor", () => {
  it("returns the display-typed result", () => {
    const result = defineDisplayReactor<Service>(base)

    expectTypeOf(result).toEqualTypeOf<DisplayResult>()
    expectTypeOf(result.reactor).toEqualTypeOf<DisplayReactor<Service>>()

    const { data } = result.useActorQuery({
      functionName: "get_balance",
      args: ["aaaaa-aa"],
    })
    expectTypeOf(data).toEqualTypeOf<string | undefined>()
  })

  it("gives validators display-typed arguments", () => {
    defineDisplayReactor<Service>({
      ...base,
      validators: {
        get_balance: (args) => {
          expectTypeOf(args).toEqualTypeOf<[string]>()
          return { success: true }
        },
      },
    })
  })

  it("takes no display flag", () => {
    // @ts-expect-error the display choice is the function itself
    defineDisplayReactor<Service>({ ...base, display: true })
  })
})

describe("defineReactor", () => {
  it("still types display: true as before", () => {
    const result = defineReactor<Service>({ ...base, display: true })

    expectTypeOf(result).toEqualTypeOf<DisplayResult>()
  })

  it("types the default as a candid Reactor", () => {
    const result = defineReactor<Service>(base)

    expectTypeOf(result).toEqualTypeOf<
      DefineReactorResult<Service, "candid", Reactor<Service, "candid">>
    >()
  })
})
