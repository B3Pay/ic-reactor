import type {
  ActorManagerOptions,
  ActorMethodArgs,
  ActorMethodState,
  BaseActor,
  FunctionName,
} from "./actor/types"
import type { AgentManagerOptions } from "./agent/types"

import { ActorManager } from "./actor"
import { AgentManager } from "./agent"
import type {
  ActorCallFunction,
  ActorCoreActions,
  ActorGetStateFunction,
  ActorMethodCall,
  ActorQuery,
  ActorSubscribeFunction,
  ActorUpdate,
  CreateReActorOptions,
  CreateReActorStoreOptions,
} from "./types"
import {
  CandidAdapter,
  CandidAdapterOptions,
  generateRequestHash,
} from "./tools"
import type { AuthClientLoginOptions } from "@dfinity/auth-client"

export * from "./types"
export * from "./actor"
export * from "./agent"
export * from "./tools"

/**
 * Create a new actor manager with the given options.
 * Its create a new agent manager if not provided.
 *
 * @category Main
 * @includeExample ./packages/core/README.md:30-91
 */
export const createReActor = <A = BaseActor>({
  isLocalEnv,
  withProcessEnv = false,
  ...options
}: CreateReActorOptions): ActorCoreActions<A> => {
  isLocalEnv =
    isLocalEnv ||
    (withProcessEnv
      ? typeof process !== "undefined" &&
        (process.env.DFX_NETWORK === "local" ||
          process.env.NODE_ENV === "development")
      : false)

  const {
    subscribeActorState,
    updateMethodState,
    callMethod,
    getState,
    agentManager,
    ...rest
  } = createReActorStore<A>({
    isLocalEnv,
    ...options,
  })

  const reActorMethod: ActorMethodCall<A> = (functionName, ...args) => {
    const requestHash = generateRequestHash(args)

    const updateState = <M extends FunctionName<A>>(
      newState: Partial<ActorMethodState<A, M>[string]> = {}
    ) => {
      updateMethodState(functionName, requestHash, newState)
    }

    updateState()

    type M = typeof functionName
    try {
      const methodState = ((key?: "data" | "loading" | "error") => {
        const state = getState().methodState[functionName][requestHash]

        switch (key) {
          case "data":
            return state.data
          case "loading":
            return state.loading
          case "error":
            return state.error
          default:
            return state
        }
      }) as ActorGetStateFunction<A, M>

      const subscribe: ActorSubscribeFunction<A, M> = (callback) => {
        const unsubscribe = subscribeActorState((state) => {
          const methodState = state.methodState[functionName]
          const methodStateHash = methodState[requestHash]

          if (methodStateHash) {
            callback(methodStateHash)
          }
        })

        return unsubscribe
      }

      const call: ActorCallFunction<A, M> = async (replaceArgs) => {
        updateState({
          loading: true,
          error: undefined,
        })

        try {
          const data = await callMethod(functionName, ...(replaceArgs ?? args))

          updateState({ data, loading: false })

          return data
        } catch (error) {
          updateState({
            error: error as Error,
            loading: false,
          })
          throw error
        }
      }

      return {
        requestHash,
        subscribe,
        getState: methodState,
        call,
      }
    } catch (error) {
      updateState({
        error: error as Error,
        loading: false,
      })

      throw error
    }
  }

  const queryCall: ActorQuery<A> = ({
    functionName,
    args = [],
    refetchOnMount = true,
    refetchInterval = false,
  }) => {
    let intervalId: NodeJS.Timeout | null = null
    const { call, ...rest } = reActorMethod(
      functionName,
      ...(args as ActorMethodArgs<A[typeof functionName]>)
    )

    if (refetchInterval) {
      intervalId = setInterval(() => {
        call()
      }, refetchInterval)
    }

    let dataPromise = Promise.resolve() as ReturnType<typeof call>
    if (refetchOnMount) dataPromise = call()

    return { ...rest, call, dataPromise, intervalId }
  }

  const updateCall: ActorUpdate<A> = ({ functionName, args = [] }) => {
    return reActorMethod(
      functionName,
      ...(args as ActorMethodArgs<A[typeof functionName]>)
    )
  }

  const login = async (options?: AuthClientLoginOptions) => {
    const authClient = agentManager.getAuthClient()
    if (!authClient) {
      await agentManager.authenticate()
    }

    await authClient!.login({
      identityProvider: isLocalEnv
        ? "https://identity.ic0.app/#authorize"
        : "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943/#authorize",
      ...options,
    })
  }

  const logout = async (options?: { returnTo?: string }) => {
    const authClient = agentManager.getAuthClient()
    if (!authClient) {
      throw new Error("Auth client not initialized")
    }
    await authClient.logout(options)
    await agentManager.authenticate()
  }

  return {
    queryCall,
    updateCall,
    callMethod,
    getState,
    login,
    logout,
    subscribeActorState,
    ...agentManager,
    ...rest,
  } as ActorCoreActions<A>
}

/**
 * Create a new actor manager with the given options.
 * Its create a new agent manager if not provided.
 * It also creates a new actor manager with the given options.
 *
 * @category Main
 * @includeExample ./packages/store/README.md:32-45
 */
export const createReActorStore = <A = BaseActor>(
  options: CreateReActorStoreOptions
): ActorManager<A> => {
  const {
    idlFactory,
    canisterId,
    withDevtools = false,
    initializeOnCreate = true,
    withVisitor = false,
    agentManager: maybeAgentManager,
    ...agentOptions
  } = options

  const agentManager =
    maybeAgentManager ||
    createAgentManager({
      withDevtools,
      ...agentOptions,
    })

  const actorManager = createActorManager<A>({
    idlFactory,
    canisterId,
    agentManager,
    withVisitor,
    withDevtools,
    initializeOnCreate,
  })

  return actorManager
}

/**
 * Agent manager handles the lifecycle of the `@dfinity/agent`.
 * It is responsible for creating agent and managing the agent's state.
 * You can use it to subscribe to the agent changes.
 * login and logout to the internet identity.
 *
 * @category Main
 * @includeExample ./packages/store/README.md:55-86
 */
export const createAgentManager = (
  options?: AgentManagerOptions
): AgentManager => {
  return new AgentManager(options)
}

/**
 * Actor manager handles the lifecycle of the actors.
 * It is responsible for creating and managing the actors.
 * You can use it to call and visit the actor's methods.
 * It also provides a way to interact with the actor's state.
 *
 * @category Main
 * @includeExample ./packages/store/README.md:94-109
 */
export const createActorManager = <A = BaseActor>(
  options: ActorManagerOptions
): ActorManager<A> => {
  return new ActorManager<A>(options)
}

/**
 * The `CandidAdapter` class is used to interact with a canister and retrieve its Candid interface definition.
 * It provides methods to fetch the Candid definition either from the canister's metadata or by using a temporary hack method.
 * If both methods fail, it throws an error.
 *
 * @category Main
 * @includeExample ./packages/store/README.md:164-205
 */
export const createCandidAdapter = (options: CandidAdapterOptions) => {
  return new CandidAdapter(options)
}
