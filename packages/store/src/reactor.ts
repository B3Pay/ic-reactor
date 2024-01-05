import {
  Actor,
  ActorSubclass,
  HttpAgent,
  HttpAgentOptions,
} from "@dfinity/agent"
import { AuthClient } from "@dfinity/auth-client"
import { createStore } from "zustand/vanilla"
import { createStoreWithOptionalDevtools, extractMethodField } from "./helper"
import type {
  CanisterId,
  ExtractReActorMethodArgs,
  ExtractReActorMethodReturnType,
  ReActorActorState,
  ReActorActorStore,
  ReActorAgentStore,
  ReActorAuthState,
  ReActorAuthStore,
  ReActorMethodStates,
  ReActorOptions,
} from "./types"
import { IDL } from "@dfinity/candid"

export class ReActorManager<A extends ActorSubclass<any>> {
  public actorStore: ReActorActorStore<A>
  public authStore: ReActorAuthStore<A>
  public agentStore: ReActorAgentStore

  private isLocal: boolean
  private agentOptions: HttpAgentOptions

  private DEFAULT_ACTOR_STATE: ReActorActorState<A> = {
    methodState: {} as ReActorMethodStates<A>,
    methodFields: [],
    initializing: false,
    initialized: false,
    error: undefined,
    actor: null,
  }

  private DEFAULT_AUTH_STATE: ReActorAuthState<A> = {
    identity: null,
    authClient: null,
    authenticating: false,
    authenticated: false,
    error: undefined,
  }

  public unsubscribeAgent: () => void

  private updateActorState = (newState: Partial<ReActorActorState<A>>) => {
    this.actorStore.setState((state) => ({ ...state, ...newState }))
  }

  private updateAuthState = (newState: Partial<ReActorAuthState<A>>) => {
    this.authStore.setState((state) => ({ ...state, ...newState }))
  }

  constructor(reactorConfig: ReActorOptions) {
    const {
      agent,
      isLocal,
      canisterId,
      idlFactory,
      withDevtools = false,
      ...agentOptions
    } = reactorConfig

    this.agentOptions = agentOptions
    this.isLocal = isLocal || false

    const methodFields = extractMethodField(idlFactory)

    // Initialize stores
    this.actorStore = createStoreWithOptionalDevtools(
      { ...this.DEFAULT_ACTOR_STATE, methodFields },
      { withDevtools, store: "actor" }
    )

    this.authStore = createStoreWithOptionalDevtools(this.DEFAULT_AUTH_STATE, {
      withDevtools,
      store: "auth",
    })

    this.agentStore = createStore(() => ({
      agent: undefined,
      canisterId,
    }))

    this.unsubscribeAgent = this.agentStore.subscribe(
      ({ canisterId, agent }) => {
        if (!canisterId) {
          throw new Error("Canister ID not found")
        }
        console.info("Initializing actor for canister ID:", canisterId)
        this.initializeActor(idlFactory, canisterId, agent)
      }
    )

    if (agent) {
      this.agentStore.setState({ agent })
    } else {
      this.initializeAgent()
    }
  }

  private async initializeActor(
    idlFactory: IDL.InterfaceFactory,
    canisterId: CanisterId,
    agent: HttpAgent | undefined
  ) {
    this.updateActorState({
      initializing: true,
      initialized: false,
      methodState: {} as ReActorMethodStates<A>,
    })

    try {
      if (!agent) {
        throw new Error("Agent not initialized")
      }

      const actor = Actor.createActor<A>(idlFactory, { agent, canisterId })

      if (!actor) {
        throw new Error("Failed to initialize actor")
      }

      this.updateActorState({
        actor,
        initializing: false,
        initialized: true,
      })
    } catch (error) {
      console.error("Error in initializeActor:", error)
      this.updateActorState({ error: error as Error, initializing: false })
    }
  }

  public initializeAgent = async (
    agentOptions?: HttpAgentOptions,
    isLocal?: boolean
  ) => {
    this.isLocal = isLocal || this.isLocal

    const agent = new HttpAgent({
      ...this.agentOptions,
      ...agentOptions,
    })

    if (this.isLocal) {
      await agent.fetchRootKey()
    }

    this.agentStore.setState(() => ({ agent }))
  }

  public authenticate = async () => {
    this.updateAuthState({ authenticating: true })

    try {
      const authClient = await AuthClient.create()
      const authenticated = await authClient.isAuthenticated()

      const identity = authClient.getIdentity()

      if (!identity) {
        throw new Error("Identity not found")
      }

      this.agentStore.setState((state) => {
        if (!state.agent) {
          throw new Error("Agent not initialized")
        }

        state.agent.replaceIdentity(identity)

        return state
      })

      this.updateAuthState({
        authClient,
        authenticated,
        identity,
        authenticating: false,
      })
    } catch (error) {
      this.updateAuthState({ error: error as Error, authenticating: false })

      console.error("Error in authenticate:", error)
    }
  }

  public callMethod = async <M extends keyof A>(
    functionName: M,
    ...args: ExtractReActorMethodArgs<A[M]>
  ) => {
    const actor = this.actorStore.getState().actor

    if (!actor) {
      throw new Error("Actor not initialized")
    }

    if (!actor[functionName] || typeof actor[functionName] !== "function") {
      throw new Error(`Method ${String(functionName)} not found`)
    }

    const method = actor[functionName] as (
      ...args: ExtractReActorMethodArgs<A[typeof functionName]>
    ) => Promise<ExtractReActorMethodReturnType<A[typeof functionName]>>

    const data = await method(...args)

    return data
  }
}
