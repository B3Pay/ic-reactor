import { Actor, ActorSubclass, HttpAgent } from "@dfinity/agent"
import { createStoreWithOptionalDevtools, extractMethodField } from "./helper"
import type {
  CanisterId,
  ExtractReActorMethodArgs,
  ExtractReActorMethodReturnType,
  ReActorActorState,
  ReActorActorStore,
  ReActorMethodStates,
  ReActorOptions,
} from "./types"
import { IDL } from "@dfinity/candid"
import AgentManager from "./agent"

export class ActorManager<A extends ActorSubclass<any>> {
  private canisterId: CanisterId
  private idlFactory: IDL.InterfaceFactory
  private agentManager: AgentManager

  public actorStore: ReActorActorStore<A>

  private DEFAULT_ACTOR_STATE: ReActorActorState<A> = {
    methodState: {} as ReActorMethodStates<A>,
    methodFields: [],
    initializing: false,
    initialized: false,
    error: undefined,
    actor: null,
  }

  private updateActorState = (newState: Partial<ReActorActorState<A>>) => {
    this.actorStore.setState((state) => ({ ...state, ...newState }))
  }

  constructor(reactorConfig: ReActorOptions) {
    const {
      agentManager,
      canisterId,
      idlFactory,
      withDevtools = false,
    } = reactorConfig

    this.agentManager = agentManager
    this.canisterId = canisterId
    this.idlFactory = idlFactory

    this.agentManager.subscribe(this.initializeActor)

    const methodFields = extractMethodField(idlFactory)

    // Initialize stores
    this.actorStore = createStoreWithOptionalDevtools(
      { ...this.DEFAULT_ACTOR_STATE, methodFields },
      { withDevtools, store: "actor" }
    )

    this.initializeActor(agentManager.getAgent())
  }

  private initializeActor = (agent: HttpAgent) => {
    this.updateActorState({
      initializing: true,
      initialized: false,
      methodState: {} as ReActorMethodStates<A>,
    })
    const { idlFactory, canisterId } = this

    try {
      if (!agent) {
        throw new Error("Agent not initialized")
      }

      const actor = Actor.createActor<A>(idlFactory, {
        agent,
        canisterId,
      })

      if (!actor) {
        throw new Error("Failed to initialize actor")
      }

      this.updateActorState({
        actor,
        initializing: false,
        initialized: true,
      })
    } catch (error) {
      console.error("Error in initializeActor:", error)
      this.updateActorState({ error: error as Error, initializing: false })
    }
  }

  public callMethod = async <M extends keyof A>(
    functionName: M,
    ...args: ExtractReActorMethodArgs<A[M]>
  ) => {
    const actor = this.actorStore.getState().actor

    if (!actor) {
      throw new Error("Actor not initialized")
    }

    if (!actor[functionName] || typeof actor[functionName] !== "function") {
      throw new Error(`Method ${String(functionName)} not found`)
    }

    const method = actor[functionName] as (
      ...args: ExtractReActorMethodArgs<A[typeof functionName]>
    ) => Promise<ExtractReActorMethodReturnType<A[typeof functionName]>>

    const data = await method(...args)

    return data
  }
}
