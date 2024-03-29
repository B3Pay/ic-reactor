"use client"
import { createReactor } from "@ic-reactor/react"
import { canisterId, idlFactory, todo } from "declarations/todo"

export const {
  useActorState,
  useAuthState,
  useAuth,
  useQueryCall,
  useUpdateCall
} = createReactor<typeof todo>({
  idlFactory,
  canisterId,
  withProcessEnv: true
})
