// Scenario 1: one client per request, as Next runs Server Components.
//
// This file runs in vitest's "react-server" project (vitest.config.ts): `react`
// is React's server build, and the real /account page is rendered by React's
// Flight server (`react-server-dom-turbopack`, the renderer behind Next's
// default bundler) into the payload Next sends for a request. So React's
// `cache()` in src/server/request-client.ts memoizes exactly as it does in a
// Next request, which no renderer of HTML does.
//
// `createClient` is replaced by a test client over the mocked ledgers, so the
// test counts the clients a request builds and reads which client served
// which read. `next/form` and `next/link` are client components; without
// Next's bundler they would run here as server code, so they are plain
// elements.
import type { ClientOptions } from "@ic-reactor/core"
import type { ComponentProps } from "react"
import { renderToReadableStream } from "react-server-dom-turbopack/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LEDGERS, SAMPLE_OWNER } from "@/ledgers"
import { requestsFor, type MockLedgers } from "@/testing/mock-ledgers"
import AccountPage from "@/app/account/page"

const built = vi.hoisted(() => ({
  /** Every test client `createClient` returned, in order, with its options. */
  clients: [] as { options: unknown; test: MockLedgers }[],
}))

vi.mock("@ic-reactor/core", async (importOriginal) => {
  const real = await importOriginal<typeof import("@ic-reactor/core")>()
  const { mockLedgers } = await import("@/testing/mock-ledgers")
  return {
    ...real,
    createClient: (options: ClientOptions) => {
      const test = mockLedgers()
      built.clients.push({ options, test })
      return test.client
    },
  }
})
vi.mock("next/form", () => ({
  default: (props: ComponentProps<"form">) => <form {...props} />,
}))
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}))

afterEach(() => {
  for (const { test } of built.clients.splice(0)) test.client.dispose()
})

/** Renders /account?owner=... as one request, to the end of its payload. */
async function request(owner: string): Promise<string> {
  const errors: unknown[] = []
  const stream = renderToReadableStream(
    <AccountPage searchParams={Promise.resolve({ owner })} />,
    {},
    { onError: (error) => void errors.push(error) }
  )
  const payload = await new Response(stream).text()
  expect(errors).toEqual([])
  return payload
}

const endpointsOf = (test: MockLedgers, method: string) =>
  requestsFor(test, method).map(({ endpoint }) => endpoint)

describe("requestClient() in a server request", () => {
  it("gives the page and the section it streams one anonymous mainnet client", async () => {
    const payload = await request(SAMPLE_OWNER)

    // Both sections rendered...
    expect(payload).toContain('"data-section":"balances"')
    expect(payload).toContain('"data-section":"certified"')
    // ...from one client, built once for the request.
    expect(built.clients).toHaveLength(1)
    const [{ options, test }] = built.clients as [(typeof built.clients)[0]]
    expect(options).toEqual({ network: "ic", identity: "anonymous" })
    // Its replica answered the page's queries and the streamed section's
    // replicated calls. The two share no read: a certified canister's keys
    // are its own, so the section reads `icrc1_decimals` again, certified.
    expect(endpointsOf(test, "icrc1_balance_of").sort()).toEqual([
      ...LEDGERS.map(() => "call"),
      ...LEDGERS.map(() => "query"),
    ])
    expect(endpointsOf(test, "icrc1_decimals").sort()).toEqual([
      ...LEDGERS.map(() => "call"),
      ...LEDGERS.map(() => "query"),
    ])
  })

  it("builds a new client, with a cache of its own, for the next request", async () => {
    await request(SAMPLE_OWNER)
    await request(SAMPLE_OWNER)

    expect(built.clients).toHaveLength(2)
    const [first, second] = built.clients as [
      (typeof built.clients)[0],
      (typeof built.clients)[0],
    ]
    expect(second.test.client).not.toBe(first.test.client)
    expect(second.test.client.queryClient).not.toBe(
      first.test.client.queryClient
    )
    // The second request read everything itself: nothing came from the
    // first request's cache.
    expect(requestsFor(second.test, "icrc1_balance_of")).toHaveLength(
      LEDGERS.length * 2
    )
  })
})
