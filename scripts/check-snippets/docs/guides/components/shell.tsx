"use client"

// The SSR guide's `@/components/shell`: the same component the guide shows as
// src/components/shell.tsx. Keep the two in step.
import { useAuth } from "@ic-reactor/react"
import type { ReactNode } from "react"

export function Shell({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  return <div data-status={status}>{children}</div>
}
