"use client"
import { createReActor } from "@ic-reactor/react"
import { canisterId, idlFactory, todo } from "declarations/todo"

export const {
  useActorState,
  useAuthStore,
  useAuthClient,
  useQueryCall,
  useUpdateCall
} = createReActor<typeof todo>({
  idlFactory,
  canisterId,
  withDevtools: true,
  withProcessEnv: true
})
