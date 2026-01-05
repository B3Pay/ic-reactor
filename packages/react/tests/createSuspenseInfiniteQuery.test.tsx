import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React, { Suspense } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createSuspenseInfiniteQuery,
  createSuspenseInfiniteQueryFactory,
} from "../src/createSuspenseInfiniteQuery"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor } from "@ic-reactor/core"

// Define a test actor type with paginated methods
type TestActor = {
  getPosts: ActorMethod<
    [{ cursor: number; limit: number }],
    { posts: string[]; nextCursor: number | null }
  >
  getMessages: ActorMethod<
    [{ userId: string; page: number }],
    { messages: string[]; hasMore: boolean }
  >
}

// Mock data generator
const generatePosts = (
  cursor: number,
  limit: number
): { posts: string[]; nextCursor: number | null } => {
  if (cursor >= 50) {
    return { posts: [], nextCursor: null }
  }
  const posts = Array.from(
    { length: limit },
    (_, i) => `Post ${cursor + i + 1}`
  )
  const nextCursor = cursor + limit < 50 ? cursor + limit : null
  return { posts, nextCursor }
}

// Mock Reactor
const createMockReactor = (queryClient: QueryClient) => {
  const callMethod = vi
    .fn()
    .mockImplementation(async ({ functionName, args }) => {
      if (functionName === "getPosts") {
        const { cursor, limit } = args[0]
        return generatePosts(cursor, limit)
      }
      if (functionName === "getMessages") {
        const { userId, page } = args[0]
        const messages = Array.from(
          { length: 5 },
          (_, i) => `${userId}: Message ${page * 5 + i + 1}`
        )
        return { messages, hasMore: page < 3 }
      }
      return null
    })

  // Mock ensureInfiniteQueryData
  queryClient.ensureInfiniteQueryData = vi
    .fn()
    .mockImplementation(async (options) => {
      return queryClient.fetchInfiniteQuery(options)
    })

  return {
    queryClient,
    callMethod,
    generateQueryKey: vi
      .fn()
      .mockImplementation(({ functionName }) => [
        "test-canister",
        functionName,
      ]),
  } as unknown as Reactor<TestActor>
}

describe("createSuspenseInfiniteQuery", () => {
  let queryClient: QueryClient
  let mockReactor: ReturnType<typeof createMockReactor>

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
    it("should create an infinite query with required methods", () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      expect(postsQuery.fetch).toBeDefined()
      expect(postsQuery.useSuspenseInfiniteQuery).toBeDefined()
      expect(postsQuery.invalidate).toBeDefined()
      expect(postsQuery.getQueryKey).toBeDefined()
      expect(postsQuery.getCacheData).toBeDefined()
    })

    it("should return correct query key", () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const queryKey = postsQuery.getQueryKey()
      expect(queryKey).toEqual(["test-canister", "getPosts"])
    })

    it("should return correct refetch key", () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      expect(postsQuery.getQueryKey()).toEqual(["test-canister", "getPosts"])
    })
  })

  describe("fetch function", () => {
    it("should fetch first page correctly", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const data = await postsQuery.fetch()

      expect(data.pages).toHaveLength(1)
      expect(data.pages[0].posts).toHaveLength(10)
      expect(data.pages[0].posts[0]).toBe("Post 1")
    })

    it("should apply select transform when fetching", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        select: (data) => ({
          ...data,
          totalPosts: data.pages.reduce(
            (acc, page) => acc + page.posts.length,
            0
          ),
        }),
      })

      const data = await postsQuery.fetch()

      expect((data as any).totalPosts).toBe(10)
    })
  })

  describe("useInfiniteQuery hook", () => {
    it("should fetch initial page correctly", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data.pages).toHaveLength(1)
      expect(result.current.data.pages[0].posts[0]).toBe("Post 1")
    })

    it("should determine hasNextPage correctly", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.hasNextPage).toBe(true)
    })

    it("should apply select transform in hook", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        select: (data) => ({
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            posts: page.posts.map((p) => p.toUpperCase()),
          })),
        }),
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data.pages[0].posts[0]).toBe("POST 1")
    })

    it("should support chained select in hook options", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () =>
          postsQuery.useSuspenseInfiniteQuery({
            select: (data) => data.pages.flatMap((page) => page.posts),
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Data should be flattened array of posts
      expect(Array.isArray(result.current.data)).toBe(true)
      expect(result.current.data).toHaveLength(10)
    })
  })

  describe("refetch function", () => {
    it("should refetch queries", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const initialCallCount = (
        mockReactor.callMethod as ReturnType<typeof vi.fn>
      ).mock.calls.length

      await postsQuery.invalidate()

      expect(
        (mockReactor.callMethod as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThan(initialCallCount)
    })
  })

  describe("getCacheData function", () => {
    it("should return undefined when not in cache", () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const cachedData = postsQuery.getCacheData()
      expect(cachedData).toBeUndefined()
    })

    it("should return cached data when available", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const cachedData = postsQuery.getCacheData()
      expect(cachedData).toBeDefined()
      expect(cachedData?.pages).toHaveLength(1)
    })

    it("should apply select transform to cached data", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const allPosts = postsQuery.getCacheData((data) =>
        data.pages.flatMap((page) => page.posts)
      )

      expect(allPosts).toHaveLength(10)
      expect(allPosts?.[0]).toBe("Post 1")
    })
  })

  describe("staleTime configuration", () => {
    it("should use default staleTime of 5 minutes", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.isStale).toBe(false)
    })

    it("should pass staleTime to query options", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        staleTime: 12345,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const queryState = queryClient
        .getQueryCache()
        .find({ queryKey: postsQuery.getQueryKey() })

      expect(queryState?.getObserversCount()).toBeGreaterThan(0)
      expect(queryState?.observers[0].options.staleTime).toBe(12345)
    })
  })
})

