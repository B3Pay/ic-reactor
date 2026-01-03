import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React, { Suspense } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useActorSuspenseInfiniteQuery } from "./useActorSuspenseInfiniteQuery"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor } from "@ic-reactor/core"

// Define a test actor type with paginated methods
type TestActor = {
  getPosts: ActorMethod<[{ page: number; limit: number }], string[]>
  getItems: ActorMethod<
    [number],
    { items: string[]; nextCursor: number | null }
  >
  getMessages: ActorMethod<
    [string],
    { messages: string[]; nextToken: string | null }
  >
}

// Mock data generators
const generatePosts = (page: number, limit: number): string[] => {
  const start = (page - 1) * limit
  return Array.from({ length: limit }, (_, i) => `Post ${start + i + 1}`)
}

const generateItems = (
  cursor: number
): { items: string[]; nextCursor: number | null } => {
  if (cursor >= 50) {
    return { items: [], nextCursor: null }
  }
  const items = Array.from({ length: 10 }, (_, i) => `Item ${cursor + i + 1}`)
  return { items, nextCursor: cursor + 10 }
}

// Mock Reactor
const createMockReactor = (queryClient: QueryClient) => {
  const callMethod = vi
    .fn()
    .mockImplementation(async ({ functionName, args }) => {
      if (functionName === "getPosts") {
        const { page, limit } = args[0]
        return generatePosts(page, limit)
      }
      if (functionName === "getItems") {
        const cursor = args[0]
        return generateItems(cursor)
      }
      if (functionName === "getMessages") {
        const token = args[0]
        const pageNum = token === "start" ? 0 : parseInt(token, 10)
        const messages = Array.from(
          { length: 5 },
          (_, i) => `Message ${pageNum * 5 + i + 1}`
        )
        const nextToken = pageNum < 3 ? String(pageNum + 1) : null
        return { messages, nextToken }
      }
      return null
    })

  // Mock ensureInfiniteQueryData for suspense behavior if needed,
  // but useSuspenseInfiniteQuery handles its own suspense mechanism via options.
  // We just need to make sure callMethod returns a promise.

  return {
    queryClient,
    callMethod,
    generateQueryKey: vi
      .fn()
      .mockImplementation(({ functionName, args }) => [
        "test-canister",
        functionName,
        ...(args ? [JSON.stringify(args)] : []),
      ]),
  } as unknown as Reactor<TestActor>
}

