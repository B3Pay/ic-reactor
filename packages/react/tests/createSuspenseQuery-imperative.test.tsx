import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor, CanisterError } from "@ic-reactor/core"
import {
  createSuspenseQuery,
  createSuspenseQueryFactory,
} from "../src/createSuspenseQuery.js"

// The suspense factory's imperative surface was previously only
// existence-checked (`expect(q.invalidate).toBeInstanceOf(Function)`), never
// called. These tests drive prefetch/setData/invalidate for real. Assertions
// read through the cache and the imperative getters rather than a rendered
// hook: `setQueryData` under a mounted `useSyncExternalStore` does not
// re-render inside the act environment (a known harness artifact, see the
// audit tracking issue), so rendered state would be the wrong oracle anyway.

interface User {
  name: string
  age: bigint
}

interface TestActor {
  get_user: ActorMethod<[], User>
  get_item: ActorMethod<[string], [] | [{ id: string }]>
}

const mockUser: User = { name: "Alice", age: 30n }

const createMockReactor = (
  queryClient: QueryClient,
  callMethod: (params: unknown) => Promise<unknown>
) => {
  const keyFor = ({ functionName, args, queryKey }: any) => [
    "test-canister",
    functionName,
    ...(args ? [JSON.stringify(args)] : []),
    ...(queryKey ?? []),
  ]

  return {
    queryClient,
    callMethod,
    canisterId: "test-canister",
    generateQueryKey: vi.fn().mockImplementation(keyFor),
    getQueryOptions: vi.fn().mockImplementation((params: any) => ({
      queryKey: keyFor(params),
      queryFn: async () => callMethod(params),
    })),
    fetchQuery: vi.fn().mockImplementation(async (params: any) => {
      const data = await callMethod(params)
      queryClient.setQueryData(keyFor(params), data)
      return data
    }),
    getQueryData: vi
      .fn()
      .mockImplementation((params: any) =>
        queryClient.getQueryData(keyFor(params))
      ),
  } as unknown as Reactor<TestActor>
}

describe("createSuspenseQuery imperative surface", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  describe("prefetch", () => {
    it("warms the cache under the query's own key", async () => {
      const callMethod = vi.fn().mockResolvedValue(mockUser)
      const reactor = createMockReactor(queryClient, callMethod)
      const userQuery = createSuspenseQuery(reactor, {
        functionName: "get_user",
      })

      expect(userQuery.getCacheData()).toBeUndefined()

      await userQuery.prefetch()

      expect(callMethod).toHaveBeenCalledTimes(1)
      expect(queryClient.getQueryData(userQuery.getQueryKey())).toEqual(
        mockUser
      )
      expect(userQuery.getCacheData()).toEqual(mockUser)
    })

    it("does not refetch while the cached data is still fresh", async () => {
      const callMethod = vi.fn().mockResolvedValue(mockUser)
      const reactor = createMockReactor(queryClient, callMethod)
      const userQuery = createSuspenseQuery(reactor, {
        functionName: "get_user",
      })

      await userQuery.prefetch()
      await userQuery.prefetch()

      // The factory's default staleTime (5 minutes) makes the second prefetch
      // a cache hit rather than a second canister call.
      expect(callMethod).toHaveBeenCalledTimes(1)
    })

    it("resolves instead of rejecting when the call fails, leaving no cache entry", async () => {
      const canisterError = new CanisterError({ NotFound: null })
      const callMethod = vi.fn().mockRejectedValue(canisterError)
      const reactor = createMockReactor(queryClient, callMethod)
      const userQuery = createSuspenseQuery(reactor, {
        functionName: "get_user",
      })

      await expect(userQuery.prefetch()).resolves.toBeUndefined()

      expect(callMethod).toHaveBeenCalledTimes(1)
      expect(userQuery.getCacheData()).toBeUndefined()
    })
  })

  describe("setData", () => {
    it("writes through to the cache under the query's key", () => {
      const callMethod = vi.fn().mockResolvedValue(mockUser)
      const reactor = createMockReactor(queryClient, callMethod)
      const userQuery = createSuspenseQuery(reactor, {
        functionName: "get_user",
      })

      const written = userQuery.setData({ name: "Bob", age: 40n })

      expect(written).toEqual({ name: "Bob", age: 40n })
      expect(queryClient.getQueryData(userQuery.getQueryKey())).toEqual({
        name: "Bob",
        age: 40n,
      })
      expect(userQuery.getCacheData()).toEqual({ name: "Bob", age: 40n })
      // No canister call is involved in a direct cache write.
      expect(callMethod).not.toHaveBeenCalled()
    })

    it("supports the updater-function form", () => {
      const callMethod = vi.fn().mockResolvedValue(mockUser)
      const reactor = createMockReactor(queryClient, callMethod)
      const userQuery = createSuspenseQuery(reactor, {
        functionName: "get_user",
      })

      userQuery.setData(mockUser)
      const updated = userQuery.setData((old) =>
        old ? { ...old, name: "Carol" } : old
      )

      expect(updated).toEqual({ name: "Carol", age: 30n })
      expect(userQuery.getCacheData()).toEqual({ name: "Carol", age: 30n })
    })

    it("takes raw data while getCacheData returns the selected shape", () => {
      const callMethod = vi.fn().mockResolvedValue(mockUser)
      const reactor = createMockReactor(queryClient, callMethod)
      const userNameQuery = createSuspenseQuery(reactor, {
        functionName: "get_user",
        select: (user) => user.name,
      })

      // setData writes pre-select data; every read path applies the select.
      userNameQuery.setData(mockUser)

      expect(userNameQuery.getCacheData()).toBe("Alice")
      expect(queryClient.getQueryData(userNameQuery.getQueryKey())).toEqual(
        mockUser
      )
    })
  })

  describe("invalidate", () => {
    it("marks the query's cache entry invalidated", async () => {
      const callMethod = vi.fn().mockResolvedValue(mockUser)
      const reactor = createMockReactor(queryClient, callMethod)
      const userQuery = createSuspenseQuery(reactor, {
        functionName: "get_user",
      })

      await userQuery.fetch()
      const key = userQuery.getQueryKey()
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false)

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
      await userQuery.invalidate()

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: key })
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    })

    it("leaves unrelated cache entries alone", async () => {
      const callMethod = vi.fn().mockResolvedValue(mockUser)
      const reactor = createMockReactor(queryClient, callMethod)
      const userQuery = createSuspenseQuery(reactor, {
        functionName: "get_user",
      })

      queryClient.setQueryData(["unrelated", "a"], "A")
      await userQuery.fetch()
      await userQuery.invalidate()

      expect(queryClient.getQueryState(["unrelated", "a"])?.isInvalidated).toBe(
        false
      )
    })
  })

  describe("factory-produced queries expose the same working surface", () => {
    it("prefetch, setData and invalidate all operate on the args-scoped key", async () => {
      const item = [{ id: "item-1" }]
      const callMethod = vi.fn().mockResolvedValue(item)
      const reactor = createMockReactor(queryClient, callMethod)
      const getItem = createSuspenseQueryFactory(reactor, {
        functionName: "get_item",
      })
      const itemQuery = getItem(["item-1"])
      const key = itemQuery.getQueryKey()

      await itemQuery.prefetch()
      expect(callMethod).toHaveBeenCalledTimes(1)
      expect(itemQuery.getCacheData()).toEqual(item)

      const replacement = [{ id: "item-1-edited" }] as [] | [{ id: string }]
      itemQuery.setData(replacement)
      expect(queryClient.getQueryData(key)).toEqual(replacement)

      await itemQuery.invalidate()
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    })
  })
})
