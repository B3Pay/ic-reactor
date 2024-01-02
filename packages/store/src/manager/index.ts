import { HttpAgent, HttpAgentOptions } from "@dfinity/agent"
import { ReActorAuth } from "./auth"
import { ReActorActor } from "./actor"
import type { ActorSubclass } from "@dfinity/agent"
import { ReActorAgentState, ReActorAgentStore, ReActorOptions } from "../types"
import { createStore } from "zustand"

export class ReActorAgentManager<A extends ActorSubclass<any>> {
  private authManager: ReActorAuth<A>
  private actorManager: ReActorActor<A>

  private isLocal: boolean
  private agentState: ReActorAgentStore
  public unsubscribe: () => void

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

    if (idlFactory === undefined) {
      throw new Error("idlFactory is required")
    }

    this.isLocal = isLocal || false

    this.authManager = new ReActorAuth<A>(withDevtools)
    this.actorManager = new ReActorActor<A>({
      withDevtools,
      idlFactory,
      canisterId,
    })

    this.agentState = createStore(() => ({
      ...this.DEFAULT_AGENT_STATE,
      agentOptions,
    }))

    this.unsubscribe = this.agentState.subscribe((state) => {})

    if (initializeOnMount) {
      this.initialize(agentOptions, isLocal)
    }

    if (canisterId) {
      const agent = this.agentState.getState().agent
      if (!agent) {
        throw new Error("Agent not initialized")
      }

      this.actorManager.createActor(agent, canisterId)
    }

    this.authManager.authenticate()
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
}
