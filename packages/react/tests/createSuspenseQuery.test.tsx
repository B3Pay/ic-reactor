import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React, { Suspense } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor } from "@ic-reactor/core"
import {
  createSuspenseQuery,
  createSuspenseQueryFactory,
} from "../src/createSuspenseQuery"

// Define Actor Interface
interface User {
  name: string
  age: bigint
}

interface Item {
  id: string
  value: bigint
}

// Actor type with methods
interface TestActor {
  get_user: ActorMethod<[], User>
  get_item: ActorMethod<[string], [] | [Item]>
  list_items: ActorMethod<[], string[]>
}

// Mock data
const mockUser: User = { name: "Alice", age: 30n }
const mockItem: Item = { id: "item-1", value: 100n }
const mockItems = ["item-1", "item-2", "item-3"]

// Mock Reactor
const createMockReactor = (queryClient: QueryClient) => {
  const callMethod = vi
    .fn()
    .mockImplementation(async ({ functionName, args }) => {
      if (functionName === "get_user") {
        return mockUser
      }
      if (functionName === "get_item") {
        const id = args[0]
        if (id === "item-1") return [mockItem]
        return []
      }
      if (functionName === "list_items") {
        return mockItems
      }
      return null
    })

  return {
    queryClient,
    callMethod,
    canisterId: "test-canister",
    generateQueryKey: vi
      .fn()
      .mockImplementation(({ functionName, args }) => [
        "test-canister",
        functionName,
        ...(args ? [JSON.stringify(args)] : []),
      ]),
    getQueryOptions: vi.fn().mockImplementation(({ functionName, args }) => ({
      queryKey: [
        "test-canister",
        functionName,
        ...(args ? [JSON.stringify(args)] : []),
      ],
      queryFn: async () => callMethod({ functionName, args }),
    })),
    fetchQuery: vi.fn().mockImplementation(async ({ functionName, args }) => {
      const key = [
        "test-canister",
        functionName,
        ...(args ? [JSON.stringify(args)] : []),
      ]
      const data = await callMethod({ functionName, args })
      queryClient.setQueryData(key, data)
      return data
    }),
    getQueryData: vi.fn().mockImplementation(({ functionName, args }) => {
      const key = [
        "test-canister",
        functionName,
        ...(args ? [JSON.stringify(args)] : []),
      ]
      return queryClient.getQueryData(key)
    }),
  } as unknown as Reactor<TestActor>
}

describe("createSuspenseQuery", () => {
  let queryClient: QueryClient
  let mockReactor: ReturnType<typeof createMockReactor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    mockReactor = createMockReactor(queryClient)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </QueryClientProvider>
  )

  describe("basic functionality", () => {
    it("should create a suspense query with required methods", () => {
      const userQuery = createSuspenseQuery(mockReactor, {
        functionName: "get_user",
      })

      expect(userQuery).toBeDefined()
      expect(userQuery.fetch).toBeInstanceOf(Function)
      expect(userQuery.useSuspenseQuery).toBeInstanceOf(Function)
      expect(userQuery.refetch).toBeInstanceOf(Function)
      expect(userQuery.getQueryKey).toBeInstanceOf(Function)
    })

    it("should return correct query key", () => {
      const userQuery = createSuspenseQuery(mockReactor, {
        functionName: "get_user",
      })

      const queryKey = userQuery.getQueryKey()
      expect(queryKey).toContain("test-canister")
      expect(queryKey).toContain("get_user")
    })
  })

  describe("fetch function", () => {
    it("should fetch data correctly", async () => {
      const userQuery = createSuspenseQuery(mockReactor, {
        functionName: "get_user",
      })

      const result = await userQuery.fetch()
      expect(result).toEqual(mockUser)
    })

    it("should apply select transform when fetching", async () => {
      const userNameQuery = createSuspenseQuery(mockReactor, {
        functionName: "get_user",
        select: (user) => user.name,
      })

      const result = await userNameQuery.fetch()
      expect(result).toBe("Alice")
    })
  })

  describe("useQuery hook", () => {
    it("should use suspense query hook correctly", async () => {
      const userQuery = createSuspenseQuery(mockReactor, {
        functionName: "get_user",
      })

      const { result } = renderHook(() => userQuery.useSuspenseQuery(), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockUser)
    })

    it("should apply select transform in useQuery", async () => {
      const userNameQuery = createSuspenseQuery(mockReactor, {
        functionName: "get_user",
        select: (user) => user.name,
      })

      const { result } = renderHook(() => userNameQuery.useSuspenseQuery(), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBe("Alice")
    })
  })

  describe("getCacheData", () => {
    it("should return undefined if no cache", () => {
      const userQuery = createSuspenseQuery(mockReactor, {
        functionName: "get_user",
      })

      expect(userQuery.getCacheData()).toBeUndefined()
    })

    it("should return cached data after fetch", async () => {
      const userQuery = createSuspenseQuery(mockReactor, {
        functionName: "get_user",
      })

      await userQuery.fetch()

      expect(userQuery.getCacheData()).toEqual(mockUser)
    })
  })
})

describe("createSuspenseQueryFactory", () => {
  let queryClient: QueryClient
  let mockReactor: ReturnType<typeof createMockReactor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    mockReactor = createMockReactor(queryClient)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </QueryClientProvider>
  )

  it("should create a factory function", () => {
    const getItem = createSuspenseQueryFactory(mockReactor, {
      functionName: "get_item",
    })

    expect(getItem).toBeInstanceOf(Function)

    const itemQuery = getItem(["item-1"])
    expect(itemQuery).toBeDefined()
  })

  it("should fetch data with dynamic args", async () => {
    const getItemSuspense = createSuspenseQueryFactory(mockReactor, {
      functionName: "get_item",
    })

    const itemQuery = getItemSuspense(["item-1"])
    const result = await itemQuery.fetch()
    expect(result).toEqual([mockItem])
  })
})
