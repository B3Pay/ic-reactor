/**
 * `createActorHooks(...).useActorQuery` and `.useActorSuspenseQuery` forward
 * their whole config to the standalone hooks, which take `callConfig` and use
 * it for the call and for the cache key. The useActorQuery reference lists
 * `callConfig` as an option. The bound types were built on `QueryConfig`, which
 * createQuery shares and which had no `callConfig`, so passing it failed to
 * compile with an excess-property error. `defineReactor` returns the same
 * hooks, so its users were blocked too. `QueryConfig` now has it, for
 * createQuery as well; see query-factory-call-config.test-d.ts.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod, CallConfig } from "@icp-sdk/core/agent"
import type { Reactor } from "@ic-reactor/core"
import type { ActorHooks } from "../src/createActorHooks.js"
import type { DefineReactorResult } from "../src/defineReactor.js"

interface Service {
  icrc1_balance_of: ActorMethod<[string], bigint>
}

declare const hooks: ActorHooks<Service, "candid">
declare const defined: DefineReactorResult<
  Service,
  "candid",
  Reactor<Service, "candid">
>

// Route the call to another ledger of the same type.
const callConfig: CallConfig = { canisterId: "mc6ru-gyaaa-aaaar-qaaaq-cai" }

describe("createActorHooks query hooks accept callConfig", () => {
  it("useActorQuery, keeping the data type", () => {
    const { data } = hooks.useActorQuery({
      functionName: "icrc1_balance_of",
      args: ["alice"],
      callConfig,
    })
    expectTypeOf(data).toEqualTypeOf<bigint | undefined>()
  })

  it("useActorQuery with select", () => {
    const { data } = hooks.useActorQuery({
      functionName: "icrc1_balance_of",
      args: ["alice"],
      callConfig,
      select: (balance) => balance.toString(),
    })
    expectTypeOf(data).toEqualTypeOf<string | undefined>()
  })

  it("useActorSuspenseQuery", () => {
    const { data } = hooks.useActorSuspenseQuery({
      functionName: "icrc1_balance_of",
      args: ["alice"],
      callConfig,
    })
    expectTypeOf(data).toEqualTypeOf<bigint>()
  })

  it("the hooks defineReactor returns", () => {
    defined.useActorQuery({
      functionName: "icrc1_balance_of",
      args: ["alice"],
      callConfig,
    })
  })

  it("still checks the callConfig shape", () => {
    hooks.useActorQuery({
      functionName: "icrc1_balance_of",
      args: ["alice"],
      // @ts-expect-error canisterId is a string or a Principal
      callConfig: { canisterId: 42 },
    })
  })
})
