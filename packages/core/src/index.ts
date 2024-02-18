/* eslint-disable no-console */
import type {
  ActorMethodState,
  CreateReActorOptions,
  FunctionName,
  BaseActor,
  ActorMethodArgs,
} from "@ic-reactor/store"
import { createReActorStore, generateRequestHash } from "@ic-reactor/store"
import {
  ActorCallFunction,
  ActorGetStateFunction,
  ActorMethodCall,
  ActorQuery,
  ActorSubscribeFunction,
  ActorUpdate,
} from "./types"

export const createReActor = <A = BaseActor>(options: CreateReActorOptions) => {
  const { agentManager, callMethod, actorStore, ...rest } =
    createReActorStore<A>(options)

  const updateMethodState = <M extends FunctionName<A>>(
    method: M,
    args: ActorMethodArgs<A[M]>,
    newState: Partial<ActorMethodState<A, M>[string]> = {}
  ) => {
    const hash = generateRequestHash(args)

    actorStore.setState((state) => {
      // Initialize method state if not already present
      const methodState = state.methodState[method] || {}
      // Initialize specific hash state if not already present
      const hashState = methodState[hash] || {
        loading: false,
        data: undefined,
        error: undefined,
      }

      // Update the state with newState values
      const updatedHashState = { ...hashState, ...newState }

      // Construct the updated state to return
      const updatedState = {
        ...state,
        methodState: {
          ...state.methodState,
          [method]: {
            ...methodState,
            [hash]: updatedHashState,
          },
        },
      }

      return updatedState
    })

    return hash
  }

  const reActorMethod: ActorMethodCall<A> = (functionName, ...args) => {
    type M = typeof functionName
    try {
      const requestHash = updateMethodState(functionName, args)

      const getState = ((key?: "data" | "loading" | "error") => {
        const state =
          actorStore.getState().methodState[functionName][requestHash]

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
        const unsubscribe = actorStore.subscribe((state) => {
          const methodState = state.methodState[functionName]
          const methodStateHash = methodState[requestHash]

          if (methodStateHash) {
            callback(methodStateHash)
          }
        })

        return unsubscribe
      }

      const call: ActorCallFunction<A, M> = async (replaceArgs) => {
        updateMethodState(functionName, args, {
          loading: true,
          error: undefined,
        })

        try {
          const data = await callMethod(functionName, ...(replaceArgs ?? args))

          updateMethodState(functionName, args, { data, loading: false })

          return data
        } catch (error) {
          updateMethodState(functionName, args, {
            error: error as Error,
            loading: false,
          })
          throw error
        }
      }

      return {
        requestHash,
        subscribe,
        getState,
        call,
      }
    } catch (error) {
      updateMethodState(functionName, args, {
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

  return {
    actorStore,
    queryCall,
    updateCall,
    agentManager,
    ...rest,
  }
}
