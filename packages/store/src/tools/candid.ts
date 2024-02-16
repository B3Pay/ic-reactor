import { Actor, CanisterStatus } from "@dfinity/agent"
import { IDL } from "@dfinity/candid"
import { Principal } from "@dfinity/principal"
import { CanisterId } from "../actor"
import { AgentManager } from "../agent"

export interface CandidAdapterOptions {
  agentManager: AgentManager
  didjsCanisterId?: string
}

export interface Defenition {
  idlFactory: IDL.InterfaceFactory
  init: ({ IDL }: { IDL: any }) => never[]
}

export class CandidAdapter {
  public agentManager: AgentManager
  public didjsCanisterId: string

  constructor({ agentManager, didjsCanisterId }: CandidAdapterOptions) {
    this.agentManager = agentManager

    this.didjsCanisterId = didjsCanisterId || this.getDefaultDidJsId()

    this.agentManager.subscribeAgent(() => {
      this.didjsCanisterId = didjsCanisterId || this.getDefaultDidJsId()
    })
  }

  private getDefaultDidJsId() {
    return this.agentManager.isLocalEnv
      ? "bd3sg-teaaa-aaaaa-qaaba-cai"
      : "a4gq6-oaaaa-aaaab-qaa4q-cai"
  }

  async getCandidDefinition(canisterId: CanisterId): Promise<Defenition> {
    try {
      // First attempt: Try getting Candid definition from metadata
      const fromMetadata = await this.getFromMetadata(canisterId)
      if (fromMetadata) return fromMetadata

      // Second attempt: Try the temporary hack method
      const fromTmpHack = await this.getFromTmpHack(canisterId)
      if (fromTmpHack) return fromTmpHack

      // If both attempts fail, throw an error
      throw new Error("Failed to retrieve Candid definition by any method.")
    } catch (error) {
      // Log or handle the error as needed
      console.error("Error in getCandidDefinition:", error)
      throw error
    }
  }

  async getFromMetadata(
    canisterId: CanisterId
  ): Promise<Defenition | undefined> {
    if (typeof canisterId === "string") {
      canisterId = Principal.fromText(canisterId)
    }

    const agent = this.agentManager.getAgent()

    const status = await CanisterStatus.request({
      agent,
      canisterId,
      paths: ["candid"],
    })

    const did = status.get("candid") as string | null
    return did ? this.didTojs(did) : undefined
  }

  async getFromTmpHack(
    canisterId: CanisterId
  ): Promise<Defenition | undefined> {
    const commonInterface: IDL.InterfaceFactory = ({ IDL }) =>
      IDL.Service({
        __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ["query"]),
      })

    const agent = this.agentManager.getAgent()

    const actor = Actor.createActor(commonInterface, {
      agent,
      canisterId,
    })

    const data = (await actor.__get_candid_interface_tmp_hack()) as
      | string
      | null
    return data ? this.didTojs(data) : undefined
  }

  async didTojs(candidSource: string): Promise<Defenition> {
    const didjsInterface: IDL.InterfaceFactory = ({ IDL }) =>
      IDL.Service({
        did_to_js: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
      })

    const agent = this.agentManager.getAgent()

    const didjs = Actor.createActor(didjsInterface, {
      agent,
      canisterId: this.didjsCanisterId,
    })

    const js: any = await didjs.did_to_js(candidSource)
    if (JSON.stringify(js) === JSON.stringify([])) {
      throw new Error("Cannot fetch candid file")
    }

    const dataUri =
      "data:text/javascript;charset=utf-8," + encodeURIComponent(js[0])
    return eval('import("' + dataUri + '")')
  }
}
