import type { ActorConfig, Agent, HttpAgentOptions } from "@dfinity/agent"
import { Actor, HttpAgent, hash } from "@dfinity/agent"
import { toHexString, type IDL } from "@dfinity/candid"
import type { FuncClass } from "@dfinity/candid/lib/cjs/idl"
import type {
  ActorSubclass,
  CanisterId,
  DefaultActorType,
  FunctionName,
  ReActorState,
} from "./types"

export declare interface CreateActorOptions {
  agent?: Agent
  agentOptions?: HttpAgentOptions
  actorOptions?: ActorConfig
}

export interface CreateActor extends CreateActorOptions {
  canisterId: string
  idlFactory: IDL.InterfaceFactory
}

export type CreateActorFunctionArgs = {
  canisterId: CanisterId
  idlFactory: IDL.InterfaceFactory
  options: CreateActorOptions
  isLocalEnv?: boolean
}

export const createActor = <A extends ActorSubclass<any> = DefaultActorType>({
  canisterId,
  idlFactory,
  options,
  isLocalEnv,
}: CreateActorFunctionArgs): A => {
  const agent = options.agent || new HttpAgent({ ...options.agentOptions })

  if (options.agent && options.agentOptions) {
    console.warn(
      "Detected both agent and agentOptions passed to createActor. Ignoring agentOptions and proceeding with the provided agent."
    )
  }

  if (isLocalEnv) {
    agent.fetchRootKey().catch((err) => {
      console.warn(
        "Unable to fetch root key. Check to ensure that your local replica is running"
      )
      console.error(err)
    })
  }

  return Actor.createActor(idlFactory, {
    agent,
    canisterId,
    ...options.actorOptions,
  })
}

export function createActorStates<
  A extends ActorSubclass<any> = DefaultActorType
>(actor: A): ReActorState<A>["actorState"] {
  const actorState = {} as ReActorState<A>["actorState"]
  const methods: [string, FuncClass][] = Actor.interfaceOf(
    actor as Actor
  )._fields

  for (const [method, types] of methods) {
    actorState[method as FunctionName<A>] = {
      types,
      states: {},
    }
  }

  return actorState
}

export const generateRequestHash = (args?: any[]) => {
  const serializedArgs = args
    ?.map((arg) => {
      if (typeof arg === "bigint") {
        return arg.toString()
      }
      // Add more conditions for other special types
      return JSON.stringify(arg)
    })
    .join("|")

  const hashBytes = hash(new TextEncoder().encode(serializedArgs ?? ""))
  return toHexString(hashBytes)
}
