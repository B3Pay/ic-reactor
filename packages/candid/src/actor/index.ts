import type {
  ActorSubclass,
  DefaultActorType,
  ExtractActorMethodReturnType,
  FunctionName,
} from "@ic-reactor/store"
import { ExtractTableResult, MethodResult } from "./candid/result"
import { ActorManager } from "@ic-reactor/store"
import { ActorCandidManagerOptions } from "./types"

import {
  ExtractDetails,
  ExtractFields,
  ExtractedServiceDetails,
  ExtractedServiceFields,
} from "./candid"

export * from "./types"
export * from "./candid"

export class ActorCandidManager<
  A extends ActorSubclass<any> = DefaultActorType
> extends ActorManager {
  public serviceFields: ExtractedServiceFields<A>
  public serviceDetails: ExtractedServiceDetails<A>

  constructor(candidConfig: ActorCandidManagerOptions) {
    const { ...actorConfig } = candidConfig

    super(actorConfig)

    this.serviceFields = this.extractServiceFields()

    this.serviceDetails = this.extractServiceDetails()
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

    return extractor.visitService(this.service, this.canisterId.toString())
  }

  public transformResult = <M extends FunctionName<A>>(
    methodName: M,
    value: ExtractActorMethodReturnType<A[M]>
  ): MethodResult<A, M>[] => {
    const iface = this.serviceFields?.methodFields[methodName].returnTypes

    if (!this.service) {
      throw new Error(`Method ${String(methodName)} not found`)
    }

    const classType = new ExtractTableResult<A, M>()

    return iface.reduce((acc, type, index) => {
      const field = type.accept(classType, {
        label: `ret${index}`,
        value: iface.length > 1 ? (value as any[])[index] : value,
      })

      acc.push(field)

      return acc
    }, [] as any[])
  }
}
