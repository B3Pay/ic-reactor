"use client"
import { createReActor } from "@ic-reactor/react"
import { canisterId, idlFactory, todo } from "declarations/todo"

export const {
  useActorStore,
  useAuthStore,
  useAuthClient,
  useQueryCall,
  useUpdateCall
} = createReActor<typeof todo>({
  idlFactory,
  canisterId,
  withDevtools: true
})
