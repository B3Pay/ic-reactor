/* eslint-disable no-console */
import { Actor } from "@dfinity/agent"
import { createStoreWithOptionalDevtools } from "../../tools/helper"
import type { HttpAgent } from "@dfinity/agent"
import type {
  CanisterId,
  ActorMethodParameters,
  ActorMethodReturnType,
  ActorState,
  ActorStore,
  ActorMethodStates,
  ActorManagerParameters,
  FunctionName,
  VisitService,
  BaseActor,
  ActorMethodState,
} from "./types"
import { IDL } from "@dfinity/candid"
import type { AgentManager } from "../agent"
import type { UpdateAgentParameters } from "../../types"

export class ActorManager<A = BaseActor> {
  private _actor: null | A = null
  private _idlFactory: IDL.InterfaceFactory
  private _agentManager: AgentManager

  public canisterId: CanisterId
  public actorStore: ActorStore<A>
  public visitFunction: VisitService<A>

  private initialState: ActorState<A> = {
    methodState: {} as ActorMethodStates<A>,
    initializing: false,
    initialized: false,
    error: undefined,
  }

  private updateState = (newState: Partial<ActorState<A>>) => {
    this.actorStore.setState((state) => ({ ...state, ...newState }))
  }

  public updateMethodState = (
    method: FunctionName<A>,
    hash: string,
    newState: Partial<ActorMethodState<A, typeof method>[string]>
  ) => {
    this.actorStore.setState((state) => {
      const methodState = state.methodState[method] || {}
      const currentMethodState = methodState[hash] || DEFAULT_STATE

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

  constructor(actorConfig: ActorManagerParameters) {
    const {
      agentManager,
      canisterId,
      idlFactory,
      withVisitor = false,
      withDevtools = false,
      initializeOnCreate = true,
    } = actorConfig

    this.canisterId = canisterId
    this._idlFactory = idlFactory
    this._agentManager = agentManager

    if (withVisitor) {
      this.visitFunction = withVisitor ? this.extractService() : emptyVisitor
    } else {
      this.visitFunction = emptyVisitor
    }

    // Initialize stores
    this.actorStore = createStoreWithOptionalDevtools(this.initialState, {
      withDevtools,
      store: `actor-${String(canisterId)}`,
    })

    this._agentManager.subscribeAgent(this.initializeActor, initializeOnCreate)
  }

  public initialize = async (options?: UpdateAgentParameters) => {
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
    ...args: ActorMethodParameters<A[M]>
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
      ...args: ActorMethodParameters<A[M]>
    ) => Promise<ActorMethodReturnType<A[M]>>

    const data = await method(...args)

    return data
  }

  // agent store
  get agentManager() {
    return this._agentManager
  }

  // actor store
  public getActor = (): A | null => {
    return this._actor
  }

  public getState: ActorStore<A>["getState"] = () => {
    return this.actorStore.getState()
  }

  public subscribeActorState: ActorStore<A>["subscribe"] = (listener) => {
    return this.actorStore.subscribe(listener)
  }

  public setState: ActorStore<A>["setState"] = (updater) => {
    return this.actorStore.setState(updater)
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

const DEFAULT_STATE = { data: undefined, error: undefined, loading: false }
