// A todo canister, `./declarations/todo`, for the `createReactorProvider`
// page's `src/reactor.tsx`.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export interface Todo {
  id: bigint
  description: string
  completed: boolean
}

export interface _SERVICE {
  getAllTodos: ActorMethod<[], Array<Todo>>
  addTodo: ActorMethod<[string], bigint>
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const canisterId = "be2us-64aaa-aaaaa-qaabq-cai"
