export * from "./details"
export * from "./fields"
export * from "./transform"
export * from "./random/args"
export * from "./random/response"

export * from "../types"
export * from "../candid"

import type {
  ActorSubclass,
  DefaultActorType,
  FunctionName,
  IDL,
} from "@ic-reactor/store"
import { ActorManager } from "@ic-reactor/store"
import { ActorCandidManagerOptions } from "../types"

import { ExtractFields } from "../candid"
import { ExtractedService } from "./types"

export class ActorCandidManager<
  A extends ActorSubclass<any> = DefaultActorType
> extends ActorManager {
  public visitFunction: ExtractedService

  constructor(candidConfig: ActorCandidManagerOptions) {
    const { ...actorConfig } = candidConfig

    super(actorConfig)

    const extractor = new ExtractFields<A>()

    this.visitFunction = this.extractService(extractor)
  }

  private extractService<
    M extends FunctionName<A>,
    E extends IDL.Visitor<any, any> = ExtractFields<A>
  >(extractor: E): ExtractedService<A, M> {
    return this.service._fields.reduce((acc, [functionName, type]) => {
      acc[functionName as M] = (extractorClass, data) => {
        return type.accept(extractorClass || extractor, data || functionName)
      }

      return acc
    }, {} as ExtractedService<A, M>)
  }
}
