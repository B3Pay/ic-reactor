/**
 * The configs of `createQuery`, `createSuspenseQuery` and their factories take
 * `callConfig`, typed as `Reactor.callMethod` takes it, and adding it leaves
 * the data types alone.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod, CallConfig } from "@icp-sdk/core/agent"
import type { Reactor } from "@ic-reactor/core"
import { createQuery, createQueryFactory } from "../src/createQuery.js"
import {
  createSuspenseQuery,
  createSuspenseQueryFactory,
} from "../src/createSuspenseQuery.js"

interface Service {
  icrc1_balance_of: ActorMethod<[string], bigint>
}

declare const reactor: Reactor<Service>

const callConfig: CallConfig = { canisterId: "mxzaz-hqaaa-aaaar-qaada-cai" }

describe("query factory configs accept callConfig", () => {
  it("createQuery and createSuspenseQuery, keeping the data type", () => {
    const balance = createQuery(reactor, {
      functionName: "icrc1_balance_of",
      args: ["alice"],
      callConfig,
    })
    expectTypeOf(balance.fetch()).toEqualTypeOf<Promise<bigint>>()

    const suspense = createSuspenseQuery(reactor, {
      functionName: "icrc1_balance_of",
      args: ["alice"],
      callConfig,
      select: (value) => value.toString(),
    })
    expectTypeOf(suspense.fetch()).toEqualTypeOf<Promise<string>>()
  })

  it("the args-late factories", () => {
    const getBalance = createQueryFactory(reactor, {
      functionName: "icrc1_balance_of",
      callConfig,
    })
    expectTypeOf(getBalance(["alice"]).fetch()).toEqualTypeOf<Promise<bigint>>()

    const getSuspenseBalance = createSuspenseQueryFactory(reactor, {
      functionName: "icrc1_balance_of",
      callConfig,
    })
    expectTypeOf(getSuspenseBalance(["alice"]).fetch()).toEqualTypeOf<
      Promise<bigint>
    >()
  })

  it("still checks the callConfig shape", () => {
    createQuery(reactor, {
      functionName: "icrc1_balance_of",
      args: ["alice"],
      // @ts-expect-error canisterId is a string or a Principal
      callConfig: { canisterId: 42 },
    })
  })
})
