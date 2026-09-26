// The root README's query and mutation objects (Pattern B), which its later
// snippets use.
import { createMutation, createQuery } from "@ic-reactor/react"
import { backendReactor } from "./reactor"

export * from "../app/globals"

export const getProfile = createQuery(backendReactor, {
  functionName: "get_profile",
})

export const updateProfile = createMutation(backendReactor, {
  functionName: "update_profile",
  invalidateQueries: [getProfile],
})
