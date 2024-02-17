import { Actor } from "@dfinity/agent"
import { createStoreWithOptionalDevtools } from "../helper"
import type { HttpAgent } from "@dfinity/agent"
import type {
  CanisterId,
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
  ActorState,
  ActorStore,
  ActorMethodStates,
  ActorManagerOptions,
  FunctionName,
  ExtractedService,
  BaseActor,
} from "./types"
import { IDL } from "@dfinity/candid"
import type { AgentManager, UpdateAgentOptions } from "../agent"

export * from "./types"

export class ActorManager<A = BaseActor> {
  private actor: null | A = null
  private idlFactory: IDL.InterfaceFactory

  public agentManager: AgentManager
  public canisterId: CanisterId
  public actorStore: ActorStore<A>
  public visitFunction: ExtractedService<A>

  private DEFAULT_ACTOR_STATE: ActorState<A> = {
    methodState: {} as ActorMethodStates<A>,
    initializing: false,
    initialized: false,
    error: undefined,
  }

  public unsubscribeAgent: () => void

  private updateState = (newState: Partial<ActorState<A>>) => {
    this.actorStore.setState((state) => ({ ...state, ...newState }))
  }

  constructor(reactorConfig: ActorManagerOptions) {
    const {
      agentManager,
      canisterId,
      idlFactory,
      withVisitor = false,
      withDevtools = false,
      initializeOnCreate = true,
    } = reactorConfig

    this.agentManager = agentManager

    this.unsubscribeAgent = this.agentManager.subscribeAgent(
      this.initializeActor
    )

    this.canisterId = canisterId
    this.idlFactory = idlFactory

    if (withVisitor) {
      this.visitFunction = this.extractService()
    } else {
      this.visitFunction = emptyVisitor
    }

    // Initialize stores
    this.actorStore = createStoreWithOptionalDevtools(
      this.DEFAULT_ACTOR_STATE,
      { withDevtools, store: `actor-${String(canisterId)}` }
    )

    if (initializeOnCreate) {
      this.initializeActor(agentManager.getAgent())
    }
  }

  public initialize = async (options?: UpdateAgentOptions) => {
    await this.agentManager.updateAgent(options)
  }

  public extractService(): ExtractedService<A> {
    return this.idlFactory({ IDL })._fields.reduce((acc, service) => {
      const functionName = service[0] as FunctionName<A>
      const type = service[1]

      const visit = ((extractorClass, data) => {
        return type.accept(extractorClass, data || functionName)
      }) as ExtractedService<A>[typeof functionName]

      acc[functionName] = visit

      return acc
    }, {} as ExtractedService<A>)
  }

  private initializeActor = (agent: HttpAgent) => {
    // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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

  public updateMethodState = (
    newState: Partial<ActorState<A>["methodState"]>
  ) => {
    this.actorStore.setState((state) => ({
      ...state,
      methodState: { ...state.methodState, ...newState },
    }))
  }

  public getActor = () => {
    return this.actor
  }
}

const emptyVisitor = new Proxy({} as ExtractedService<never>, {
  get: function (_, prop) {
    throw new Error(
      `Cannot visit function "${String(
        prop
      )}" without initializing the actor with the visitor option, please set the withVisitor option to true when creating the actor manager.`
    )
  },
})
