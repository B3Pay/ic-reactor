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
// - `auth: () => new AuthClient()` (`@icp-sdk/auth` 10) is called only in a
//   browser, on first use. In the server render the client never builds it
//   and calls as the anonymous principal, 2vxsx-fae, which is also who the
//   server's own request client (src/server/request-client.ts) prefetched
//   as. So for a visitor who is not signed in, the keys the server dehydrated
//   are the keys the browser's first render asks for, and the cards render
//   from them with nothing fetched (`SERVER_DATA` in
//   src/components/server-data.ts keeps them fresh meanwhile).
// - `useAuth()` is "anonymous" in the server render and in the browser's
//   hydrating first render, whatever session the browser holds, so the HTML
//   the server wrote and the markup of that first render agree. A signed-in
//   browser renders again with its session right after hydration.
// - Query keys follow the client's caller, not `useAuth()`. An `AuthClient`
//   reads a stored session synchronously, so a tab that is still signed in
//   from an earlier visit calls as the user from its first render: its keys
//   are not the anonymous ones the server filled, the cards have nothing to
//   show yet, React reports a hydration mismatch and the tab reads them again
//   as the user. The README says more; this example does not work around it.
import { createClient } from "@ic-reactor/core"
import { ReactorProvider } from "@ic-reactor/react"
import { AuthClient } from "@icp-sdk/auth/client"
import type { ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ReactorProvider
      client={() =>
        createClient({ network: "ic", auth: () => new AuthClient() })
      }
    >
      {children}
    </ReactorProvider>
  )
}
