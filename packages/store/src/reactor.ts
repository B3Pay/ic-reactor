import {
  ActorSubclass,
  HttpAgent,
  HttpAgentOptions,
  Identity,
} from "@dfinity/agent"
import { AuthClient } from "@dfinity/auth-client"
import { create } from "zustand"
import { createActorStates } from "./helper"
import type {
  ExtractReActorMethodArgs,
  ExtractReActorMethodReturnType,
  ReActorActorState,
  ReActorState,
  ReActorStore,
  ReActorStoreActions,
} from "./types"

export class ReActorManager<A extends ActorSubclass<any>> {
  public actor: A | null = null
  public store: ReActorStore<A>
  public actions: ReActorStoreActions<A>

  private agent: HttpAgent | null = null
  private agentOptions: HttpAgentOptions | undefined
  private actorInitializer: (agent: HttpAgent) => A

  private DEFAULT_STATE: ReActorState<A> = {
    actorState: {} as ReActorActorState<A>,
    identity: null,
    authClient: null,
    authenticating: false,
    authenticated: false,
    initialized: false,
    initializing: false,
    loading: false,
    error: undefined,
  }

  constructor(
    actorInitializer: (agent: HttpAgent) => A,
    agentOptions?: HttpAgentOptions
  ) {
    this.store = create(() => this.DEFAULT_STATE)
    this.actorInitializer = actorInitializer
    this.agentOptions = agentOptions
    this.actions = this.createActions(agentOptions)
  }

  public initializeActor = (
    agentOptions?: HttpAgentOptions,
    identity?: Identity
  ) => {
    this.store.setState({ initializing: true })
    try {
      this.agent = new HttpAgent({
        identity,
        host:
          process.env.NODE_ENV === "production"
            ? "https://icp-api.io"
            : "http://localhost:4943",
        ...(agentOptions || this.agentOptions),
      })

      this.actor = this.actorInitializer(this.agent)

      if (!this.actor)
        throw new Error("Initialization failed: Actor could not be created.")

      const actorState = createActorStates(this.actor)

      this.store.setState({
        initialized: true,
        actorState,
        initializing: false,
      })
    } catch (error) {
      this.store.setState({ error: error as Error, initializing: false })
    }
  }

  private createActions(
    agentOptions?: HttpAgentOptions
  ): ReActorStoreActions<A> {
    // Helper function to handle common state updates
    const updateState = (newState: Partial<ReActorState<A>>) => {
      this.store.setState((state) => ({ ...state, ...newState }))
    }

    const resetState = () => {
      this.store.setState(this.DEFAULT_STATE)
    }

    const initialize = (identity?: Identity) => {
      updateState({ initializing: true })
      try {
        this.initializeActor(agentOptions, identity)
        if (!this.actor)
          throw new Error("Initialization failed: Actor could not be created.")

        updateState({ initialized: true, initializing: false })
      } catch (error) {
        updateState({ error: error as Error, initializing: false })
      }
    }

    const authenticate = async () => {
      updateState({ authenticating: true })

      try {
        const authClient = await AuthClient.create()
        const authenticated = await authClient.isAuthenticated()

        const identity = authClient.getIdentity()

        if (!identity) {
          throw new Error("Identity not found")
        }

        this.agent = new HttpAgent({
          identity,
          ...(agentOptions || this.agentOptions),
        })

        updateState({
          authClient,
          authenticated,
          identity,
          authenticating: false,
        })
      } catch (error) {
        updateState({ error: error as Error, authenticating: false })

        console.error("Error in authenticate:", error)
      }
    }

    const callMethod = async <M extends keyof A>(
      functionName: M,
      ...args: ExtractReActorMethodArgs<A[M]>
    ) => {
      if (!this.actor) {
        throw new Error("Actor not initialized")
      }

      if (
        !this.actor[functionName] ||
        typeof this.actor[functionName] !== "function"
      ) {
        throw new Error(`Method ${String(functionName)} not found`)
      }

      const method = this.actor[functionName] as (
        ...args: ExtractReActorMethodArgs<A[typeof functionName]>
      ) => Promise<ExtractReActorMethodReturnType<A[typeof functionName]>>

      const data = await method(...args)

      return data
    }

    return {
      initialize,
      authenticate,
      updateState,
      resetState,
      callMethod,
    }
  }
}
