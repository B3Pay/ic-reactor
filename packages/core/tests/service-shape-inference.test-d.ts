/**
 * A service can be declared two ways, and both must infer identically.
 *
 * didc and dfx emit `ActorMethod<[Args], Ret>`, so projects using generated
 * declarations never see a problem. A hand-written or third-party-typed service
 * using plain function types used to compile at the declaration site and then
 * fail at every hook call site with `never`/`undefined` argument types, with
 * nothing pointing at the cause.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type {
  ActorMethodParameters,
  ActorMethodReturnType,
} from "../src/types/reactor.js"

interface ConstraintsView {
  max: bigint
}

/** didc-style: what dfx generates. */
interface DidcService {
  get_constraints: ActorMethod<[], ConstraintsView>
  claim: ActorMethod<[Uint8Array], { Ok: bigint }>
}

/** Hand-written: plain function types, no `withOptions`. */
interface PlainService {
  get_constraints: () => Promise<ConstraintsView>
  claim: (giftId: Uint8Array) => Promise<{ Ok: bigint }>
}

describe("service method inference", () => {
  it("infers arguments from didc-style ActorMethod declarations", () => {
    expectTypeOf<
      ActorMethodParameters<DidcService["get_constraints"]>
    >().toEqualTypeOf<[]>()
    expectTypeOf<ActorMethodParameters<DidcService["claim"]>>().toEqualTypeOf<
      [Uint8Array]
    >()
  })

  it("infers arguments from plain function-typed declarations", () => {
    expectTypeOf<
      ActorMethodParameters<PlainService["get_constraints"]>
    >().toEqualTypeOf<[]>()
    expectTypeOf<ActorMethodParameters<PlainService["claim"]>>().toEqualTypeOf<
      [giftId: Uint8Array]
    >()
  })

  it("infers return types from both shapes", () => {
    expectTypeOf<
      ActorMethodReturnType<DidcService["get_constraints"]>
    >().toEqualTypeOf<ConstraintsView>()
    expectTypeOf<
      ActorMethodReturnType<PlainService["get_constraints"]>
    >().toEqualTypeOf<ConstraintsView>()

    expectTypeOf<ActorMethodReturnType<DidcService["claim"]>>().toEqualTypeOf<{
      Ok: bigint
    }>()
    expectTypeOf<ActorMethodReturnType<PlainService["claim"]>>().toEqualTypeOf<{
      Ok: bigint
    }>()
  })

  it("still yields never for a member that is not a method", () => {
    // The fallback must not start matching arbitrary values — a non-function,
    // or a function that does not return a promise, is not a service method.
    expectTypeOf<ActorMethodParameters<string>>().toBeNever()
    expectTypeOf<ActorMethodParameters<() => number>>().toBeNever()
    expectTypeOf<ActorMethodReturnType<string>>().toBeNever()
  })
})
