/* eslint-disable no-console */
import { Actor } from "@dfinity/agent"
import { createStoreWithOptionalDevtools, isQuery } from "../../utils/helper"
import type { CallConfig, HttpAgent } from "@dfinity/agent"
import type {
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
  MethodAttributes,
  FunctionType,
} from "./types"
import { IDL } from "@dfinity/candid"
import type { AgentManager } from "../agent"
import type { UpdateAgentParameters } from "../types"

export class ActorManager<A = BaseActor> {
  private _actor: null | A = null
  private _idlFactory: IDL.InterfaceFactory
  private _agentManager: AgentManager

  private _unsubscribeAgent: () => void
  private _subscribers: Array<() => void> = []

  public canisterId: string
  public actorStore: ActorStore<A>
  public visitFunction: VisitService<A>
  public methodAttributes: MethodAttributes<A>

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

    if (!canisterId) {
      throw new Error("CanisterId is required!")
    }
    this.canisterId = canisterId.toString()

    if (!idlFactory) {
      throw new Error("IDL factory is required!")
    }

    this._idlFactory = idlFactory
    this.methodAttributes = this.extractMethodAttributes()

    if (!agentManager) {
      throw new Error("Agent manager is required!")
    }
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
      this.visitFunction = this.extractVisitor()
    } else {
      this.visitFunction = emptyVisitor
    }
  }

  public initialize = async (options?: UpdateAgentParameters) => {
    await this._agentManager.updateAgent(options)
  }

  public extractInterface = (): IDL.ServiceClass => {
    return this._idlFactory({ IDL })
  }

  public extractMethodAttributes = (): MethodAttributes<A> => {
    const iface = this.extractInterface()

    const methodAttributesArray = iface._fields.map(([name, func]) => ({
      name: name as FunctionName<A>,
      attributes: {
        numberOfArgs: func.argTypes.length,
        type: (isQuery(func) ? "query" : "update") as FunctionType,
        validate: (arg: never) =>
          func.argTypes.some((t, i) => t.covariant(arg[i])),
      },
    }))

    methodAttributesArray.sort((a, b) => {
      if (a.attributes.type === b.attributes.type) {
        return a.attributes.numberOfArgs - b.attributes.numberOfArgs
      }
      return a.attributes.type === "query" ? -1 : 1
    })

    return methodAttributesArray.reduce((acc, { name, attributes }) => {
      acc[name] = attributes
      return acc
    }, {} as MethodAttributes<A>)
  }

  public extractVisitor = (): VisitService<A> => {
    const iface = this.extractInterface()

    return iface._fields.reduce((acc, service) => {
      const functionName = service[0] as FunctionName<A>
      const type = service[1]

      const visit = ((extractorClass, data) => {
        return type.accept(extractorClass, data)
      }) as VisitService<A>[typeof functionName]

      acc[functionName] = visit

      return acc
    }, {} as VisitService<A>)
  }

  private initializeActor = (agent: HttpAgent) => {
    console.info(
      `Initializing actor ${
        this.canisterId
      } on ${this._agentManager.getNetwork()} network`
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

  private _getActorMethod = <M extends FunctionName<A>>(functionName: M) => {
    if (!this._actor) {
      throw new Error("Actor not initialized")
    }

    if (
      !this._actor[functionName as keyof A] ||
      typeof this._actor[functionName as keyof A] !== "function"
    ) {
      throw new Error(`Method ${String(functionName)} not found`)
    }

    return this._actor[functionName as keyof A] as {
      (...args: ActorMethodParameters<A[M]>): Promise<
        ActorMethodReturnType<A[M]>
      >
      withOptions: (
        options: CallConfig
      ) => (
        ...args: ActorMethodParameters<A[M]>
      ) => Promise<ActorMethodReturnType<A[M]>>
    }
  }

  public callMethod = async <M extends FunctionName<A>>(
    functionName: M,
    ...args: ActorMethodParameters<A[M]>
  ): Promise<ActorMethodReturnType<A[M]>> => {
    const method = this._getActorMethod(functionName)

    const data = await method(...args)

    return data
  }

  public callMethodWithOptions = (options: CallConfig) => {
    return async <M extends FunctionName<A>>(
      functionName: M,
      ...args: ActorMethodParameters<A[M]>
    ): Promise<ActorMethodReturnType<A[M]>> => {
      const method = this._getActorMethod(functionName)

      const data = await method.withOptions(options)(...args)

      return data
    }
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
