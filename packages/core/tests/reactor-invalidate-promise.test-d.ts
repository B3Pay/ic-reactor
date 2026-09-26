/**
 * `Reactor.invalidateQueries` is typed as returning TanStack Query's promise,
 * so `await` waits for the refetches and a floating call is visible to
 * `no-floating-promises`. It was typed `void`.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { Reactor } from "../src/reactor.js"
import type { DisplayReactor } from "../src/display-reactor.js"

interface Service {
  get_user: ActorMethod<[string], { name: string }>
}

declare const reactor: Reactor<Service>
declare const displayReactor: DisplayReactor<Service>

describe("Reactor.invalidateQueries", () => {
  it("returns Promise<void> for every form", () => {
    expectTypeOf(reactor.invalidateQueries()).toEqualTypeOf<Promise<void>>()
    expectTypeOf(
      reactor.invalidateQueries({ functionName: "get_user", args: ["alice"] })
    ).toEqualTypeOf<Promise<void>>()
    expectTypeOf(
      displayReactor.invalidateQueries({ functionName: "get_user" })
    ).toEqualTypeOf<Promise<void>>()
  })
})
