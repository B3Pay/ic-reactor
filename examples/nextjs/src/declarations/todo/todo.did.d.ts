import type { Principal } from "@icp-sdk/core/principal"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export interface Todo {
  id: bigint
  owner: Principal
  completed: boolean
  description: string
}
export interface _SERVICE {
  addTodo: ActorMethod<[string], bigint>
  clearComplete: ActorMethod<[], undefined>
  getAllTodos: ActorMethod<[], Array<Todo>>
  toggleTodo: ActorMethod<[bigint], boolean>
}
export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
