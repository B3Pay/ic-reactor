import { Actor } from "@dfinity/agent"
import {
  createStoreWithOptionalDevtools,
  extractServiceDetails,
  extractServiceFields,
} from "../helper"
import type { ActorSubclass, HttpAgent } from "@dfinity/agent"
import type {
  CanisterId,
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
  ActorState,
  ActorStore,
  ActorMethodStates,
  ActorManagerOptions,
  DefaultActorType,
} from "./types"
// import type { IDL } from "@dfinity/candid"
import { IDL } from "@dfinity/candid"
import type { AgentManager, UpdateAgentOptions } from "../agent"
import { ExtractedServiceDetails } from "./candid/details"
import { ExtractedServiceFields } from "./candid/fields"
import { FunctionName } from "./candid"
import { ExtractTableResult, MethodResult } from "./candid/result"

export * from "./types"
export * from "./candid"

export class ActorManager<A extends ActorSubclass<any> = DefaultActorType> {
  private actor: null | A = null
  private idlFactory: IDL.InterfaceFactory

  public agentManager: AgentManager
  public canisterId: CanisterId
  public actorStore: ActorStore<A>

  public withServiceFields: boolean = false
  public withServiceDetails: boolean = false
  public serviceFields?: ExtractedServiceFields<A>
  public serviceDetails?: ExtractedServiceDetails<A>

  private DEFAULT_ACTOR_STATE: ActorState<A> = {
    methodState: {} as ActorMethodStates<A>,
    initializing: false,
    initialized: false,
    error: undefined,
  }

  public unsubscribeAgent: () => void = () => {}

  private updateState = (newState: Partial<ActorState<A>>) => {
    this.actorStore.setState((state) => ({ ...state, ...newState }))
  }

  constructor(reactorConfig: ActorManagerOptions) {
    const {
      agentManager,
      canisterId,
      idlFactory,
      withDevtools = false,
      withServiceFields,
      withServiceDetails,
      initializeOnCreate = true,
    } = reactorConfig

    this.withServiceFields = withServiceFields || false
    this.withServiceDetails = withServiceDetails || false

    this.agentManager = agentManager

    this.unsubscribeAgent = this.agentManager.subscribeAgent(
      this.initializeActor
    )

    this.canisterId = canisterId
    this.idlFactory = idlFactory

    if (this.withServiceFields) {
      this.serviceFields = extractServiceFields(idlFactory, canisterId)
    }
    if (this.withServiceDetails) {
      this.serviceDetails = extractServiceDetails(idlFactory, canisterId)
    }

    // Initialize stores
    this.actorStore = createStoreWithOptionalDevtools(
      { ...this.DEFAULT_ACTOR_STATE },
      { withDevtools, store: `actor-${String(canisterId)}` }
    )

    if (initializeOnCreate) {
      this.initializeActor(agentManager.getAgent())
    }
  }

  public initialize = async (options?: UpdateAgentOptions) => {
    await this.agentManager.updateAgent(options)
  }

  private initializeActor = (agent: HttpAgent) => {
    console.info(
      `Initializing actor ${this.canisterId} on ${
        agent.isLocal() ? "local" : "ic"
      } network`
    )

    const { idlFactory, canisterId } = this

    this.updateState({
      initializing: true,
      initialized: false,
      methodState: {} as ActorMethodStates<A>,
    })

    try {
      if (!agent) {
        throw new Error("Agent not initialized")
      }

      this.actor = Actor.createActor<A>(idlFactory, {
        agent,
        canisterId,
      })

      if (!this.actor) {
        throw new Error("Failed to initialize actor")
      }

      this.updateState({
        initializing: false,
        initialized: true,
      })
    } catch (error) {
      console.error("Error in initializeActor:", error)
      this.updateState({ error: error as Error, initializing: false })
    }
  }

  public callMethod = async <M extends FunctionName<A>>(
    functionName: M,
    ...args: ExtractActorMethodArgs<A[M]>
  ): Promise<ExtractActorMethodReturnType<A[M]>> => {
    if (!this.actor) {
      throw new Error("Actor not initialized")
    }

    if (
      !this.actor[functionName as keyof A] ||
      typeof this.actor[functionName as keyof A] !== "function"
    ) {
      throw new Error(`Method ${String(functionName)} not found`)
    }

    const method = this.actor[functionName as keyof A] as (
      ...args: ExtractActorMethodArgs<A[M]>
    ) => Promise<ExtractActorMethodReturnType<A[M]>>

    const data = await method(...args)

    return data
  }

  public transformResult = <M extends FunctionName<A>>(
    methodName: M,
    value: ExtractActorMethodReturnType<A[M]>
  ): MethodResult<A, M>[] => {
    const iface = this.serviceFields?.methodFields[methodName].returnTypes

    if (!iface) {
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

  public updateMethodState = (
    newState: Partial<ActorState<A>["methodState"]>
  ) => {
    this.actorStore.setState((state) => ({
      ...state,
      methodState: { ...state.methodState, ...newState },
    }))
  }
}
