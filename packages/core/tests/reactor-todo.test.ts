import { describe, it, expect } from "vitest"
import { ClientManager, DisplayReactor } from "../src"
import { QueryClient } from "@tanstack/query-core"
import { idlFactory, canisterId, todo } from "./candid/todo"

describe("TodoActor Test", () => {
  // 1. Setup Client Manager with Todo Actor
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
  })

  const todoActor = new DisplayReactor<typeof todo>({
    name: "todo-reactor",
    idlFactory,
    canisterId,
    clientManager,
  })

  // Type checking verification (static check)
  // acts as a "compile-time" test to ensure types are inferred correctly
  it("should infer types correctly", () => {
    const _typedCall = async () => {
      const result = await todoActor.callMethod({
        functionName: "addTodo", // Type hint should appear here
        args: ["New Task"], // Type hint should check this is string
      })
      const todos = await todoActor.callMethod({
        functionName: "getAllTodos",
      })
    }

    expect(todoActor).toBeInstanceOf(DisplayReactor)
  })
})
