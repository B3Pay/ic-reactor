"use client"

/**
 * The client-side IC Reactor setup, built once per mounted tree.
 *
 * `createReactorProvider` runs the factory in a `useState` initializer, and a
 * server render is a tree of its own, so every request builds its own
 * QueryClient, ClientManager, ledger reactor and AuthenticationManager: no
 * cache or identity is shared between visitors. The browser builds its own set
 * to hydrate the server's HTML, and the provider releases the Internet Identity
 * client when the tree unmounts.
 *
 * `useLedger()` returns what the factory built, typed as its return value, so
 * `useActorQuery` and `useAuth` come off it with their own signatures.
 */
import { QueryClient } from "@tanstack/react-query"
import {
  createReactorProvider,
  defineReactor,
  reactorRetry,
} from "@ic-reactor/react"
import { idlFactory, canisterId } from "../declarations/ledger"
import type { _SERVICE } from "../declarations/ledger"

export const { ReactorProvider: ICReactorProvider, useReactor: useLedger } =
  createReactorProvider(() =>
    defineReactor<_SERVICE>({
      name: "ledger",
      idlFactory,
      canisterId,
      agentOptions: { host: "https://ic0.app" },
      queryClient: new QueryClient({
        defaultOptions: {
          queries: {
            // Ledger metadata rarely changes: switching back to a token or
            // refocusing the window within a minute does not fetch it again.
            staleTime: 60 * 1000,
            retry: reactorRetry,
          },
        },
      }),
    })
  )
