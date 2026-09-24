"use client"

import React, {
  ReactNode,
  useMemo,
  useState,
  createContext,
  useContext,
} from "react"
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

  // One reactor for the ledger interface, built once per mounted tree on the
  // ClientManager the auth provider shares. It is never retargeted: each
  // token gets a sibling of its own from forCanister.
  const [ledger] = useState(
    () =>
      new Reactor<_SERVICE>({
        name: "ledger",
        clientManager,
        canisterId,
        idlFactory,
      })
  )

  // The selected token's hooks. forCanister returns the same sibling for the
  // same canister, and its queries are keyed by that canister, so switching
  // back to a token shows its cached data at once.
  const hooks = useMemo(
    () => createActorHooks(ledger.forCanister(activeCanisterId)),
    [ledger, activeCanisterId]
  )

  return (
    <LedgerReactorContext.Provider
      value={{
        hooks,
        setCanisterId: setActiveCanisterId,
        currentCanisterId: activeCanisterId,
      }}
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
