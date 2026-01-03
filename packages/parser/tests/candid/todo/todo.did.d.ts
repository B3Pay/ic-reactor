import type { Principal } from "@icp-sdk/core/principal"
import type { ActorMethod } from "@icp-sdk/core/agent"

export interface ToDo {
  id: bigint
  completed: boolean
  description: string
}
export type ToDos = Array<ToDo>
export interface _SERVICE {
  addTodo: ActorMethod<[string], bigint>
  clearComplete: ActorMethod<[], undefined>
  getAllTodos: ActorMethod<[], [] | [ToDos]>
  toggleTodo: ActorMethod<[bigint], boolean>
}
