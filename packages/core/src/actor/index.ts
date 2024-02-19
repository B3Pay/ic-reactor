/* eslint-disable no-console */
import { Actor } from "@dfinity/agent"
import { createStoreWithOptionalDevtools } from "../tools/helper"
import type { HttpAgent } from "@dfinity/agent"
import type {
  CanisterId,
  ActorMethodArgs,
  ActorMethodReturnType,
  ActorState,
  ActorStore,
  ActorMethodStates,
  ActorManagerOptions,
  FunctionName,
  VisitService,
  BaseActor,
  ActorMethodState,
} from "./types"
import { IDL } from "@dfinity/candid"
import type { AgentManager, UpdateAgentOptions } from "../agent"

export * from "./types"

export class ActorManager<A = BaseActor> {
  private _store: ActorStore<A>
  private _actor: null | A = null
  private _idlFactory: IDL.InterfaceFactory
  private _agentManager: AgentManager

  public canisterId: CanisterId
  public visitFunction: VisitService<A>

  private initialState: ActorState<A> = {
    methodState: {} as ActorMethodStates<A>,
    initializing: false,
    initialized: false,
    error: undefined,
  }

  public unsubscribeActor: () => void

  private updateState = (newState: Partial<ActorState<A>>) => {
    this._store.setState((state) => ({ ...state, ...newState }))
  }

  public updateMethodState(
    method: FunctionName<A>,
    hash: string,
    newState: Partial<ActorMethodState<A, typeof method>[string]>
  ) {
    this._store.setState((state) => {
      const methodState = state.methodState[method] || {}
      const currentMethodState = methodState[hash] || {
        loading: false,
        data: undefined,
        error: undefined,
      }

      const updatedMethodState = {
        ...methodState,
        [hash]: { ...currentMethodState, ...newState },
      }

      return {
        ...state,
        methodState: {
          ...state.methodState,
          [method]: updatedMethodState,
        },
      }
    })
  }

  constructor(actorConfig: ActorManagerOptions) {
    const {
      agentManager,
      canisterId,
      idlFactory,
      withVisitor = false,
      withDevtools = false,
      initializeOnCreate = true,
    } = actorConfig

    this._agentManager = agentManager

    this.unsubscribeActor = this._agentManager.subscribeAgent(
      this.initializeActor
    )

    this.canisterId = canisterId
    this._idlFactory = idlFactory

    if (withVisitor) {
      this.visitFunction = this.extractService()
    } else {
      this.visitFunction = emptyVisitor
    }

    // Initialize stores
    this._store = createStoreWithOptionalDevtools(this.initialState, {
      withDevtools,
      store: `actor-${String(canisterId)}`,
    })

    if (initializeOnCreate) {
      this.initializeActor(agentManager.getAgent())
    }
  }

  public initialize = async (options?: UpdateAgentOptions) => {
    await this._agentManager.updateAgent(options)
  }

  public extractService(): VisitService<A> {
    return this._idlFactory({ IDL })._fields.reduce((acc, service) => {
      const functionName = service[0] as FunctionName<A>
      const type = service[1]

      const visit = ((extractorClass, data) => {
        return type.accept(extractorClass, data || functionName)
      }) as VisitService<A>[typeof functionName]

      acc[functionName] = visit

      return acc
    }, {} as VisitService<A>)
  }

  private initializeActor = (agent: HttpAgent) => {
    console.info(
      `Initializing actor ${this.canisterId} on ${
        agent.isLocal() ? "local" : "ic"
      } network`
    )

    const { _idlFactory: idlFactory, canisterId } = this

    this.updateState({
      initializing: true,
      initialized: false,
      methodState: {} as ActorMethodStates<A>,
    })

    try {
      if (!agent) {
        throw new Error("Agent not initialized")
      }

      this._actor = Actor.createActor<A>(idlFactory, {
        agent,
        canisterId,
      })

      if (!this._actor) {
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
    ...args: ActorMethodArgs<A[M]>
  ): Promise<ActorMethodReturnType<A[M]>> => {
    if (!this._actor) {
      throw new Error("Actor not initialized")
    }

    if (
      !this._actor[functionName as keyof A] ||
      typeof this._actor[functionName as keyof A] !== "function"
    ) {
      throw new Error(`Method ${String(functionName)} not found`)
    }

    const method = this._actor[functionName as keyof A] as (
      ...args: ActorMethodArgs<A[M]>
    ) => Promise<ActorMethodReturnType<A[M]>>

    const data = await method(...args)

    return data
  }
  // agent store
  get agentManager() {
    return this._agentManager
  }

  public getAgent = (): HttpAgent => {
    return this._agentManager.getAgent()
  }

  // actor store
  public getActor = (): A | null => {
    return this._actor
  }

  public getStore = (): ActorStore<A> => {
    return this._store
  }

  public getState: ActorStore<A>["getState"] = () => {
    return this._store.getState()
  }

  public subscribeActorState: ActorStore<A>["subscribe"] = (listener) => {
    return this._store.subscribe(listener)
  }

  public setState: ActorStore<A>["setState"] = (updater) => {
    return this._store.setState(updater)
  }
}

const emptyVisitor = new Proxy({} as VisitService<never>, {
  get: function (_, prop) {
    throw new Error(
      `Cannot visit function "${String(
        prop
      )}" without initializing the actor with the visitor option, please set the withVisitor option to true when creating the actor manager.`
    )
  },
})
