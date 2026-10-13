// @vitest-environment node
import { isReactorError } from "@ic-reactor/core"
import { createTestClient } from "@ic-reactor/core/testing"
import {
  CancelledError,
  hydrate,
  type DehydratedState,
  type QueryKey,
} from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { actor as icrc1Actor, type Actor as Ledger } from "./canisters/icrc1.ts"
import { ledgerReads, startLedgerReads } from "./components/home/featured.ts"
import {
  boundServerReads,
  getRouter,
  SERVER_READ_DEADLINE_MS,
  shouldDehydrateRead,
} from "./router.tsx"

const key = (name: string): QueryKey => [name]

// Any canister id: the test replica answers wherever it is mocked.
const LEDGER = "mxzaz-hqaaa-aaaar-qaada-cai"

type TestClient = ReturnType<typeof createTestClient>

/** A promise the test settles, for a canister that answers when told. */
function gate<T>(): { promise: Promise<T>; open(value: T): void } {
  let open!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

const never = <T>(): Promise<T> => new Promise<T>(() => undefined)

/** How many canister requests of `test` named `method`. */
const requestsOf = (test: TestClient, method: string): number =>
  test.requests.filter(
    (r) =>
      (r.endpoint === "query" || r.endpoint === "call") &&
      r.methodName === method
  ).length

/** An anonymous test client on "ic", the key segment the app uses. */
const anonymous = (): TestClient =>
  createTestClient({ network: "ic", signedIn: false })

afterEach(() => {
  vi.useRealTimers()
})

describe("getRouter", () => {
  it("makes one ic-reactor client per router, owning the query client", () => {
    const a = getRouter()
    const b = getRouter()
    try {
      expect(a.options.context.reactor).not.toBe(b.options.context.reactor)
      expect(a.options.context.queryClient).toBe(
        a.options.context.reactor.queryClient
      )
      expect(a.options.context.reactor.network).toBe("ic")
    } finally {
      a.options.context.reactor.dispose()
      b.options.context.reactor.dispose()
    }
  })

  it("prefetches on intent and leaves freshness to TanStack Query", () => {
    const router = getRouter()
    try {
      expect(router.options.defaultPreload).toBe("intent")
      expect(router.options.defaultPreloadStaleTime).toBe(0)
      expect(router.options.scrollRestoration).toBe(true)
      expect(router.options.defaultNotFoundComponent).toBeTypeOf("function")
      expect(router.options.defaultErrorComponent).toBeTypeOf("function")
    } finally {
      router.options.context.reactor.dispose()
    }
  })

  it("dehydrates successful reads only: never one that failed or may still fail", () => {
    const router = getRouter()
    const { queryClient } = router.options.context
    try {
      const cache = queryClient.getQueryCache()
      const ok = cache.build(queryClient, { queryKey: key("ok") })
      ok.setData(1n)
      const inFlight = cache.build(queryClient, { queryKey: key("in-flight") })
      inFlight.setState({ fetchStatus: "fetching" })
      const idle = cache.build(queryClient, { queryKey: key("idle") })
      const failed = cache.build(queryClient, { queryKey: key("failed") })
      failed.setState({ status: "error", error: new Error("rejected") })
      expect(shouldDehydrateRead(ok)).toBe(true)
      // Its promise would reach the browser as Error("redacted") if it failed.
      expect(shouldDehydrateRead(inFlight)).toBe(false)
      expect(shouldDehydrateRead(idle)).toBe(false)
      expect(shouldDehydrateRead(failed)).toBe(false)
    } finally {
      router.options.context.reactor.dispose()
    }
  })

  it("streams a read that lands after dehydration, and leaves one that fails then to the browser", async () => {
    const server = anonymous()
    const symbol = gate<string>()
    const supply = gate<void>()
    server.mock<Ledger>(icrc1Actor, LEDGER, {
      icrc1_decimals: () => 8,
      icrc1_fee: () => 10n,
      icrc1_symbol: () => symbol.promise,
      icrc1_total_supply: async () => {
        await supply.promise
        throw new Error("the ledger trapped")
      },
    })
    const router = getRouter(server.client)
    // What TanStack Start attaches to a server router for one request.
    let finishRendering: (() => void) | undefined
    Object.assign(router, {
      serverSsr: {
        onRenderFinished: (fn: () => void) => {
          finishRendering = fn
        },
      },
    })
    const reads = ledgerReads(server.client, LEDGER)
    const { queryClient } = server.client
    try {
      // The home loader: starts every read and waits for none; two of them
      // land before the router dehydrates.
      startLedgerReads(server.client, queryClient, LEDGER)
      await vi.waitFor(() => {
        expect(queryClient.getQueryState(reads.decimals.queryKey)?.status).toBe(
          "success"
        )
        expect(queryClient.getQueryState(reads.fee.queryKey)?.status).toBe(
          "success"
        )
      })
      const dehydrated = (await router.options.dehydrate?.()) as {
        query: {
          initial?: DehydratedState["queries"]
          stream: ReadableStream<DehydratedState["queries"]>
        }
      }
      const chunks = dehydrated.query.stream.getReader()
      const streamed: DehydratedState["queries"] = []
      const drained = (async () => {
        for (;;) {
          const { done, value } = await chunks.read()
          if (done) return
          streamed.push(...value)
        }
      })()

      // After dehydration: one read lands, one fails.
      symbol.open("ckBTC")
      supply.open()
      await vi.waitFor(() => {
        expect(queryClient.getQueryState(reads.symbol.queryKey)?.status).toBe(
          "success"
        )
        expect(
          queryClient.getQueryState(reads.totalSupply.queryKey)?.status
        ).toBe("error")
      })
      finishRendering?.()
      await drained

      const sent = (queries: DehydratedState["queries"]) =>
        queries.map((q) => q.queryHash).sort()
      const hashOf = (k: QueryKey) =>
        queryClient.getQueryCache().find({ queryKey: k, exact: true })
          ?.queryHash
      expect(sent(dehydrated.query.initial ?? [])).toEqual(
        [hashOf(reads.decimals.queryKey), hashOf(reads.fee.queryKey)].sort()
      )
      expect(sent(streamed)).toEqual([hashOf(reads.symbol.queryKey)])

      // The browser: everything the server sent is there without a request;
      // the failed read is its own to make, and it gets the real answer.
      const browser = anonymous()
      browser.mock<Ledger>(icrc1Actor, LEDGER, {
        icrc1_decimals: () => 8,
        icrc1_fee: () => 10n,
        icrc1_symbol: () => "ckBTC",
        icrc1_total_supply: () => 21_000_000n,
      })
      try {
        const bq = browser.client.queryClient
        hydrate(bq, {
          mutations: [],
          queries: [...(dehydrated.query.initial ?? []), ...streamed],
        })
        const own = ledgerReads(browser.client, LEDGER)
        expect(await bq.ensureQueryData(own.symbol)).toBe("ckBTC")
        expect(await bq.ensureQueryData(own.decimals)).toBe(8)
        expect(await bq.ensureQueryData(own.fee)).toBe(10n)
        expect(await bq.ensureQueryData(own.totalSupply)).toBe(21_000_000n)
        expect(requestsOf(browser, "icrc1_symbol")).toBe(0)
        expect(requestsOf(browser, "icrc1_decimals")).toBe(0)
        expect(requestsOf(browser, "icrc1_fee")).toBe(0)
        expect(requestsOf(browser, "icrc1_total_supply")).toBe(1)
      } finally {
        browser.client.dispose()
      }
    } finally {
      server.client.dispose()
    }
  })

  it("cancels a server read still in flight at SERVER_READ_DEADLINE_MS", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const server = anonymous()
    server.mock<Ledger>(icrc1Actor, LEDGER, {
      icrc1_total_supply: () => never(),
    })
    const router = getRouter(server.client)
    try {
      const read = server.client.queryClient.query(
        ledgerReads(server.client, LEDGER).totalSupply
      )
      const outcome = read.then(
        () => "answered",
        (error: unknown) => error
      )
      await vi.advanceTimersByTimeAsync(SERVER_READ_DEADLINE_MS - 1)
      const early = server.client.queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.fetchStatus)
      expect(early).toEqual(["fetching"])
      await vi.advanceTimersByTimeAsync(1)
      expect(await outcome).toBeInstanceOf(CancelledError)
    } finally {
      router.options.context.reactor.dispose()
    }
  })
})

