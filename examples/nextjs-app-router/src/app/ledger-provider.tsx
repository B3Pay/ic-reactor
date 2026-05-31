"use client"

import React, { ReactNode, useState, createContext, useContext } from "react"
import { defineReactor } from "@ic-reactor/react"
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

  // One-call setup: defineReactor builds the reactor + bound hooks once, reusing
  // the shared ClientManager from the auth provider.
  const [{ reactor, ...hooks }] = useState(() =>
    defineReactor<_SERVICE>({
      name: "ledger",
      clientManager,
      canisterId: activeCanisterId,
      idlFactory,
    })
  )

  // Change the canister ID of the reactor when user selects a different token
  const setCanisterId = (newId: string) => {
    reactor.setCanisterId(newId)
    setActiveCanisterId(newId)
  }

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
