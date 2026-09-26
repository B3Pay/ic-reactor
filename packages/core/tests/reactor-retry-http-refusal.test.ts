import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { reactorRetry } from "../src/errors/index.js"

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ icrc1_name: IDL.Func([], [IDL.Text], ["query"]) })

interface Ledger {
  icrc1_name: () => Promise<string>
}

/**
 * A query answered with an HTTP error, through the whole stack: the agent's
 * own retries (`retryTimes`, 3 by default), then `reactorRetry` on the
 * QueryClient `defineReactor` creates. Every agent error without a reject code
 * was retryable, so a 400 such as an expired delegation's was sent 16 times,
 * about 20 seconds of backoff, before the query failed (#646).
 */
describe("a query refused with an HTTP error", () => {
  let queryRequests: number
  let status: number

  const createReactor = () => {
    const clientManager = new ClientManager({
      queryClient: new QueryClient({
        // defineReactor's default, without the backoff between attempts.
        defaultOptions: { queries: { retry: reactorRetry, retryDelay: 0 } },
      }),
      agentOptions: {
        host: "https://icp-api.io",
        verifyQuerySignatures: false,
        // The agent's own attempts, without its backoff between them.
        backoffStrategy: () => ({ next: () => 0 }),
        fetch: async (input: RequestInfo | URL) => {
          const url = String(input instanceof Request ? input.url : input)
          if (url.endsWith("/query")) queryRequests++
          return new Response(
            "Invalid delegation expiry: the delegation has expired",
            { status }
          )
        },
      },
    })
    return new Reactor<Ledger>({
      clientManager,
      name: "ledger",
      canisterId: CANISTER_ID,
      idlFactory,
    })
  }

  beforeEach(() => {
    queryRequests = 0
    // reactorRetry retries only in a browser.
    vi.stubGlobal("window", {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([400, 401, 403])(
    "fails a %i after the agent's own 4 attempts",
    async (refusal) => {
      status = refusal
      const reactor = createReactor()

      await expect(
        reactor.fetchQuery({ functionName: "icrc1_name" })
      ).rejects.toThrow(String(refusal))
      expect(queryRequests).toBe(4)
    }
  )

  it.each([408, 429, 503])("still retries a %i", async (retryable) => {
    status = retryable
    const reactor = createReactor()

    await expect(
      reactor.fetchQuery({ functionName: "icrc1_name" })
    ).rejects.toThrow(String(retryable))
    // 4 attempts by the agent for each of reactorRetry's 4.
    expect(queryRequests).toBe(16)
  })
})