describe("boundServerReads", () => {
  it("ends a hung read in an error, so nothing reads it again on the server", async () => {
    const server = anonymous()
    server.mock<Ledger>(icrc1Actor, LEDGER, {
      icrc1_total_supply: () => never(),
    })
    const { queryClient } = server.client
    const stop = boundServerReads(queryClient, 50)
    try {
      const options = ledgerReads(server.client, LEDGER).totalSupply
      await expect(queryClient.query(options)).rejects.toBeInstanceOf(
        CancelledError
      )
      const state = queryClient.getQueryState(options.queryKey)
      // Not reverted to "pending": a suspended section's next server render
      // throws this error instead of starting the same read again.
      expect(state?.status).toBe("error")
      expect(state?.fetchStatus).toBe("idle")
      expect(isReactorError(state?.error)).toBe(false)
      expect(
        shouldDehydrateRead(queryClient.getQueryCache().getAll()[0]!)
      ).toBe(false)
      await vi.waitFor(() => {
        expect(requestsOf(server, "icrc1_total_supply")).toBe(1)
      })
    } finally {
      stop()
      server.client.dispose()
    }
  })

  it("leaves a read that settles in time alone", async () => {
    const server = anonymous()
    server.mock<Ledger>(icrc1Actor, LEDGER, { icrc1_fee: () => 10n })
    const { queryClient } = server.client
    const stop = boundServerReads(queryClient, 60_000)
    try {
      const options = ledgerReads(server.client, LEDGER).fee
      expect(await queryClient.query(options)).toBe(10n)
      expect(queryClient.getQueryState(options.queryKey)?.status).toBe(
        "success"
      )
    } finally {
      stop()
      server.client.dispose()
    }
  })
})