describe("useActorSuspenseInfiniteQuery", () => {
  let queryClient: QueryClient
  let mockReactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
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
    it("should fetch initial page", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery({
            reactor: mockReactor,
            functionName: "getPosts",
            initialPageParam: 1,
            getArgs: (page) => [{ page, limit: 10 }] as const,
            getNextPageParam: (lastPage, allPages) => {
              if (lastPage.length < 10) return undefined
              return allPages.length + 1
            },
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data.pages).toHaveLength(1)
      expect(result.current.data.pages[0]).toHaveLength(10)
      expect(result.current.data.pages[0][0]).toBe("Post 1")
    })

    it("should support fetchNextPage", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery({
            reactor: mockReactor,
            functionName: "getPosts",
            initialPageParam: 1,
            getArgs: (page) => [{ page, limit: 10 }] as const,
            getNextPageParam: (lastPage, allPages) => {
              if (lastPage.length < 10) return undefined
              return allPages.length + 1
            },
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.hasNextPage).toBe(true)

      // fetchNextPage should be available and callable
      expect(typeof result.current.fetchNextPage).toBe("function")
      expect(result.current.isFetchingNextPage).toBe(false)
    })

    it("should call reactor.callMethod with correct args", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery({
            reactor: mockReactor,
            functionName: "getPosts",
            initialPageParam: 1,
            getArgs: (page) => [{ page, limit: 5 }] as const,
            getNextPageParam: () => undefined,
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockReactor.callMethod).toHaveBeenCalledWith({
        functionName: "getPosts",
        args: [{ page: 1, limit: 5 }],
        callConfig: undefined,
      })
    })
  })

  describe("cursor-based pagination", () => {
    it("should work with cursor-based pagination", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery<
            TestActor,
            "getItems",
            "candid",
            number
          >({
            reactor: mockReactor as unknown as Reactor<TestActor>,
            functionName: "getItems",
            initialPageParam: 0,
            getArgs: (cursor) => [cursor],
            getNextPageParam: (lastPage) => lastPage.nextCursor,
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data.pages[0].items[0]).toBe("Item 1")
      expect(result.current.hasNextPage).toBe(true)

      await act(async () => {
        await result.current.fetchNextPage()
      })

      await waitFor(() => {
        expect(result.current.data.pages).toHaveLength(2)
      })

      expect(result.current.data.pages[1].items[0]).toBe("Item 11")
    })

    it("should determine hasNextPage based on getNextPageParam", async () => {
      // Create a mock that returns null nextCursor to indicate no more pages
      const noMorePagesMock = createMockReactor(
        queryClient
      ) as unknown as Reactor<TestActor>
      ;(
        noMorePagesMock.callMethod as ReturnType<typeof vi.fn>
      ).mockImplementation(async () => {
        return { items: ["Last Item"], nextCursor: null }
      })

      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery<
            TestActor,
            "getItems",
            "candid",
            number
          >({
            reactor: noMorePagesMock,
            functionName: "getItems",
            initialPageParam: 0,
            getArgs: (cursor) => [cursor],
            getNextPageParam: (lastPage) => lastPage.nextCursor,
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // When getNextPageParam returns null, hasNextPage should be false
      expect(result.current.hasNextPage).toBe(false)
    })
  })

  describe("token-based pagination", () => {
    it("should work with string token pagination", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery({
            reactor: mockReactor,
            functionName: "getMessages",
            initialPageParam: "start",
            getArgs: (token) => [token] as const,
            getNextPageParam: (lastPage) => lastPage.nextToken,
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data.pages[0].messages[0]).toBe("Message 1")
      expect(result.current.data.pages[0].messages[1]).toBe("Message 2")
    })
  })

  describe("query options", () => {
    it("should use custom staleTime", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery({
            reactor: mockReactor,
            functionName: "getPosts",
            initialPageParam: 1,
            getArgs: (page) => [{ page, limit: 10 }] as const,
            getNextPageParam: () => undefined,
            staleTime: 12345,
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const queryState = queryClient.getQueryCache().find({
        queryKey: result.current.data ? ["test-canister", "getPosts"] : [],
      })

      expect(queryState).toBeDefined()

      // Need to find the exact query. The mock key generator produces ["test-canister", "getPosts", args...]
      // But queryKey logic in hook adds parameters.
      // Actually mock generateQueryKey adds args if present, but the hook passes method only to generateQueryKey
      // `const baseQueryKey = queryKey ?? reactor.generateQueryKey({ method })`
      // So the key should be ["test-canister", "getPosts"].
      // Wait, `useInfiniteQuery` appends parameters? No, `queryKey` is fixed base, `pageParam` handled internally.

      const queries = queryClient.getQueryCache().findAll()
      const query = queries[0]
      expect(query.observers[0].options.staleTime).toBe(12345)
    })
  })

  describe("getPreviousPageParam", () => {
    it("should support bi-directional pagination", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery({
            reactor: mockReactor,
            functionName: "getPosts",
            initialPageParam: 3,
            getArgs: (page) => [{ page, limit: 10 }] as const,
            getNextPageParam: (lastPage, allPages) => {
              if (lastPage.length < 10) return undefined
              const lastPageParam = allPages.length + 2 // Started at page 3
              return lastPageParam + 1
            },
            getPreviousPageParam: (_firstPage, _allPages, firstPageParam) => {
              if (firstPageParam <= 1) return undefined
              return firstPageParam - 1
            },
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Started at page 3, should have previous pages
      expect(result.current.hasPreviousPage).toBe(true)
    })
  })

  describe("select function", () => {
    it("should apply select transformation to infinite data", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery({
            reactor: mockReactor,
            functionName: "getPosts",
            initialPageParam: 1,
            getArgs: (page) => [{ page, limit: 10 }] as const,
            getNextPageParam: () => undefined,
            select: (data) => ({
              ...data,
              pages: data.pages.map((page) =>
                page.map((post) => post.toUpperCase())
              ),
            }),
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data.pages[0][0]).toBe("POST 1")
    })
  })

  describe("refetching", () => {
    it("should support manual refetch", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery({
            reactor: mockReactor,
            functionName: "getPosts",
            initialPageParam: 1,
            getArgs: (page) => [{ page, limit: 10 }] as const,
            getNextPageParam: () => undefined,
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const initialCallCount = (
        mockReactor.callMethod as ReturnType<typeof vi.fn>
      ).mock.calls.length

      await act(async () => {
        await result.current.refetch()
      })

      expect(
        (mockReactor.callMethod as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThan(initialCallCount)
    })
  })

  describe("maxPages option", () => {
    it("should accept maxPages option", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery({
            reactor: mockReactor,
            functionName: "getPosts",
            initialPageParam: 1,
            getArgs: (page) => [{ page, limit: 10 }] as const,
            getNextPageParam: (lastPage, allPages) => {
              if (lastPage.length < 10) return undefined
              return allPages.length + 1
            },
            maxPages: 2,
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Initial page should be loaded
      expect(result.current.data.pages).toHaveLength(1)
      // maxPages option should be respected by tanstack query
      expect(result.current.hasNextPage).toBe(true)
    })
  })

  describe("data structure", () => {
    it("should return data in InfiniteData format", async () => {
      const { result } = renderHook(
        () =>
          useActorSuspenseInfiniteQuery({
            reactor: mockReactor,
            functionName: "getPosts",
            initialPageParam: 1,
            getArgs: (page) => [{ page, limit: 10 }] as const,
            getNextPageParam: (lastPage, allPages) => {
              if (lastPage.length < 10) return undefined
              return allPages.length + 1
            },
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Data should have pages array and pageParams array
      expect(result.current.data).toBeDefined()
      expect(Array.isArray(result.current.data.pages)).toBe(true)
      expect(Array.isArray(result.current.data.pageParams)).toBe(true)

      // Initial page should be loaded
      expect(result.current.data.pages).toHaveLength(1)
      expect(result.current.data.pages[0]).toHaveLength(10)

      // Pages can be flattened
      const allPosts = result.current.data.pages.flat()
      expect(allPosts).toHaveLength(10)
      expect(allPosts?.[0]).toBe("Post 1")
    })
  })
})
