"use client"

// Who the tab calls as, in the header. `useAuth()` is "anonymous" in the
// server render and in the browser's first render (the server snapshot), so
// a signed-in tab shows "anonymous" in its HTML and switches right after
// hydration.
import { useAuth } from "@ic-reactor/react"

export function SessionBadge() {
  const { status, principal } = useAuth()
  return (
    <span className="pill" data-status={status} title={principal}>
      {status === "signed-in"
        ? `signed in: ${principal.slice(0, 5)}…${principal.slice(-3)}`
        : status}
    </span>
  )
}
