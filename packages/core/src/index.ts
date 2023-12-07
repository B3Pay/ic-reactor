import type { HttpAgent, HttpAgentOptions } from "@dfinity/agent"
import type {
  ActorSubclass,
  ReActorMethodState,
  ReActorStore,
} from "@ic-reactor/store"
import { createReActorStore, generateRequestHash } from "@ic-reactor/store"
import {
  ReActorCallFunction,
  ReActorGetStateFunction,
  ReActorMethod,
  ReActorQuery,
  ReActorSubscribeFunction,
  ReActorUpdate,
} from "./types"

export type ReActorContextType<A = ActorSubclass<any>> = ReActorStore<A>

export interface CreateReActorOptions extends HttpAgentOptions {
  initializeOnMount?: boolean
}

const defaultCreateReActorOptions: CreateReActorOptions = {
  initializeOnMount: true,
  host:
    process?.env.NODE_ENV === "production" || process?.env.DFX_NETWORK === "ic"
      ? "https://icp-api.io"
      : "http://localhost:4943",
}

export const createReActor = <A extends ActorSubclass<any>>(
  actorInitializer: (agent: HttpAgent) => A,
  options: CreateReActorOptions = {}
) => {
  const optionsWithDefaults = {
    ...defaultCreateReActorOptions,
    ...options,
  }

  const { actions, initializeActor, store } = createReActorStore<A>(
    (agent) => actorInitializer(agent),
    optionsWithDefaults
  )

  if (optionsWithDefaults.initializeOnMount) {
    try {
      initializeActor()
    } catch (e) {
      console.error(e)
    }
  }

  const updateMethodState = <M extends keyof A>(
    method: M,
    args: any[] = [],
    newState?: Partial<ReActorMethodState<A, M>["states"][string]>
  ) => {
    const hash = generateRequestHash(args)

    store.setState((state) => {
      if (!state.actorState) {
        console.error("Actor not initialized")
        return state
      }

      if (!state.actorState[method]) {
        console.error(`Method ${String(method)} not found`)
        return state
      }

      const currentMethodState = state.actorState[method].states[hash] || {
        loading: false,
        data: undefined,
        error: undefined,
      }

      return {
        ...state,
        actorState: {
          ...state.actorState,
          [method]: {
            ...state.actorState[method],
            states: {
              ...state.actorState[method].states,
              [hash]: {
                ...currentMethodState,
                ...newState,
              },
            },
          },
        },
      }
    })

    return hash
  }

  const reActorMethod: ReActorMethod<A> = (functionName, ...args) => {
    type M = typeof functionName
    try {
      const requestHash = updateMethodState(functionName, args)

      const getState: ReActorGetStateFunction<A, M> = (
        key?: "data" | "loading" | "error"
      ) => {
        const state =
          store.getState().actorState[functionName].states[requestHash]

        switch (key) {
          case "data":
            return state.data
          case "loading":
            return state.loading
          case "error":
            return state.error
          default:
            return state as any
        }
      }

      const subscribe: ReActorSubscribeFunction<A, M> = (callback) => {
        const unsubscribe = store.subscribe((state) => {
          const methodState = state.actorState[functionName]
          const methodStateHash = methodState.states[requestHash]

          if (methodStateHash) {
            callback(methodStateHash)
          }
        })

        return unsubscribe
      }

      const call: ReActorCallFunction<A, M> = async (replaceArgs) => {
        updateMethodState(functionName, args, {
          loading: true,
          error: undefined,
        })

        const data = await actions.callMethod(
          functionName,
          ...(replaceArgs ?? args)
        )

        updateMethodState(functionName, args, { data, loading: false })

        return data
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

  const queryCall: ReActorQuery<A> = ({
    functionName,
    args = [],
    disableInitialCall = false,
    autoRefresh = false,
    refreshInterval = 5000,
  }) => {
    let intervalId: NodeJS.Timeout | null = null
    const { call, ...rest } = reActorMethod(functionName, ...(args as any))

    if (autoRefresh) {
      intervalId = setInterval(() => {
        call()
      }, refreshInterval)
    }

    let initialData = Promise.resolve() as ReturnType<typeof call>
    if (!disableInitialCall) initialData = call()

    return { ...rest, recall: call, initialData, intervalId }
  }

  const updateCall: ReActorUpdate<A> = ({ functionName, args = [] }) => {
    return reActorMethod(functionName, ...(args as any))
  }

  return {
    store,
    actions,
    initializeActor,
    queryCall,
    updateCall,
  }
}
