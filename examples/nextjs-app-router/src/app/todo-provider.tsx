"use client"

import React, { ReactNode, useState } from "react"
import { Reactor, createActorHooks } from "@ic-reactor/react"
import { useICAuth } from "./providers"
import { idlFactory, canisterId } from "../declarations/todo"
import type { _SERVICE } from "../declarations/todo"

// Custom hook to create or retrieve reactor safely in Client components
export function TodoReactorProvider({ children }: { children: ReactNode }) {
  const { clientManager } = useICAuth()

  // We instantiate the reactor statefully on the client inside the React tree
  const [reactor] = useState(() => {
    return new Reactor<_SERVICE>({
      name: "todo",
      clientManager,
      canisterId,
      idlFactory,
    })
  })

  // We export custom hooks using the created reactor
  const actorHooks = createActorHooks(reactor)

  return (
    <TodoReactorContext.Provider value={actorHooks}>
      {children}
    </TodoReactorContext.Provider>
  )
}

import { createContext, useContext } from "react"
import type { ActorHooks } from "@ic-reactor/react"

const TodoReactorContext = createContext<ActorHooks<_SERVICE, "candid"> | null>(
  null
)

export function useTodoReactor() {
  const hooks = useContext(TodoReactorContext)
  if (!hooks) {
    throw new Error("useTodoReactor must be used within a TodoReactorProvider")
  }
  return hooks
}
