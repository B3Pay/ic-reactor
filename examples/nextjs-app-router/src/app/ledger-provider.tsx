"use client"

import React, { ReactNode, useState, createContext, useContext } from "react"
import { Reactor, createActorHooks } from "@ic-reactor/react"
import { useICAuth } from "./providers"
import { idlFactory, canisterId } from "../declarations/ledger"
import type { _SERVICE } from "../declarations/ledger"
import type { ActorHooks } from "@ic-reactor/react"

const LedgerReactorContext = createContext<{
  hooks: ActorHooks<_SERVICE, "candid">
  setCanisterId: (id: string) => void
  currentCanisterId: string
} | null>(null)

export function LedgerReactorProvider({ children }: { children: ReactNode }) {
  const { clientManager } = useICAuth()
  const [activeCanisterId, setActiveCanisterId] = useState(canisterId)

  // Instantiate the ledger reactor dynamically on the client
  const [reactor] = useState(() => {
    return new Reactor<_SERVICE>({
      name: "ledger",
      clientManager,
      canisterId: activeCanisterId,
      idlFactory,
    })
  })

  // Change the canister ID of the reactor when user selects a different token
  const setCanisterId = (newId: string) => {
    reactor.setCanisterId(newId)
    setActiveCanisterId(newId)
  }

  const hooks = createActorHooks(reactor)

  return (
    <LedgerReactorContext.Provider
      value={{ hooks, setCanisterId, currentCanisterId: activeCanisterId }}
    >
      {children}
    </LedgerReactorContext.Provider>
  )
}

export function useLedgerReactor() {
  const ctx = useContext(LedgerReactorContext)
  if (!ctx) {
    throw new Error(
      "useLedgerReactor must be used within a LedgerReactorProvider"
    )
  }
  return ctx
}
