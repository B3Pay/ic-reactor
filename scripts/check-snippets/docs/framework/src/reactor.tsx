// `src/reactor.tsx` of React Setup's Server-Side Rendering section: the
// provider and `useReactor` hook its layout and client components import.
"use client"
import { createReactorProvider, defineReactor } from "@ic-reactor/react"
import { canisterId, idlFactory, type _SERVICE } from "../declarations/backend"

export const { ReactorProvider, useReactor } = createReactorProvider(() =>
  defineReactor<_SERVICE>({ name: "backend", idlFactory, canisterId })
)
