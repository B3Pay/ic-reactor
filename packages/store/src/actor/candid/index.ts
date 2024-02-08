export * from "./details"
export * from "./fields"
export * from "./types"
export * from "./result"
export * from "./random"

import { Actor, CanisterStatus, type HttpAgent } from "@dfinity/agent"
import { IDL } from "@dfinity/candid"
import { Principal } from "@dfinity/principal"
import { CanisterId } from "../types"

export class CandidManager {
  private agent: HttpAgent
  private didjsId: string

  constructor(agent: HttpAgent, didjsId?: string) {
    this.agent = agent
    this.didjsId =
      didjsId ||
      (agent.isLocal()
        ? "bd3sg-teaaa-aaaaa-qaaba-cai"
        : "a4gq6-oaaaa-aaaab-qaa4q-cai")
  }

  async getFromMetadata(canisterId: CanisterId): Promise<any | undefined> {
    if (typeof canisterId === "string") {
      canisterId = Principal.fromText(canisterId)
    }

    const status = await CanisterStatus.request({
      agent: this.agent,
      canisterId,
      paths: ["candid"],
    })

    const did = status.get("candid") as string | null
    return did ? this.didTojs(did) : undefined
  }

  async getFromTmpHack(canisterId: CanisterId): Promise<any | undefined> {
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

  async didTojs(candidSource: string): Promise<any> {
    const didjsInterface: IDL.InterfaceFactory = ({ IDL }) =>
      IDL.Service({
        did_to_js: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
      })

    const didjs = Actor.createActor(didjsInterface, {
      agent: this.agent,
      canisterId: this.didjsId,
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
