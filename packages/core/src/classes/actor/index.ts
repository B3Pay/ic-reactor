/* eslint-disable no-console */
import { Actor } from "@dfinity/agent"
import { isQuery, generateRequestHash } from "../../utils/helper"
import type { CallConfig, HttpAgent } from "@dfinity/agent"
import type {
  ActorMethodParameters,
  ActorMethodReturnType,
  ActorState,
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
import { ACTOR_INITIAL_STATE } from "../../utils"
import type { QueryClient, QueryCacheNotifyEvent } from "@tanstack/query-core"
import { createQueryClient, actorKeys } from "../query"

export class ActorManager<A = BaseActor> {
  private _actor: null | A = null
  private _idlFactory: IDL.InterfaceFactory
  private _agentManager: AgentManager

  private _unsubscribeAgent: () => void
  private _subscribers: Array<() => void> = []
  private _queryClient: QueryClient

  public canisterId: string
  public visitFunction: VisitService<A>
  public methodAttributes: MethodAttributes<A>

  private updateState = (newState: Partial<ActorState<A>>, action?: string) => {
    const queryKey = actorKeys.state(this.canisterId)
    const currentState = this._queryClient.getQueryData<ActorState<A>>(queryKey) || {
      ...ACTOR_INITIAL_STATE,
      name: this.canisterId,
    }
    this._queryClient.setQueryData(queryKey, { ...currentState, ...newState })
    
    if (action) {
      console.debug(`[ActorManager] ${action}`, newState)
    }
  }

  public updateMethodState = (
    method: FunctionName<A>,
    hash: string,
    newState: Partial<ActorMethodState<A, typeof method>[string]>
  ) => {
    const queryKey = actorKeys.method(this.canisterId, method, hash)
    const currentMethodState = this._queryClient.getQueryData<
      ActorMethodState<A, typeof method>[string]
    >(queryKey) || DEFAULT_STATE

    this._queryClient.setQueryData(queryKey, {
      ...currentMethodState,
      ...newState,
    })
  }

  constructor(actorConfig: ActorManagerParameters) {
    const {
      agentManager,
      idlFactory,
      canisterId,
      name = canisterId.toString(),
      withVisitor = false,
      initializeOnCreate = true,
      queryClient,
      queryClientConfig,
    } = actorConfig

    if (!canisterId) {
      throw new Error("CanisterId is required!")
    }
    this.canisterId = canisterId.toString()

    if (!idlFactory) {
      throw new Error("IDLFactory is required!")
    }

    this._idlFactory = idlFactory
    this.methodAttributes = this.extractMethodAttributes()

    if (!agentManager) {
      throw new Error("AgentManager is required!")
    }
    this._agentManager = agentManager

    // Initialize TanStack Query
    this._queryClient = queryClient || createQueryClient(queryClientConfig)
    
    // Initialize actor state in query cache
    const initialState = { ...ACTOR_INITIAL_STATE, name } as ActorState<A>
    this._queryClient.setQueryData(actorKeys.state(this.canisterId), initialState)

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

    return this._actor[functionName as keyof A] as ActorMethodType<A, M>
  }

  public callMethod = async <M extends FunctionName<A>>(
    functionName: M,
    ...args: ActorMethodParameters<A[M]>
  ): Promise<ActorMethodReturnType<A[M]>> => {
    const argsHash = generateRequestHash(args)
    const isQueryMethod = this.methodAttributes[functionName].type === "query"

    if (isQueryMethod) {
      // Use TanStack Query for query methods
      const queryKey = actorKeys.method(this.canisterId, functionName, argsHash)

      return this._queryClient.fetchQuery({
        queryKey,
        queryFn: async () => {
          const method = this._getActorMethod(functionName)
          return await method(...args)
        },
        staleTime: 30000, // 30 seconds - can be configured per method
      })
    } else {
      // Use direct call for update methods
      const method = this._getActorMethod(functionName)
      const data = await method(...args)

      // Invalidate queries after update
      await this._queryClient.invalidateQueries({
        queryKey: actorKeys.all(this.canisterId),
      })

      return data
    }
  }

  public callMethodWithOptions = (options: CallConfig) => {
    return async <M extends FunctionName<A>>(
      functionName: M,
      ...args: ActorMethodParameters<A[M]>
    ): Promise<ActorMethodReturnType<A[M]>> => {
      const method = this._getActorMethod(functionName)

      const data = await method.withOptions(options)(...args)

      // Invalidate queries if this was an update method
      const isQueryMethod = this.methodAttributes[functionName].type === "query"
      if (!isQueryMethod) {
        await this._queryClient.invalidateQueries({
          queryKey: actorKeys.all(this.canisterId),
        })
      }

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

  public getState = (): ActorState<A> => {
    const queryKey = actorKeys.state(this.canisterId)
    return (
      this._queryClient.getQueryData<ActorState<A>>(queryKey) ||
      ({ ...ACTOR_INITIAL_STATE, name: this.canisterId } as ActorState<A>)
    )
  }

  public subscribeActorState = (
    listener: (state: ActorState<A>, previousState: ActorState<A>) => void
  ): (() => void) => {
    const queryKey = actorKeys.state(this.canisterId)
    const unsubscribe = this._queryClient.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
      if (
        event?.query.queryKey &&
        JSON.stringify(event.query.queryKey) === JSON.stringify(queryKey)
      ) {
        listener(this.getState(), this.getState())
      }
    })
    this._subscribers.push(unsubscribe)
    return unsubscribe
  }

  public setState = (
    updater: ActorState<A> | ((state: ActorState<A>) => ActorState<A>)
  ): void => {
    const queryKey = actorKeys.state(this.canisterId)
    const currentState = this.getState()
    const newState =
      typeof updater === "function" ? updater(currentState) : updater
    this._queryClient.setQueryData(queryKey, newState)
  }

  /**
   * Get the QueryClient instance
   */
  public getQueryClient = (): QueryClient => {
    return this._queryClient
  }

  public cleanup = () => {
    this._unsubscribeAgent()
    this._subscribers.forEach((unsubscribe) => unsubscribe())
    
    // Clear query cache for this actor
    this._queryClient.removeQueries({
      queryKey: actorKeys.all(this.canisterId),
    })
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
