import { Reactor, createActorHooks } from "@ic-reactor/react"
import { canisterId, idlFactory } from "declarations/todo"
import type { _SERVICE } from "declarations/todo/todo.did"
import { clientManager } from "./client"

export const todoReactor = new Reactor<_SERVICE>({
  name: "todo",
  clientManager,
  canisterId,
  idlFactory
})

export const { useActorQuery: useQueryTodo, useActorMutation: useMutateTodo } =
  createActorHooks(todoReactor)
