import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QueryCache, QueryClient, onlineManager } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createQuery } from "../src/createQuery.js"
import { createSuspenseQuery } from "../src/createSuspenseQuery.js"
import { createInfiniteQuery } from "../src/createInfiniteQuery.js"
import { createSuspenseInfiniteQuery } from "../src/createSuspenseInfiniteQuery.js"

/**
 * A query object serves one read two ways: `useQuery()` inside React, and
 * `fetch()` / `prefetch()` for loaders, actions and scripts. The hook passed
 * the whole config to TanStack Query; the imperative path passed only the key
 * and query function. So the options that say how the query function runs
 * applied to one path and not the other:
 *
 * - `networkMode: "always"`, which a local replica reached while the browser
 *   reports itself offline needs, made the hook fetch and left `fetch()`
 *   paused, a loader that never resolved;
 * - `retry` retried in the hook and not in `fetch()`, so a loader failed on
 *   the first transient error the component would have retried through;
 * - `meta`, which global QueryCache callbacks read, was missing from failures
 *   raised through `fetch()`.
 */

interface FeedActor {
  greet: ActorMethod<[string], string>
  get_page: ActorMethod<[number], { items: string[]; next: [] | [number] }>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    get_page: IDL.Func(
      [IDL.Nat32],
      [IDL.Record({ items: IDL.Vec(IDL.Text), next: IDL.Opt(IDL.Nat32) })],
      ["query"]
    ),
  })

/** Resolve with "timed out" if `promise` has not settled within 200 ms. */
const within = <T>(promise: Promise<T>) =>
  Promise.race([
    promise,
    new Promise<"timed out">((resolve) =>
      setTimeout(() => resolve("timed out"), 200)
    ),
  ])

describe("factory fetch() and prefetch() honour the config's fetch options", () => {
  let queryClient: QueryClient
  let reactor: Reactor<FeedActor>
  let callMethod: ReturnType<typeof vi.spyOn>
  let failuresLeft: number
  const cacheErrors: unknown[] = []

  beforeEach(() => {
    cacheErrors.length = 0
    queryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (_error, query) => cacheErrors.push(query.meta),
      }),
    })
    reactor = new Reactor<FeedActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "feed",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    failuresLeft = 0
    callMethod = vi.spyOn(reactor, "callMethod").mockImplementation((async ({
      functionName,
      args,
    }: {
      functionName: string
      args: [unknown]
    }) => {
      if (failuresLeft > 0) {
        failuresLeft--
        throw new Error("boundary node timeout")
      }
      return functionName === "greet"
        ? `hello ${args[0]}`
        : { items: [`item ${args[0]}`], next: [] }
    }) as never)
  })

  afterEach(() => onlineManager.setOnline(true))

  const infinite = {
    functionName: "get_page",
    initialPageParam: 0,
    getArgs: (page: number): [number] => [page],
    getNextPageParam: (last: { next: [] | [number] }) => last.next[0],
  } as const

  describe("networkMode", () => {
    beforeEach(() => onlineManager.setOnline(false))

    it("createQuery().fetch() runs offline with networkMode: always", async () => {
      const query = createQuery(reactor, {
        functionName: "greet",
        args: ["alice"],
        networkMode: "always",
      })
      await expect(within(query.fetch())).resolves.toBe("hello alice")
    })

    it("createQuery().prefetch() runs offline with networkMode: always", async () => {
      const query = createQuery(reactor, {
        functionName: "greet",
        args: ["bob"],
        networkMode: "always",
      })
      await within(query.prefetch())
      expect(query.getCacheData()).toBe("hello bob")
    })

    it("createSuspenseQuery().fetch() runs offline with networkMode: always", async () => {
      const query = createSuspenseQuery(reactor, {
        functionName: "greet",
        args: ["carol"],
        networkMode: "always",
      })
      await expect(within(query.fetch())).resolves.toBe("hello carol")
    })

    it("createInfiniteQuery().fetch() runs offline with networkMode: always", async () => {
      const query = createInfiniteQuery(reactor, {
        ...infinite,
        networkMode: "always",
      })
      const result = await within(query.fetch())
      expect(result).toMatchObject({ pages: [{ items: ["item 0"] }] })
    })

    it("createSuspenseInfiniteQuery().fetch() runs offline with networkMode: always", async () => {
      const query = createSuspenseInfiniteQuery(reactor, {
        ...infinite,
        networkMode: "always",
      })
      const result = await within(query.fetch())
      expect(result).toMatchObject({ pages: [{ items: ["item 0"] }] })
    })
  })

  describe("retry", () => {
    it("createQuery().fetch() retries as configured", async () => {
      failuresLeft = 2
      const query = createQuery(reactor, {
        functionName: "greet",
        args: ["dave"],
        retry: 2,
        retryDelay: 1,
      })
      await expect(query.fetch()).resolves.toBe("hello dave")
      expect(callMethod).toHaveBeenCalledTimes(3)
    })

    it("createSuspenseQuery().fetch() retries as configured", async () => {
      failuresLeft = 1
      const query = createSuspenseQuery(reactor, {
        functionName: "greet",
        args: ["erin"],
        retry: 1,
        retryDelay: 1,
      })
      await expect(query.fetch()).resolves.toBe("hello erin")
    })

    it("createInfiniteQuery().fetch() retries as configured", async () => {
      failuresLeft = 1
      const query = createInfiniteQuery(reactor, {
        ...infinite,
        retry: 1,
        retryDelay: 1,
      })
      await expect(query.fetch()).resolves.toMatchObject({
        pages: [{ items: ["item 0"] }],
      })
    })

    it("createSuspenseInfiniteQuery().fetch() retries as configured", async () => {
      failuresLeft = 1
      const query = createSuspenseInfiniteQuery(reactor, {
        ...infinite,
        retry: 1,
        retryDelay: 1,
      })
      await expect(query.fetch()).resolves.toMatchObject({
        pages: [{ items: ["item 0"] }],
      })
    })

    it("keeps the QueryClient's own retry default when the config sets none", async () => {
      queryClient.setDefaultOptions({
        queries: { retry: 1, retryDelay: 1 },
      })
      failuresLeft = 1
      const query = createQuery(reactor, {
        functionName: "greet",
        args: ["frank"],
      })
      await expect(query.fetch()).resolves.toBe("hello frank")
    })
  })

  it("still fetches through reactor.fetchQuery, which a subclass may override", async () => {
    // Reactor.mdx documents overriding `fetchQuery` in a subclass to add logic
    // to every factory fetch, so the options must travel through it rather
    // than around it.
    const fetchQuery = vi.spyOn(reactor, "fetchQuery")
    const query = createQuery(reactor, {
      functionName: "greet",
      args: ["hana"],
      retry: 1,
    })

    await query.fetch()

    expect(fetchQuery).toHaveBeenCalledTimes(1)
    expect(fetchQuery.mock.calls[0][0]).toMatchObject({
      functionName: "greet",
      args: ["hana"],
    })
  })

  it("attaches the config's meta to a failure raised through fetch()", async () => {
    failuresLeft = 1
    const query = createQuery(reactor, {
      functionName: "greet",
      args: ["gina"],
      meta: { errorMessage: "Could not load the greeting" },
    })

    await expect(query.fetch()).rejects.toThrow("boundary node timeout")

    expect(cacheErrors).toEqual([
      { errorMessage: "Could not load the greeting" },
    ])
  })
})
