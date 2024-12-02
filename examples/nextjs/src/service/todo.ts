import { createActorContext } from "@ic-reactor/react"
import { canisterId, idlFactory, todo } from "declarations/todo"

export const {
  ActorProvider: TodoActorProvider,
  useQueryCall: useQueryTodo,
  useUpdateCall: useUpdateTodo
} = createActorContext<typeof todo>({
  idlFactory,
  canisterId
})
