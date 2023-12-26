"use client"
import { createReActor } from "@ic-reactor/react"
import { canisterId, idlFactory } from "declarations/todo"

export const {
  useActorStore,
  useAuthStore,
  useAuthClient,
  useQueryCall,
  useUpdateCall
} = createReActor({
  idlFactory,
  canisterId,
  withDevtools: true
})
