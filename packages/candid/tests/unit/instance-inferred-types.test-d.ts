/**
 * The instance-inferred type helpers of `@ic-reactor/core` read the service
 * and transform of each candid reactor, including the transforms this package
 * adds to the registries (`metadata`, `metadataDisplay`).
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type {
  BaseActor,
  Reactor,
  ReactorArgs,
  ReactorArgsOf,
  ServiceOf,
  TransformOf,
} from "@ic-reactor/core"
import type {
  CandidDisplayReactor,
  CandidReactor,
  MetadataDisplayReactor,
  MetadataReactor,
} from "../../src/index.js"

interface Service {
  greet: ActorMethod<[string, bigint], string>
}

declare const candid: CandidReactor<Service>
declare const candidDisplay: CandidDisplayReactor<Service>
declare const metadata: MetadataReactor<Service>
declare const metadataDisplay: MetadataDisplayReactor<Service>
declare const untyped: CandidDisplayReactor

describe("instance-inferred types of the candid reactors", () => {
  it("read each reactor's service", () => {
    expectTypeOf<ServiceOf<typeof candid>>().toEqualTypeOf<Service>()
    expectTypeOf<ServiceOf<typeof candidDisplay>>().toEqualTypeOf<Service>()
    expectTypeOf<ServiceOf<typeof metadata>>().toEqualTypeOf<Service>()
    expectTypeOf<ServiceOf<typeof metadataDisplay>>().toEqualTypeOf<Service>()
    expectTypeOf<ServiceOf<typeof untyped>>().toEqualTypeOf<BaseActor>()
    expectTypeOf(untyped).toEqualTypeOf<
      CandidDisplayReactor<ServiceOf<typeof untyped>>
    >()
  })

  it("read each reactor's transform", () => {
    expectTypeOf<TransformOf<typeof candid>>().toEqualTypeOf<"candid">()
    expectTypeOf<TransformOf<typeof candidDisplay>>().toEqualTypeOf<"display">()
    expectTypeOf<TransformOf<typeof metadata>>().toEqualTypeOf<"metadata">()
    expectTypeOf<
      TransformOf<typeof metadataDisplay>
    >().toEqualTypeOf<"metadataDisplay">()

    // Each reactor is the Reactor of the service and transform they read.
    expectTypeOf(candid).toExtend<
      Reactor<ServiceOf<typeof candid>, TransformOf<typeof candid>>
    >()
    expectTypeOf(candidDisplay).toExtend<
      Reactor<
        ServiceOf<typeof candidDisplay>,
        TransformOf<typeof candidDisplay>
      >
    >()
    expectTypeOf(metadata).toExtend<
      Reactor<ServiceOf<typeof metadata>, TransformOf<typeof metadata>>
    >()
    expectTypeOf(metadataDisplay).toExtend<
      Reactor<
        ServiceOf<typeof metadataDisplay>,
        TransformOf<typeof metadataDisplay>
      >
    >()
  })

  it("type the args as the reactor takes them", () => {
    expectTypeOf<ReactorArgsOf<typeof candidDisplay, "greet">>().toEqualTypeOf<
      ReactorArgs<Service, "greet", "display">
    >()
    expectTypeOf<ReactorArgsOf<typeof metadata, "greet">>().toEqualTypeOf<
      [string, bigint]
    >()
  })
})
