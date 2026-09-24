"use client"

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ClientManager } from "@ic-reactor/react"
import { AuthenticationManager } from "@ic-reactor/react"

// Ensure queryClient is initialized stably on the client
let clientQueryClient: QueryClient | null = null

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new client
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
        },
      },
    })
  } else {
    // Client: make a new client if we don't already have one
    if (!clientQueryClient) {
      clientQueryClient = new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
    }
    return clientQueryClient
  }
}

// Separate client side authentication context safely
interface AuthContextType {
  clientManager: ClientManager
  authentication: AuthenticationManager
}

const AuthContext = createContext<AuthContextType | null>(null)

export function ICReactorProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient()

  const [authContext] = useState(() => {
    const clientManager = new ClientManager({
      queryClient,
      agentOptions: { host: "https://ic0.app" },
    })
    const authentication = new AuthenticationManager({ clientManager })
    return { clientManager, authentication }
  })

  // Releases the Internet Identity client the manager built once this tree
  // unmounts. dispose() only forgets it, so StrictMode, which runs this cleanup
  // and the effect again on the same manager, leaves the next sign-in to build
  // a new one.
  useEffect(() => () => authContext.authentication.dispose(), [authContext])

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authContext}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

export function useICAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useICAuth must be used within an ICReactorProvider")
  }
  return ctx
}
