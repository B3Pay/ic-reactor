import {
  DisplayReactor,
  Reactor,
  type ReactorQueryParams,
} from "@ic-reactor/core"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { QueryObserver } from "@tanstack/react-query"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { idlFactory, type _SERVICE } from "../declarations/hello_actor"
import { createClientManager } from "./replica"

/** Long enough for a query to the local replica on a loaded CI runner. */
const REFETCH_TIMEOUT = { timeout: 5_000 }

describe("Query cache against the local replica", () => {
  const clientManager = createClientManager()
  const { queryClient } = clientManager
  const reactor = new Reactor<_SERVICE>({
    clientManager,
    idlFactory,
    name: "hello_actor",
  })
  const canisterId = reactor.canisterId.toText()

  beforeAll(async () => {
    await clientManager.initialize()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it("caches queries under keys rooted at the canister", async () => {
    const count = await reactor.fetchQuery({ functionName: "count" })
    expect(queryClient.getQueryData([canisterId, "count"])).toBe(count)

    const divide: ReactorQueryParams<_SERVICE, "divide"> = {
      functionName: "divide",
      args: [6n, 3n],
    }
    await expect(reactor.fetchQuery(divide)).resolves.toBe(2n)
    const divideKey = reactor.generateQueryKey(divide)
    expect(divideKey.slice(0, 2)).toEqual([canisterId, "divide"])
    expect(queryClient.getQueryData(divideKey)).toBe(2n)

    expect(
      queryClient.getQueryCache().findAll({ queryKey: [canisterId] })
    ).toHaveLength(2)
  })

  it("keeps a DisplayReactor's entry apart from a Reactor's for the same canister", async () => {
    const displayReactor = new DisplayReactor<_SERVICE>({
      clientManager,
      idlFactory,
      name: "hello_actor",
    })

    const count = await reactor.fetchQuery({ functionName: "count" })
    const displayCount = await displayReactor.fetchQuery({
      functionName: "count",
    })

    expect(typeof count).toBe("bigint")
    expect(displayCount).toMatch(/^\d+$/)
    expect(
      queryClient.getQueryCache().findAll({ queryKey: [canisterId, "count"] })
    ).toHaveLength(2)
  })

  it("refetches an observed query once an update's invalidation marks it stale", async () => {
    const params = { functionName: "count" as const }
    // An observer is what a mounted useQuery holds. Invalidation refetches
    // only queries that have one.
    const observer = new QueryObserver(
      queryClient,
      reactor.getQueryOptions(params)
    )
    const unsubscribe = observer.subscribe(() => {})

    try {
      await vi.waitFor(
        () => expect(observer.getCurrentResult().isSuccess).toBe(true),
        REFETCH_TIMEOUT
      )
      const before = observer.getCurrentResult().data
      expect(typeof before).toBe("bigint")

      const incremented = await reactor.callMethod({
        functionName: "increment",
      })
      expect(incremented).toBeGreaterThan(before!)

      // The update leaves the cache alone, and fetchQuery is cache-first.
      await expect(reactor.fetchQuery(params)).resolves.toBe(before)

      reactor.invalidateQueries(params)

      // Other test files increment the counter too, so it may be higher still.
      await vi.waitFor(
        () =>
          expect(observer.getCurrentResult().data).toBeGreaterThanOrEqual(
            incremented
          ),
        REFETCH_TIMEOUT
      )
    } finally {
      unsubscribe()
    }
    // Two waits and an update call, each of which can take seconds on CI.
  }, 15_000)

  it("invalidates a canister's queries and not another canister's", async () => {
    const params = { functionName: "count" as const }
    const isInvalidated = () =>
      queryClient.getQueryState(reactor.generateQueryKey(params))?.isInvalidated
    await reactor.fetchQuery(params)

    // The management canister: any canister but this one.
    reactor.invalidateQueries(params, { canisterId: "aaaaa-aa" })
    expect(isInvalidated()).toBe(false)

    reactor.invalidateQueries(params)
    expect(isInvalidated()).toBe(true)
  })
})

describe("Identity switch against the local replica", () => {
  const clientManager = createClientManager()
  const reactor = new Reactor<_SERVICE>({
    clientManager,
    idlFactory,
    name: "hello_actor",
  })

  beforeAll(async () => {
    await clientManager.initialize()
  })

  it("drops the previous caller's cached answer and calls as the new identity", async () => {
    const params = { functionName: "whoami" as const }
    const before = await reactor.fetchQuery(params)
    expect(before.isAnonymous()).toBe(true)

    const identity = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(identity)

    // Query keys carry no principal, so a kept entry would be served to the
    // new identity as its own answer.
    expect(reactor.getQueryData(params)).toBeUndefined()
    const after = await reactor.fetchQuery(params)
    expect(after.toText()).toBe(identity.getPrincipal().toText())
  })
})
