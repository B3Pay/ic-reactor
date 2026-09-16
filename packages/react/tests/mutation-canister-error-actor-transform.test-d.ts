/**
 * A return transform can depend on the service through the second type
 * parameter of `TransformReturnRegistry`, as the metadata transforms in
 * `@ic-reactor/candid` do. `onCanisterError` built its error type without
 * passing the service there, so such a transform saw `BaseActor` instead of
 * the reactor's service.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { BaseActor } from "@ic-reactor/core"
import type { MutationConfig, MutationHookOptions } from "../src/types.js"
import type { UseActorMutationParameters } from "../src/hooks/useActorMutation.js"

declare module "@ic-reactor/core" {
  interface TransformArgsRegistry<T> {
    serviceAwareTest: T
  }
  interface TransformReturnRegistry<T, A = BaseActor> {
    serviceAwareTest: { value: T; methods: keyof A }
  }
}

interface Service {
  transfer: ActorMethod<[bigint], { Ok: bigint } | { Err: string }>
  balance: ActorMethod<[], bigint>
}

type CanisterErrorOf<Handler> = Handler extends (
  error: infer E,
  ...rest: never[]
) => void
  ? E
  : never

describe("onCanisterError hands the service to the return transform", () => {
  it("MutationConfig", () => {
    type Handler = NonNullable<
      MutationConfig<Service, "transfer", "serviceAwareTest">["onCanisterError"]
    >
    expectTypeOf<CanisterErrorOf<Handler>["err"]["methods"]>().toEqualTypeOf<
      keyof Service
    >()
  })

  it("MutationHookOptions", () => {
    type Handler = NonNullable<
      MutationHookOptions<
        Service,
        "transfer",
        "serviceAwareTest"
      >["onCanisterError"]
    >
    expectTypeOf<CanisterErrorOf<Handler>["err"]["methods"]>().toEqualTypeOf<
      keyof Service
    >()
  })

  it("UseActorMutationParameters", () => {
    type Handler = NonNullable<
      UseActorMutationParameters<
        Service,
        "transfer",
        "serviceAwareTest"
      >["onCanisterError"]
    >
    expectTypeOf<CanisterErrorOf<Handler>["err"]["methods"]>().toEqualTypeOf<
      keyof Service
    >()
  })
})
