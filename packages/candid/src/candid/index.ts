export * from "./details"
export * from "./fields"
export * from "./result"
export * from "./random/args"
export * from "./random/returns"

export * from "../types"
export * from "../candid"

import type {
  ActorSubclass,
  DefaultActorType,
  FunctionName,
} from "@ic-reactor/store"
import { ActorManager } from "@ic-reactor/store"
import { ActorCandidManagerOptions } from "../types"

import {
  ExtractDetails,
  ExtractFields,
  ExtractedServiceDetails,
  ExtractedServiceFields,
} from "../candid"
import { ExtractedServiceResults } from "./result/types"
import { ExtractTableResult } from "./result"

export class ActorCandidManager<
  A extends ActorSubclass<any> = DefaultActorType
> extends ActorManager {
  public withServiceFields = true
  public withServiceDetails = true

  public serviceFields: ExtractedServiceFields<A>
  public serviceDetails: ExtractedServiceDetails<A>
  public serviceResult: ExtractedServiceResults<A>

  constructor(candidConfig: ActorCandidManagerOptions) {
    const { ...actorConfig } = candidConfig

    super(actorConfig)

    this.serviceFields = this.extractServiceFields()

    this.serviceDetails = this.extractServiceDetails()

    this.serviceResult = this.extractServiceResult()
  }

  public extractServiceFields<
    A extends ActorSubclass<any> = DefaultActorType
  >(): ExtractedServiceFields<A> {
    const extractor = new ExtractFields<A>()

    return extractor.visitService(this.service, this.canisterId.toString())
  }

  public extractServiceDetails<
    A extends ActorSubclass<any> = DefaultActorType
  >(): ExtractedServiceDetails<A> {
    const extractor = new ExtractDetails<A>()

    return this.service._fields.reduce(
      (acc, [functionName, type]) => {
        acc.methodDetails[functionName as FunctionName<A>] = (
          extractorClass
        ) => {
          return type.accept(extractorClass || extractor, functionName as any)
        }

        return acc
      },
      {
        canisterId: this.canisterId.toString(),
        description: this.service.name,
        methodDetails: {} as ExtractedServiceDetails<A>["methodDetails"],
      } as ExtractedServiceDetails<A>
    )
  }

  public extractServiceResult<
    A extends ActorSubclass<any> = DefaultActorType
  >(): ExtractedServiceResults<A> {
    const extractor = new ExtractTableResult<A>()

    return this.service._fields.reduce(
      (acc, [functionName, type]) => {
        acc.methodResult[functionName as FunctionName<A>] = (
          data,
          extractorClass
        ) => {
          return type.accept(extractorClass || extractor, data)
        }

        return acc
      },
      {
        canisterId: this.canisterId.toString(),
        methodResult: {} as ExtractedServiceResults<A>["methodResult"],
      } as ExtractedServiceResults<A>
    )
  }
}