describe("createSuspenseInfiniteQueryFactory", () => {
  let queryClient: QueryClient
  let mockReactor: ReturnType<typeof createMockReactor>

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

  it("should create a factory function that returns SuspenseInfiniteQueryResult", () => {
    const getPostsQuery = createSuspenseInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    })

    const postsQuery = getPostsQuery((cursor) => [{ cursor, limit: 10 }])

    expect(postsQuery.fetch).toBeDefined()
    expect(postsQuery.useSuspenseInfiniteQuery).toBeDefined()
    expect(postsQuery.invalidate).toBeDefined()
  })

  it("should fetch data with dynamic args", async () => {
    const getPostsQuery = createSuspenseInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    })

    const postsQuery = getPostsQuery((cursor) => [{ cursor, limit: 5 }])

    const data = await postsQuery.fetch()

    expect(data.pages[0].posts).toHaveLength(5)
    expect(mockReactor.callMethod).toHaveBeenCalledWith({
      functionName: "getPosts",
      args: [{ cursor: 0, limit: 5 }],
      callConfig: undefined,
    })
  })

  it("should work with useInfiniteQuery hook", async () => {
    const getPostsQuery = createSuspenseInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    })

    const postsQuery = getPostsQuery((cursor) => [{ cursor, limit: 10 }])

    const { result } = renderHook(() => postsQuery.useSuspenseInfiniteQuery(), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data.pages).toHaveLength(1)
    expect(result.current.hasNextPage).toBe(true)
  })

  it("should allow creating queries with different args builders", async () => {
    const getPostsQuery = createSuspenseInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    })

    const smallPageQuery = getPostsQuery((cursor) => [{ cursor, limit: 5 }])
    const largePageQuery = getPostsQuery((cursor) => [{ cursor, limit: 20 }])

    // Both should be valid query instances
    expect(smallPageQuery.fetch).toBeDefined()
    expect(largePageQuery.fetch).toBeDefined()

    // They share the same query key since they're the same method
    expect(smallPageQuery.getQueryKey()).toEqual(largePageQuery.getQueryKey())

    // Fetch with small page query
    const data = await smallPageQuery.fetch()
    expect(data.pages[0].posts).toHaveLength(5)
  })

  it("should apply select transform with factory", async () => {
    const getPostsQuery = createSuspenseInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      select: (data) => ({
        ...data,
        postCount: data.pages.reduce((acc, page) => acc + page.posts.length, 0),
      }),
    })

    const postsQuery = getPostsQuery((cursor) => [{ cursor, limit: 10 }])
    const data = await postsQuery.fetch()

    expect((data as any).postCount).toBe(10)
  })
})

