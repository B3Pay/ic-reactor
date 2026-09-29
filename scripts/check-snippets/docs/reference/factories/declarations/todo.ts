// A todo canister, `./declarations/todo`, for the pages' `todoReactor`.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export interface Todo {
  id: bigint
  title: string
  completed: boolean
}
export type SortBy = { Title: null } | { CreatedAt: null }
export interface ListTodosRequest {
  completed: [] | [boolean]
  search: string
  sort_by: [] | [SortBy]
  paginate: { offset: bigint; limit: number }
}
export interface TodoPage {
  todos: Array<Todo>
  next_offset: [] | [bigint]
}

export interface _SERVICE {
  list_todos: ActorMethod<[ListTodosRequest], TodoPage>
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const canisterId = "be2us-64aaa-aaaaa-qaabq-cai"
