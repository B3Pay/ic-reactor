import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createInfiniteQuery,
  createInfiniteQueryFactory,
} from "../src/createInfiniteQuery"
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

describe("createInfiniteQuery", () => {
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
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  describe("basic functionality", () => {
    it("should create an infinite query with required methods", () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      expect(postsQuery.fetch).toBeDefined()
      expect(postsQuery.useInfiniteQuery).toBeDefined()
      expect(postsQuery.invalidate).toBeDefined()
      expect(postsQuery.getQueryKey).toBeDefined()
      expect(postsQuery.getCacheData).toBeDefined()
    })

    it("should return correct query key", () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const queryKey = postsQuery.getQueryKey()
      expect(queryKey).toEqual(["test-canister", "getPosts"])
    })

    it("should return correct refetch key", () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const refetchKey = postsQuery.getQueryKey()
      expect(refetchKey).toEqual(["test-canister", "getPosts"])
    })
  })

  describe("fetch function", () => {
    it("should fetch first page correctly", async () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
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
      const postsQuery = createInfiniteQuery(mockReactor, {
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
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.pages).toHaveLength(1)
      expect(result.current.data?.pages[0].posts[0]).toBe("Post 1")
    })

    it("should determine hasNextPage correctly", async () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.hasNextPage).toBe(true)
    })

    it("should apply select transform in hook", async () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
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

      const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.pages[0].posts[0]).toBe("POST 1")
    })

    it("should support chained select in hook options", async () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () =>
          postsQuery.useInfiniteQuery({
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

    it("should accept additional query options", async () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(
        () =>
          postsQuery.useInfiniteQuery({
            enabled: false,
          }),
        { wrapper }
      )

      expect(result.current.isPending).toBe(true)
      expect(result.current.fetchStatus).toBe("idle")
    })
  })

  describe("refetch function", () => {
    it("should refetch queries", async () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
        wrapper,
      })

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
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const cachedData = postsQuery.getCacheData()
      expect(cachedData).toBeUndefined()
    })

    it("should return cached data when available", async () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const cachedData = postsQuery.getCacheData()
      expect(cachedData).toBeDefined()
      expect(cachedData?.pages).toHaveLength(1)
    })

    it("should apply select transform to cached data", async () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
        wrapper,
      })

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
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      })

      const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.isStale).toBe(false)
    })

    it("should respect custom staleTime", async () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        staleTime: 0, // Immediately stale
      })

      const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.isStale).toBe(true)
    })
  })
})

describe("createInfiniteQueryFactory", () => {
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
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("should create a factory function that returns InfiniteQueryResult", () => {
    const getPostsQuery = createInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    })

    const postsQuery = getPostsQuery((cursor) => [{ cursor, limit: 10 }])

    expect(postsQuery.fetch).toBeDefined()
    expect(postsQuery.useInfiniteQuery).toBeDefined()
    expect(postsQuery.invalidate).toBeDefined()
  })

  it("should fetch data with dynamic args", async () => {
    const getPostsQuery = createInfiniteQueryFactory(mockReactor, {
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
    const getPostsQuery = createInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    })

    const postsQuery = getPostsQuery((cursor) => [{ cursor, limit: 10 }])

    const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.pages).toHaveLength(1)
    expect(result.current.hasNextPage).toBe(true)
  })

  it("should allow creating queries with different args builders", async () => {
    const getPostsQuery = createInfiniteQueryFactory(mockReactor, {
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
    const getPostsQuery = createInfiniteQueryFactory(mockReactor, {
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
