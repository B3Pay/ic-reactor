// The SSR guide's `@/server/request-client`: one client per server request,
// as the next-ssr example's src/server/request-client.ts.
import { createClient, type Client } from "@ic-reactor/core"
import { cache } from "react"

export const requestClient = cache((): Client =>
  createClient({ network: "ic", identity: "anonymous" })
)
