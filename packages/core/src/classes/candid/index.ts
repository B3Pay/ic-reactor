import { Actor, CanisterStatus, HttpAgent } from "@dfinity/agent"
import type {
  CanisterId,
  CandidAdapterParameters,
  CandidDefenition,
  IDL,
  Principal,
} from "../../types"
import {
  DEFAULT_IC_DIDJS_ID,
  DEFAULT_LOCAL_DIDJS_ID,
} from "../../utils/constants"

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
      if (fromMetadata) return this.evaluateJs(fromMetadata as string)

      // Second attempt: Try the temporary hack method
      const fromTmpHack = await this.getFromTmpHack(canisterId).catch(() => {
        return undefined
      })
      if (fromTmpHack) return this.evaluateJs(fromTmpHack as string)

      // If both attempts fail, throw an error
      throw "Failed to retrieve Candid definition by any method."
    } catch (err) {
      throw new Error(`Error fetching canister ${canisterId}: ${err}`)
    }
  }

  public async getFromMetadata(
    canisterId: CanisterId
  ): Promise<string | undefined> {
    const status = await CanisterStatus.request({
      agent: this.agent,
      canisterId: canisterId as Principal,
      paths: ["candid"],
    })

    return status.get("candid") as string
  }

  public async getFromTmpHack(
    canisterId: CanisterId
  ): Promise<string | undefined> {
    const commonInterface: IDL.InterfaceFactory = ({ IDL }) =>
      IDL.Service({
        __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ["query"]),
      })

    const actor = Actor.createActor(commonInterface, {
      agent: this.agent,
      canisterId,
    })

    return (await actor.__get_candid_interface_tmp_hack()) as string
  }

  public async evaluateJs(data: string): Promise<CandidDefenition> {
    try {
      let candidDef: string | [] = ""

      try {
        candidDef = await this.parseDidToJs(data)
      } catch (error) {
        candidDef = (await this.fetchDidTojs(data))[0]
      }

      if (JSON.stringify(candidDef) === JSON.stringify([])) {
        throw new Error("Cannot compile Candid to JavaScript")
      }

      const dataUri =
        "data:text/javascript;charset=utf-8," + encodeURIComponent(candidDef)

      return eval('import("' + dataUri + '")')
    } catch (error) {
      throw new Error("Error evaluating Candid definition")
    }
  }

  public async fetchDidTojs(candidSource: string): Promise<[string]> {
    type DidToJs = {
      did_to_js: (arg: string) => Promise<[string]>
    }
    const didjsInterface: IDL.InterfaceFactory = ({ IDL }) =>
      IDL.Service({
        did_to_js: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
      })

    const didjs = Actor.createActor<DidToJs>(didjsInterface, {
      agent: this.agent,
      canisterId: this.didjsCanisterId,
    })

    return didjs.did_to_js(candidSource)
  }

  public async parseDidToJs(candidSource: string): Promise<string> {
    try {
      // This is a dynamic import if the module is available in the environment
      const parser = await import("@ic-reactor/parser")
      await parser.default()
      return parser.did_to_js(candidSource)
    } catch (error) {
      throw new Error("@ic-reactor/parser module is not available")
    }
  }
}
