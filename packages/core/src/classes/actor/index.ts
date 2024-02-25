/* eslint-disable no-console */
import { Actor } from "@dfinity/agent"
import { createStoreWithOptionalDevtools } from "../../utils/helper"
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

  private _unsubscribeAgent: () => void
  private _subscribers: Array<() => void> = []

  public canisterId: CanisterId
  public actorStore: ActorStore<A>
  public visitFunction: VisitService<A>

  private initialState: ActorState<A> = {
    methodState: {} as ActorMethodStates<A>,
    initializing: false,
    initialized: false,
    error: undefined,
  }

  private updateState = (newState: Partial<ActorState<A>>, action?: string) => {
    this.actorStore.setState(
      (state) => ({ ...state, ...newState }),
      false,
      action
    )
  }

  public updateMethodState = (
    method: FunctionName<A>,
    hash: string,
    newState: Partial<ActorMethodState<A, typeof method>[string]>
  ) => {
    this.actorStore.setState(
      (state) => {
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
      },
      false,
      method
    )
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

    // Initialize stores
    this.actorStore = createStoreWithOptionalDevtools(this.initialState, {
      withDevtools,
      name: "Reactor-Actor",
      store: canisterId.toString(),
    })

    this._unsubscribeAgent = this._agentManager.subscribeAgent(
      this.initializeActor,
      initializeOnCreate
    )

    if (withVisitor) {
      this.visitFunction = this.extractService()
    } else {
      this.visitFunction = emptyVisitor
    }
  }

  public initialize = async (options?: UpdateAgentParameters) => {
    await this._agentManager.updateAgent(options)
  }

  public extractService = (): VisitService<A> => {
    if (this._actor === null) {
      throw new Error("For extracting service, actor must be initialized")
    }

    return Actor.interfaceOf(this._actor as Actor)._fields.reduce(
      (acc, service) => {
        const functionName = service[0] as FunctionName<A>
        const type = service[1]

        const visit = ((extractorClass, data) => {
          return type.accept(extractorClass, data || functionName)
        }) as VisitService<A>[typeof functionName]

        acc[functionName] = visit

        return acc
      },
      {} as VisitService<A>
    )
  }

  private initializeActor = (agent: HttpAgent) => {
    console.info(
      `Initializing actor ${this.canisterId} on ${
        agent.isLocal() ? "local" : "ic"
      } network`
    )

    const { _idlFactory, canisterId } = this

    this.updateState(
      {
        initializing: true,
        initialized: false,
        methodState: {} as ActorMethodStates<A>,
      },
      "initializing"
    )

    try {
      if (!agent) {
        throw new Error("Agent not initialized")
      }

      this._actor = Actor.createActor<A>(_idlFactory, {
        agent,
        canisterId,
      })

      if (!this._actor) {
        throw new Error("Failed to initialize actor")
      }

      this.updateState(
        {
          initializing: false,
          initialized: true,
        },
        "initialized"
      )
    } catch (error) {
      console.error("Error in initializeActor:", error)
      this.updateState({ error: error as Error, initializing: false }, "error")
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
    const unsubscribe = this.actorStore.subscribe(listener)
    this._subscribers.push(unsubscribe)
    return unsubscribe
  }

  public setState: ActorStore<A>["setState"] = (updater) => {
    return this.actorStore.setState(updater)
  }

  public cleanup = () => {
    this._unsubscribeAgent()
    this._subscribers.forEach((unsubscribe) => unsubscribe())
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
