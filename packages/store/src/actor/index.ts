import { Actor } from "@dfinity/agent"
import { createStoreWithOptionalDevtools, extractMethodField } from "../helper"
import type { ActorSubclass, HttpAgent } from "@dfinity/agent"
import type {
  CanisterId,
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
  ActorState,
  ActorStore,
  ActorMethodStates,
  ActorManagerOptions,
  ActorMethodField,
} from "./types"
import type { IDL } from "@dfinity/candid"
import type { AgentManager } from "../agent"

export * from "./types"
export * from "./candid"

export class ActorManager<A extends ActorSubclass<any>> {
  private actor: null | A = null
  private idlFactory: IDL.InterfaceFactory

  public agentManager: AgentManager
  public canisterId: CanisterId
  public actorStore: ActorStore<A>
  public methodFields: ActorMethodField<A>[]

  private DEFAULT_ACTOR_STATE: ActorState<A> = {
    methodState: {} as ActorMethodStates<A>,
    initializing: false,
    initialized: false,
    error: undefined,
  }

  public unsubscribeActor: () => void = () => {}

  private updateState = (newState: Partial<ActorState<A>>) => {
    this.actorStore.setState((state) => ({ ...state, ...newState }))
  }

  constructor(reactorConfig: ActorManagerOptions) {
    const {
      agentManager,
      canisterId,
      idlFactory,
      withDevtools = false,
      initializeOnCreate = true,
    } = reactorConfig

    this.agentManager = agentManager
    this.unsubscribeActor = this.agentManager.subscribeAgent(
      this.initializeActor
    )

    this.canisterId = canisterId
    this.idlFactory = idlFactory
    this.methodFields = extractMethodField(idlFactory)

    // Initialize stores
    this.actorStore = createStoreWithOptionalDevtools(
      { ...this.DEFAULT_ACTOR_STATE },
      { withDevtools, store: "actor" }
    )

    if (initializeOnCreate) {
      this.initializeActor(agentManager.getAgent())
    }
  }

  private initializeActor = (agent: HttpAgent) => {
    console.info(
      `Initializing actor ${this.canisterId} on ${
        agent.isLocal() ? "local" : "ic"
      } network`
    )

    this.updateState({
      initializing: true,
      initialized: false,
      methodState: {} as ActorMethodStates<A>,
    })

    const { idlFactory, canisterId } = this

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

  public callMethod = async <M extends keyof A>(
    functionName: M,
    ...args: ExtractActorMethodArgs<A[M]>
  ) => {
    if (!this.actor) {
      throw new Error("Actor not initialized")
    }

    if (
      !this.actor[functionName] ||
      typeof this.actor[functionName] !== "function"
    ) {
      throw new Error(`Method ${String(functionName)} not found`)
    }

    const method = this.actor[functionName] as (
      ...args: ExtractActorMethodArgs<A[typeof functionName]>
    ) => Promise<ExtractActorMethodReturnType<A[typeof functionName]>>

    const data = await method(...args)

    return data
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
