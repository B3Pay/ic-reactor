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
import type {} from "@dfinity/auth-client"
import { createReactorStore } from "./createReactorStore"

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
    callMethod,
    getState,
    agentManager,
    ...rest
  } = createReactorStore<A>(config)

  const actorMethod: ActorMethodCall<A> = (functionName, ...args) => {
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
    const { call, ...rest } = actorMethod(
      functionName,
      ...(args as ActorMethodParameters<A[typeof functionName]>)
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
    return actorMethod(
      functionName,
      ...(args as ActorMethodParameters<A[typeof functionName]>)
    )
  }

  return {
    queryCall,
    updateCall,
    callMethod,
    getState,
    subscribeActorState,
    ...agentManager,
    ...rest,
  } as CreateReactorCoreReturnType<A>
}
