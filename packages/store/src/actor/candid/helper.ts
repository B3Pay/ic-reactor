import { Actor, CanisterStatus } from "@dfinity/agent"
import { Principal } from "@dfinity/principal"
import { IDL } from "@dfinity/candid"

import type {
  ActorSubclass,
  ActorMethod,
  CanisterId,
  HttpAgent,
} from "../types"

export const extractAndSortArgs = <T extends Record<string, unknown>>(
  argsObject: T
): Array<T[keyof T]> => {
  if (!argsObject || typeof argsObject !== "object") return []

  const args: Array<T[keyof T]> = []
  let index = 0

  while (argsObject.hasOwnProperty(`arg${index}`)) {
    args.push(argsObject[`arg${index}`] as T[keyof T])
    index++
  }

  return args
}

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

export function is_query(func: IDL.FuncClass): boolean {
  return (
    func.annotations.includes("query") ||
    func.annotations.includes("composite_query")
  )
}

export async function getDidJsFromMetadata(
  agent: HttpAgent,
  canisterId: CanisterId
) {
  if (typeof canisterId === "string") {
    canisterId = Principal.fromText(canisterId)
  }

  const status = await CanisterStatus.request({
    agent,
    canisterId,
    paths: ["candid"],
  })

  const did = status.get("candid") as string | null

  if (did) {
    return didTojs(agent, did)
  } else {
    return undefined
  }
}

export async function getDidJsFromTmpHack(
  agent: HttpAgent,
  canisterId: CanisterId
) {
  type CommonInterface = {
    __get_candid_interface_tmp_hack: ActorMethod<[], string>
  }

  const common_interface: IDL.InterfaceFactory = ({ IDL }) =>
    IDL.Service({
      __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ["query"]),
    })

  const actor = Actor.createActor<CommonInterface>(common_interface, {
    agent,
    canisterId,
  })

  const data = await actor.__get_candid_interface_tmp_hack()

  return didTojs(agent, data)
}

export async function didTojs(agent: HttpAgent, candid_source: string) {
  // call didjs canister
  const didjs_id = agent.isLocal()
    ? "bd3sg-teaaa-aaaaa-qaaba-cai"
    : "a4gq6-oaaaa-aaaab-qaa4q-cai"

  const didjs_interface: IDL.InterfaceFactory = ({ IDL }) =>
    IDL.Service({
      did_to_js: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
    })

  const didjs: ActorSubclass = Actor.createActor(didjs_interface, {
    agent,
    canisterId: didjs_id,
  })

  const js: any = await didjs.did_to_js(candid_source)

  if (JSON.stringify(js) === JSON.stringify([])) {
    throw new Error("Cannot fetch candid file")
  }
  const dataUri =
    "data:text/javascript;charset=utf-8," + encodeURIComponent(js[0])
  const candid: any = await eval('import("' + dataUri + '")')

  return candid
}
