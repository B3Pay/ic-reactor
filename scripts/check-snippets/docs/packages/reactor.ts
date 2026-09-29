// The `Reactor` the Quick Starts of the core and react pages build over the
// pages' canister (`declarations/backend.ts`), with its `ClientManager`. Their
// `backend` is a global of the package pages (`globals.ts`).
import { ClientManager, Reactor } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

export const queryClient = new QueryClient()
export const clientManager = new ClientManager({ queryClient })

export const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId,
})
