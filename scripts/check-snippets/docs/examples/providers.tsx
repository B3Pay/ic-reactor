// `./providers` of the nextjs-app-router demo: the `src/app/providers.tsx` its
// first example shows.
import { QueryClient } from "@tanstack/react-query"
import {
  createReactorProvider,
  defineReactor,
  reactorRetry,
} from "@ic-reactor/react"
import { idlFactory, canisterId } from "./declarations/ledger"
import type { _SERVICE } from "./declarations/ledger"

export const { ReactorProvider: ICReactorProvider, useReactor: useLedger } =
  createReactorProvider(() =>
    defineReactor<_SERVICE>({
      name: "ledger",
      idlFactory,
      canisterId,
      agentOptions: { host: "https://ic0.app" },
      queryClient: new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, retry: reactorRetry },
        },
      }),
    })
  )
