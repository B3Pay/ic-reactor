/**
 * `forCanister` returns the type of the reactor it was called on, so a
 * DisplayReactor's sibling takes and returns display values, and a subclass's
 * sibling keeps the subclass's own members.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { Reactor } from "../src/reactor.js"
import type { DisplayReactor } from "../src/display-reactor.js"
import type { ReactorArgsOf, ReactorDataOf } from "../src/types/reactor.js"

interface Ledger {
  icrc1_balance_of: ActorMethod<[{ owner: Principal }], bigint>
}

declare const ledger: Reactor<Ledger>
declare const displayLedger: DisplayReactor<Ledger>

declare class LedgerReactor extends DisplayReactor<Ledger> {
  decimals(): number
}
declare const subclassed: LedgerReactor
declare const principal: Principal

describe("forCanister", () => {
  it("returns the type it was called on", () => {
    expectTypeOf(ledger.forCanister("aaaaa-aa")).toEqualTypeOf<
      Reactor<Ledger>
    >()
    expectTypeOf(displayLedger.forCanister(principal)).toEqualTypeOf<
      DisplayReactor<Ledger>
    >()
    expectTypeOf(
      subclassed.forCanister("aaaaa-aa")
    ).toEqualTypeOf<LedgerReactor>()
  })

  it("keeps the transform, for the instance-inferred types too", () => {
    const sibling = displayLedger.forCanister("aaaaa-aa")
    expectTypeOf(sibling.transform).toEqualTypeOf<"display">()
    expectTypeOf<
      ReactorArgsOf<typeof sibling, "icrc1_balance_of">[0]["owner"]
    >().toEqualTypeOf<string>()
    expectTypeOf<
      ReactorDataOf<typeof sibling, "icrc1_balance_of">
    >().toEqualTypeOf<string>()
  })

  it("takes a canister id as text or a Principal only", () => {
    // @ts-expect-error a canister id is text or a Principal
    ledger.forCanister(42)
  })
})
