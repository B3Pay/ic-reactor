import { IDL } from "@dfinity/candid"
import { Actor, ActorMethod, HttpAgent } from "@dfinity/agent"
import { Principal } from "@dfinity/principal"
import { ReActorOptions } from "../types"

export const validateError = (t: IDL.Type<any>) => {
  return function validate(value: any) {
    try {
      t.covariant(value)
      return true
    } catch (error) {
      return (error as Error).message || "An error occurred"
    }
  }
}

export async function getRemoteDidJs(config: ReActorOptions) {
  const canisterId =
    typeof config.canisterId === "string"
      ? Principal.fromText(config.canisterId)
      : config.canisterId

  type CommonInterface = {
    __get_candid_interface_tmp_hack: ActorMethod<[], string>
  }

  const common_interface: IDL.InterfaceFactory = ({ IDL }) =>
    IDL.Service({
      __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ["query"]),
    })

  const actor = Actor.createActor<CommonInterface>(common_interface, {
    agent: new HttpAgent({ host: "https://ic0.app" }),
    canisterId,
  })

  const data = await actor.__get_candid_interface_tmp_hack()

  return didToIdlFactory(data)
}

export async function didToIdlFactory(candid_source: string) {
  const didjs_interface: IDL.InterfaceFactory = ({ IDL }) =>
    IDL.Service({
      did_to_js: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
    })

  type DidJsInterface = {
    did_to_js: ActorMethod<[string], [string]>
  }

  const didjs = Actor.createActor<DidJsInterface>(didjs_interface, {
    agent: new HttpAgent({ host: "https://ic0.app" }),
    canisterId: "a4gq6-oaaaa-aaaab-qaa4q-cai",
  })

  const js = await didjs.did_to_js(candid_source)

  if (!js[0]) {
    throw new Error("Could not convert candid to js")
  }

  const dataUri =
    "data:text/javascript;charset=utf-8," + encodeURIComponent(js[0])
  const candid: any = await eval('import("' + dataUri + '")')

  return candid.idlFactory
}
