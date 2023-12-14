"use client"
import { createReActor } from "@ic-reactor/react"
import { canisterId, createActor } from "declarations/hello"

export const {
  useActorStore,
  useAuthStore,
  useAuthClient,
  useQueryCall,
  useUpdateCall
} = createReActor(agent =>
  createActor(canisterId, {
    agent
  })
)
