import { HttpAgent, HttpAgentOptions } from "@dfinity/agent"
import { ReActorAuth } from "./auth"
import { ReActorActor } from "./actor"
import type { ActorSubclass } from "@dfinity/agent"
import { ReActorOptions } from "../types"
import { StoreApi, createStore } from "zustand"

export const createReActorStore = <A extends ActorSubclass<any>>(
  reactorConfig: ReActorOptions
): ReActorAgentManager<A> => {
  return new ReActorAgentManager<A>({
    host: reactorConfig.isLocal
      ? "http://localhost:4943"
      : "https://icp-api.io",
    ...reactorConfig,
  })
}

export class ReActorAgentManager<A extends ActorSubclass<any>> {
  private authManager: ReActorAuth<A>
  private actorManager: ReActorActor<A>

  private isLocal: boolean
  private agent: StoreApi<HttpAgent | undefined>

  public unsubscribe: () => void

  constructor(reactorConfig: ReActorOptions) {
    const {
      initializeOnMount = true,
      withDevtools = false,
      isLocal = false,
      canisterId,
      idlFactory,
      ...agentOptions
    } = reactorConfig

    if (idlFactory === undefined) {
      throw new Error("idlFactory is required")
    }

    this.isLocal = isLocal

    this.authManager = new ReActorAuth<A>(withDevtools)
    this.actorManager = new ReActorActor<A>({
      withDevtools,
      idlFactory,
      canisterId,
    })

    this.agent = createStore(() => undefined)

    this.unsubscribe = this.agent.subscribe((agent) => {
      if (!agent) {
        return
      }

      this.actorManager.createActor(agent)
    })

    if (initializeOnMount) {
      this.initialize(agentOptions, isLocal)
    }

    this.authManager.authenticate()
  }

  private setAgent = (agent: HttpAgent) => {
    this.agent.setState(agent)
  }

  public getAuth = () => {
    return this.authManager
  }

  public getActor = () => {
    return this.actorManager
  }

  public initialize = (agentOptions?: HttpAgentOptions, isLocal?: boolean) => {
    this.isLocal = isLocal || this.isLocal

    if (this.isLocal) {
      const agent = new HttpAgent({
        host: "http://localhost:4943",
        ...agentOptions,
      })
      this.setAgent(agent)
    } else {
      const agent = new HttpAgent({ ...agentOptions })
      this.setAgent(agent)
    }
  }
}
