// Scenario 7: GET /api/balance/<ledger>/<principal>, answered as JSON by a
// handler that builds a client for each request (src/server/balance-route.ts).
// It reads the request's parameters, so Next runs it per request, never at
// build time.
import { createClient } from "@ic-reactor/core"
import { balanceRoute } from "@/server/balance-route"

export const GET = balanceRoute(() =>
  createClient({ network: "ic", identity: "anonymous" })
)
