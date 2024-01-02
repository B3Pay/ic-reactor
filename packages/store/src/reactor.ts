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
  ReActorAgentState,
  ReActorAgentStore,
  ReActorAuthState,
  ReActorAuthStore,
  ReActorMethodStates,
  ReActorOptions,
} from "./types"
import { IDL } from "@dfinity/candid"

let unsubscribeAgent: (() => void) | undefined

export class ReActorManager<A extends ActorSubclass<any>> {
  public actorStore: ReActorActorStore<A>
  public authStore: ReActorAuthStore<A>

  private isLocal: boolean
  private agentState: ReActorAgentStore

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

  private DEFAULT_AGENT_STATE: ReActorAgentState = {
    agentOptions: undefined,
    agent: undefined,
  }

  constructor(reactorConfig: ReActorOptions) {
    const {
      withDevtools = false,
      initializeOnMount = true,
      isLocal,
      canisterId,
      idlFactory,
      ...agentOptions
    } = reactorConfig

    this.isLocal = isLocal || false

    const methodFields = extractMethodField(idlFactory)

    this.actorStore = createStoreWithOptionalDevtools(
      { ...this.DEFAULT_ACTOR_STATE, methodFields },
      { withDevtools, store: "actor" }
    )

    this.authStore = createStoreWithOptionalDevtools(this.DEFAULT_AUTH_STATE, {
      withDevtools,
      store: "auth",
    })

    this.agentState = createStore(() => ({
      ...this.DEFAULT_AGENT_STATE,
      agentOptions,
    }))

    unsubscribeAgent = this.agentState.subscribe(() => {
      this.createActor(idlFactory, canisterId)
    })

    if (initializeOnMount) {
      this.initialize()
    }
  }

  public unsubscribe = () => {
    unsubscribeAgent?.()
  }

  private updateActorState = (newState: Partial<ReActorActorState<A>>) => {
    this.actorStore.setState((state) => ({ ...state, ...newState }))
  }

  private updateAuthState = (newState: Partial<ReActorAuthState<A>>) => {
    this.authStore.setState((state) => ({ ...state, ...newState }))
  }

  private createActor = async (
    idlFactory: IDL.InterfaceFactory,
    canisterId: CanisterId
  ) => {
    this.updateActorState({
      initializing: true,
      initialized: false,
      methodState: {} as any,
    })
    const agent = this.agentState.getState().agent

    try {
      if (!agent) {
        throw new Error("Agent not initialized")
      }

      if (this.isLocal) {
        await agent.fetchRootKey()
      }

      const actor = Actor.createActor<A>(idlFactory, {
        agent,
        canisterId,
      })

      if (!actor) {
        throw new Error("Failed to initialize actor")
      }

      this.updateActorState({
        actor,
        initializing: false,
        initialized: true,
      })
    } catch (error) {
      this.updateActorState({ error: error as Error, initializing: false })
    }
  }

  public initialize = (agentOptions?: HttpAgentOptions, isLocal?: boolean) => {
    this.isLocal = isLocal || this.isLocal

    this.agentState.setState((prevState) => {
      const agent = new HttpAgent({
        ...prevState.agentOptions,
        ...agentOptions,
      })

      return { ...prevState, agent }
    })
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

      this.initialize({ identity })

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
