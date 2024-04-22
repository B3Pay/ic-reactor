"use client"
import { createActorContext, createReactor } from "@ic-reactor/react"
import { canisterId, idlFactory, todo } from "declarations/todo"

export const { useActorState, useQueryCall, useUpdateCall } =
  createActorContext<typeof todo>({
    idlFactory,
    canisterId
  })
