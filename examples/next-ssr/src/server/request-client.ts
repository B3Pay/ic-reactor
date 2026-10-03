// Scenario 1: one client per request on the server.
//
// Rule: a server builds its client inside the request, never at module scope.
// A client owns a cache and the agents it calls with, and query keys carry
// the caller but not the visitor: a client in this module's scope would be
// shared by every request the server ever handles.
//
// React's `cache()` memoizes for the length of one server request: the page
// and every Server Component it renders (the streamed section of /account
// included) get the same client, and the next request gets a new one
// (./request-client.rsc.test.tsx renders /account as Next does to check
// both). Outside a request, in a script or a plain test, every call builds a
// new client. The
// client is anonymous (`identity: "anonymous"`): a server holds no session, and
// a read-only client refuses every update before sending it. There is nothing
// to dispose afterwards: it built no auth, and a server's `QueryClient` sets no
// timers, so the client is garbage once the request is done.
import { createClient, type Client } from "@ic-reactor/core"
import { cache } from "react"

/** This request's client: the same one for every caller within a request. */
export const requestClient = cache((): Client =>
  createClient({ network: "ic", identity: "anonymous" })
)
