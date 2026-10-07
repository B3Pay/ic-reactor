"use client"

// The SSR guide's `@/app/providers`: the provider factory in a client module,
// as the next-ssr example's src/app/providers.tsx.
import { createClient } from "@ic-reactor/core"
import { ReactorProvider } from "@ic-reactor/react"
import { AuthClient } from "@icp-sdk/auth/client"
import type { ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ReactorProvider
      client={() =>
        createClient({
          network: "ic",
          auth: (network) => new AuthClient(network),
        })
      }
    >
      {children}
    </ReactorProvider>
  )
}
