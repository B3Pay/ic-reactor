"use client"

// Scenario 2: the `ReactorProvider` factory, in a 'use client' module.
//
// Rules:
// - One client per browser tab, or per request on a server. The root layout,
//   a Server Component, renders <Providers> around every page; it cannot hand
//   `ReactorProvider` its `client` prop itself (a function does not cross
//   from a Server Component to a client one), so this client module does.
// - The provider calls the factory once per mounted tree: once per request in
//   the server render, and once in the browser tab, where it lives across
//   client-side navigations (the layout stays mounted) and is disposed if the
//   tree ever unmounts.
// - `auth: (network) => new AuthClient(network)` (`@icp-sdk/auth` 10) is
//   called only in a browser, on first use, with the client's network (on
//   "ic", mainnet's agent options and no identity provider, so mainnet's
//   Internet Identity). In the server render the client never builds it
//   and calls as the anonymous principal, 2vxsx-fae, which is also who the
//   server's own request client (src/server/request-client.ts) prefetched
//   as. So the keys the server dehydrated are the keys the browser asks for
//   while the page hydrates, signed in or not, and the cards render from them
//   with nothing fetched (`SERVER_DATA` in src/components/server-data.ts
//   keeps them fresh meanwhile).
// - `useAuth()` is "anonymous" in the server render and while the page
//   hydrates, whatever session the browser holds, so the HTML the server
//   wrote and the hydrating markup agree. `useClient()` builds keys for that
//   same anonymous caller there. An `AuthClient` reads a stored session
//   synchronously, so a tab that is still signed in from an earlier visit
//   knows the user before it hydrates; its hydrating render still builds the
//   anonymous keys the server filled, matches the server's HTML, and sends
//   nothing. Right after it, React renders each component that calls
//   `useClient()` or `useAuth()` again with the session, and each card reads
//   its own keys once, as the user (scenario 10, tested in
//   src/components/hydration.test.tsx).
// - The cost of that move: a Suspense boundary that has not hydrated yet (its
//   streamed HTML or its lazy code still on the way) below a component that
//   calls `useClient()` or `useAuth()` is rendered on the client. This app
//   has none: its streamed section (src/app/account/CertifiedBalances.tsx)
//   sits in a Server Component, and the client components above it, this
//   provider included, never render with the caller. Keep a boundary there,
//   or pass it as `children` to a component that does.
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
