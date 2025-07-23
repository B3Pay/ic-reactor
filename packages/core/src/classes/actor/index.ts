/* eslint-disable no-console */
import {
  Actor,
  AgentError,
  UnexpectedErrorCode,
  ErrorKindEnum,
} from "@dfinity/agent"
import {
  createStoreWithOptionalDevtools,
  generateRequestHash,
  isQuery,
} from "../../utils/helper"
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
  ActorMethodType,
} from "./types"
import { IDL } from "@dfinity/candid"
import type { AgentManager } from "../agent"
import type { UpdateAgentParameters } from "../types"

const ACTOR_INITIAL_STATE = {
  name: "",
  version: 0,
  methodState: {},
  initializing: false,
  initialized: false,
  error: undefined,
}

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
    const actionName = `${method}:${
      newState.error ? "error" : newState.loading ? "loading" : "loaded"
    }`

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
      actionName
    )
  }

  constructor(actorConfig: ActorManagerParameters) {
    const {
      agentManager,
      idlFactory,
      canisterId,
      name = canisterId.toString(),
      withVisitor = false,
      withDevtools = false,
      initializeOnCreate = true,
    } = actorConfig

    if (!canisterId) {
      throw new AgentError(
        new UnexpectedErrorCode("CanisterId is required!"),
        ErrorKindEnum.Unknown
      )
    }
    this.canisterId = canisterId.toString()

    if (!idlFactory) {
      throw new AgentError(
        new UnexpectedErrorCode("IDLFactory is required!"),
        ErrorKindEnum.Unknown
      )
    }

    this._idlFactory = idlFactory
    this.methodAttributes = this.extractMethodAttributes()

    if (!agentManager) {
      throw new AgentError(
        new UnexpectedErrorCode("AgentManager is required!"),
        ErrorKindEnum.Unknown
      )
    }
    this._agentManager = agentManager

    // Initialize stores
    this.actorStore = createStoreWithOptionalDevtools(
      { ...ACTOR_INITIAL_STATE, name } as ActorState<A>,
      {
        withDevtools,
        name: "reactor-actor",
        store: canisterId.toString(),
      }
    )

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
    const network = this._agentManager.getNetwork()
    console.info(`Initializing actor ${this.canisterId} on ${network} network`)

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
        throw new AgentError(
          new UnexpectedErrorCode("Agent not initialized"),
          ErrorKindEnum.Unknown
        )
      }

      this._actor = Actor.createActor<A>(_idlFactory, {
        agent,
        canisterId,
      })

      if (!this._actor) {
        throw new AgentError(
          new UnexpectedErrorCode("Failed to initialize actor"),
          ErrorKindEnum.Unknown
        )
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
      this.updateState(
        { error: error as AgentError, initializing: false },
        "error"
      )
    }
  }

  private _getActorMethod = <M extends FunctionName<A>>(functionName: M) => {
    if (!this._actor) {
      throw new AgentError(
        new UnexpectedErrorCode("Actor not initialized"),
        ErrorKindEnum.Unknown
      )
    }

    if (
      !this._actor[functionName as keyof A] ||
      typeof this._actor[functionName as keyof A] !== "function"
    ) {
      throw new AgentError(
        new UnexpectedErrorCode(`Method ${String(functionName)} not found`),
        ErrorKindEnum.Unknown
      )
    }

    return this._actor[functionName as keyof A] as ActorMethodType<A, M>
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

  public call = async <M extends FunctionName<A>>(
    functionName: M,
    ...args: ActorMethodParameters<A[M]>
  ): Promise<ActorMethodReturnType<A[M]>> => {
    const requestHash = generateRequestHash(args)
    try {
      this.updateMethodState(functionName, requestHash, {
        loading: true,
        error: undefined,
      })

      const data = await this.callMethod(functionName, ...args)

      this.updateMethodState(functionName, requestHash, {
        loading: false,
        data,
      })

      return data
    } catch (error) {
      this.updateMethodState(functionName, requestHash, {
        loading: false,
        error: error as AgentError,
        data: undefined,
      })

      throw error as AgentError
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

  // @ts-expect-error: Overrides subscribe method signature
  public subscribeActorState: ActorStore<A>["subscribe"] = (
    selectorOrListener,
    listener,
    options
  ) => {
    let unsubscribe = () => {}
    if (listener) {
      unsubscribe = this.actorStore.subscribe(
        selectorOrListener,
        listener,
        options
      )
    } else {
      unsubscribe = this.actorStore.subscribe(selectorOrListener)
    }

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
    throw new AgentError(
      new UnexpectedErrorCode(
        `Cannot visit function "${String(
          prop
        )}" without initializing the actor with the visitor option, please set the withVisitor option to true when creating the actor manager.`
      ),
      ErrorKindEnum.Unknown
    )
  },
})

const DEFAULT_STATE = { data: undefined, error: undefined, loading: false }
