import { Actor, CanisterStatus, HttpAgent } from "@dfinity/agent"
import {
  DEFAULT_IC_DIDJS_ID,
  DEFAULT_LOCAL_DIDJS_ID,
} from "@ic-reactor/core/dist/utils/constants"
import { CandidAdapterParameters, CandidDefenition } from "./types"
import { CanisterId, IDL, Principal } from "@ic-reactor/core/dist/types"
import { did_to_js } from "../pkg/didjs"

export class CandidAdapter {
  public agent: HttpAgent
  public didjsCanisterId: string

  public unsubscribeAgent: () => void = () => {}

  constructor({
    agentManager,
    agent,
    didjsCanisterId,
  }: CandidAdapterParameters) {
    if (agent) {
      this.agent = agent
    } else if (agentManager) {
      this.agent = agentManager.getAgent()
      this.unsubscribeAgent = agentManager.subscribeAgent((agent) => {
        this.agent = agent
        this.didjsCanisterId = didjsCanisterId || this.getDefaultDidJsId()
      })
    } else {
      throw new Error("No agent or agentManager provided")
    }

    this.didjsCanisterId = didjsCanisterId || this.getDefaultDidJsId()
  }

  private getDefaultDidJsId() {
    return this.agent.isLocal?.() === true
      ? DEFAULT_LOCAL_DIDJS_ID
      : DEFAULT_IC_DIDJS_ID
  }

  public async getCandidDefinition(
    canisterId: CanisterId
  ): Promise<CandidDefenition> {
    try {
      // First attempt: Try getting Candid definition from metadata
      const fromMetadata = await this.getFromMetadata(canisterId).catch(() => {
        return undefined
      })
      if (fromMetadata) return fromMetadata

      // Second attempt: Try the temporary hack method
      const fromTmpHack = await this.getFromTmpHack(canisterId).catch(() => {
        return undefined
      })
      if (fromTmpHack) return fromTmpHack

      // If both attempts fail, throw an error
      throw "Failed to retrieve Candid definition by any method."
    } catch (err) {
      throw new Error(`Error fetching canister ${canisterId}: ${err}`)
    }
  }

  public async getFromMetadata(
    canisterId: CanisterId
  ): Promise<CandidDefenition | undefined> {
    const status = await CanisterStatus.request({
      agent: this.agent,
      canisterId: canisterId as Principal,
      paths: ["candid"],
    })

    const did = status.get("candid") as string | null
    return did ? this.didTojs(did) : undefined
  }

  public async getFromTmpHack(
    canisterId: CanisterId
  ): Promise<CandidDefenition | undefined> {
    const commonInterface: IDL.InterfaceFactory = ({ IDL }) =>
      IDL.Service({
        __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ["query"]),
      })

    const actor = Actor.createActor(commonInterface, {
      agent: this.agent,
      canisterId,
    })

    const data = (await actor.__get_candid_interface_tmp_hack()) as
      | string
      | null
    return data ? this.didTojs(data) : undefined
  }

  public async didTojs(candidSource: string): Promise<CandidDefenition> {
    // type DidToJs = {
    //   did_to_js: (arg: string) => Promise<[string] | []>
    // }
    // const didjsInterface: IDL.InterfaceFactory = ({ IDL }) =>
    //   IDL.Service({
    //     did_to_js: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
    //   })

    // const didjs = Actor.createActor<DidToJs>(didjsInterface, {
    //   agent: this.agent,
    //   canisterId: this.didjsCanisterId,
    // })

    const js = did_to_js(candidSource)

    const dataUri =
      "data:text/javascript;charset=utf-8," + encodeURIComponent(js as string)

    return eval('import("' + dataUri + '")')
  }
}
