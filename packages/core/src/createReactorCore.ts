import { createReactorStore } from "./createReactorStore"
import { generateRequestHash } from "./utils"

import type {
  ActorMethodState,
  BaseActor,
  FunctionName,
  ActorQuery,
  ActorUpdate,
  ActorMethodCall,
  ActorCallFunction,
  ActorGetStateFunction,
  ActorSubscribeFunction,
  ActorMethodParameters,
  CreateReactorCoreParameters,
  CreateReactorCoreReturnType,
} from "./types"

/**
 * The Core module is the main entry point for the library.
 * Create a new actor manager with the given options.
 * Its create a new agent manager if not provided.
 *
 * @category Main
 * @includeExample ./packages/core/README.md:32-86
 */
export const createReactorCore = <A = BaseActor>(
  config: CreateReactorCoreParameters
): CreateReactorCoreReturnType<A> => {
  const {
    subscribeActorState,
    updateMethodState,
    callMethodWithOptions,
    callMethod,
    getState,
    agentManager,
    ...rest
  } = createReactorStore<A>(config)

  const actorMethod: ActorMethodCall<A> = (
    functionName,
    args,
    options = {}
  ) => {
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
        callback(methodState())

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
          const data = await callMethodWithOptions(options)(
            functionName,
            ...(replaceArgs ?? args)
          )

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
    args = [] as unknown as ActorMethodParameters<A[typeof functionName]>,
    refetchOnMount = true,
    refetchInterval = false,
    ...options
  }) => {
    let intervalId: NodeJS.Timeout | null = null
    const { call, ...rest } = actorMethod(functionName, args, options)

    if (refetchInterval) {
      intervalId = setInterval(() => {
        call()
      }, refetchInterval)
    }

    const clearRefetchInterval = () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }

    let dataPromise = Promise.resolve() as ReturnType<typeof call>
    if (refetchOnMount) dataPromise = call()

    return { ...rest, call, dataPromise, intervalId, clearRefetchInterval }
  }

  const updateCall: ActorUpdate<A> = ({
    functionName,
    args = [] as unknown as ActorMethodParameters<A[typeof functionName]>,
    ...options
  }) => {
    return actorMethod(functionName, args, options)
  }

  return {
    getState,
    queryCall,
    updateCall,
    callMethod,
    callMethodWithOptions,
    subscribeActorState,
    ...agentManager,
    ...rest,
  } as CreateReactorCoreReturnType<A>
}