describe("refetching behavior with infinite queries", () => {
  let queryClient: QueryClient
  let mockReactor: ReturnType<typeof createMockReactor>
  let fetchCount: number

  beforeEach(() => {
    fetchCount = 0
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })
    mockReactor = createMockReactor(queryClient)

    // Override callMethod to track fetch count and return dynamic data
    ;(mockReactor.callMethod as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ functionName, args }) => {
        fetchCount++
        if (functionName === "getPosts") {
          const { cursor, limit } = args[0]
          // Return different data on each fetch to verify refetching works
          return {
            posts: Array.from(
              { length: limit },
              (_, i) => `Post ${cursor + i + 1} (fetch #${fetchCount})`
            ),
            nextCursor: cursor + limit < 50 ? cursor + limit : null,
          }
        }
        return null
      }
    )
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </QueryClientProvider>
  )

  describe("refetch() method", () => {
    it("should refetch only the first page when no pages are fetched yet", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      // Initial fetch
      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data.pages).toHaveLength(1)
      expect(result.current.data.pages[0].posts[0]).toBe("Post 1 (fetch #1)")
      expect(fetchCount).toBe(1)

      // Refetch
      await postsQuery.invalidate()

      await waitFor(() => {
        expect(result.current.data.pages[0].posts[0]).toBe("Post 1 (fetch #2)")
      })

      expect(fetchCount).toBe(2)
    })

    it("should update cache data after refetch", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Initial fetch count before refetch
      const fetchCountBeforeRefetch = fetchCount

      // Refetch
      await postsQuery.invalidate()

      await waitFor(() => {
        // Fetch count should have increased
        expect(fetchCount).toBeGreaterThan(fetchCountBeforeRefetch)
      })

      // Cache should be updated - verify the data contains newer fetch info
      const cacheDataAfter = postsQuery.getCacheData()
      expect(cacheDataAfter).toBeDefined()
      expect(cacheDataAfter?.pages).toHaveLength(1)
    })

    it("should work correctly with hook's refetch function", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data.pages[0].posts[0]).toContain("Post 1")
      expect(result.current.data.pages[0].posts[0]).toContain("fetch #1")

      // Use hook's refetch
      await postsQuery.invalidate()

      await waitFor(() => {
        expect(result.current.data.pages[0].posts[0]).toContain("fetch #2")
      })
    })
  })

  describe("refetch updates data correctly", () => {
    it("should increment fetch count on each refetch", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Initial fetch
      expect(fetchCount).toBe(1)

      // First refetch
      await postsQuery.invalidate()
      await waitFor(() => {
        expect(fetchCount).toBe(2)
      })

      // Second refetch
      await postsQuery.invalidate()
      await waitFor(() => {
        expect(fetchCount).toBe(3)
      })
    })

    it("should trigger refetch when calling refetchQueries directly", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const initialFetchCount = fetchCount

      // Use queryClient directly to refetch
      await queryClient.invalidateQueries({
        queryKey: postsQuery.getQueryKey(),
      })

      await waitFor(() => {
        expect(fetchCount).toBeGreaterThan(initialFetchCount)
      })
    })
  })

  describe("config-level options affecting hooks", () => {
    it("should apply refetchOnMount from config to hook", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        refetchOnMount: false,
      })

      // First hook mount
      const { result, unmount } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(fetchCount).toBe(1)
      unmount()

      // Second mount should NOT refetch because refetchOnMount is false
      const { result: result2 } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        { wrapper }
      )

      await waitFor(() => {
        expect(result2.current.isSuccess).toBe(true)
      })

      // Should still be 1 because refetchOnMount is false
      expect(fetchCount).toBe(1)
    })

    it("should apply refetchOnWindowFocus from config to hook", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        refetchOnWindowFocus: false,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Check the observer options
      const queryState = queryClient
        .getQueryCache()
        .find({ queryKey: postsQuery.getQueryKey() })

      expect(queryState?.observers[0].options.refetchOnWindowFocus).toBe(false)
    })

    it("should apply retry options from config to hook", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: 3,
        retryDelay: 1000,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const queryState = queryClient
        .getQueryCache()
        .find({ queryKey: postsQuery.getQueryKey() })

      expect(queryState?.observers[0].options.retry).toBe(3)
      expect(queryState?.observers[0].options.retryDelay).toBe(1000)
    })

    it("should allow hook options to override config options", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        staleTime: 5000,
        refetchOnMount: false,
      })

      // Hook should override config options
      const { result } = renderHook(
        () =>
          postsQuery.useSuspenseInfiniteQuery({
            staleTime: 10000,
            refetchOnMount: true,
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const queryState = queryClient
        .getQueryCache()
        .find({ queryKey: postsQuery.getQueryKey() })

      // Hook options should override config
      expect(queryState?.observers[0].options.staleTime).toBe(10000)
      expect(queryState?.observers[0].options.refetchOnMount).toBe(true)
    })

    it("should apply gcTime (cacheTime) from config to hook", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        gcTime: 60000,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const queryState = queryClient
        .getQueryCache()
        .find({ queryKey: postsQuery.getQueryKey() })

      expect(queryState?.observers[0].options.gcTime).toBe(60000)
    })

    it("should apply maxPages from config to hook options", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        maxPages: 2,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const queryState = queryClient
        .getQueryCache()
        .find({ queryKey: postsQuery.getQueryKey() })

      // Verify maxPages is passed to the observer options
      expect(queryState?.observers[0].options.maxPages).toBe(2)
    })

    it("should apply refetchInterval from config to hook", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        refetchInterval: 5000,
      })

      const { result } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        {
          wrapper,
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const queryState = queryClient
        .getQueryCache()
        .find({ queryKey: postsQuery.getQueryKey() })

      expect(queryState?.observers[0].options.refetchInterval).toBe(5000)
    })
  })

  describe("multiple hook instances", () => {
    it("should share cache between multiple hook instances", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      // First hook instance
      const { result: result1 } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        { wrapper }
      )

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true)
      })

      // Should have initial data
      expect(result1.current.data.pages[0].posts[0]).toBe("Post 1 (fetch #1)")

      // Second hook instance should see the same cached data (no new fetch)
      const fetchCountBeforeSecondHook = fetchCount

      const { result: result2 } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        { wrapper }
      )

      await waitFor(() => {
        expect(result2.current.isSuccess).toBe(true)
      })

      // Both should have the same data
      expect(result2.current.data.pages[0].posts[0]).toBe("Post 1 (fetch #1)")

      // Should not have made another fetch (data was cached)
      expect(fetchCount).toBe(fetchCountBeforeSecondHook)
    })

    it("should update all hook instances when refetch is called", async () => {
      const postsQuery = createSuspenseInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      // Create two hook instances
      const { result: result1 } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        { wrapper }
      )

      const { result: result2 } = renderHook(
        () => postsQuery.useSuspenseInfiniteQuery(),
        { wrapper }
      )

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true)
        expect(result2.current.isSuccess).toBe(true)
      })

      // Both should have the same initial data
      expect(result1.current.data.pages[0].posts[0]).toBe("Post 1 (fetch #1)")
      expect(result2.current.data.pages[0].posts[0]).toBe("Post 1 (fetch #1)")

      // Refetch using the factory method
      await postsQuery.invalidate()

      await waitFor(() => {
        // Both instances should be updated
        expect(result1.current.data.pages[0].posts[0]).toBe("Post 1 (fetch #2)")
        expect(result2.current.data.pages[0].posts[0]).toBe("Post 1 (fetch #2)")
      })
    })
  })
})
