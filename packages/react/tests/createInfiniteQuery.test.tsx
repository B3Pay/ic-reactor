import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
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
    [
      {
        cursor: number
        limit: number
        filter?: string
        q?: string
        sort?: string
      },
    ],
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
  limit: number,
  labelPrefix?: string
): { posts: string[]; nextCursor: number | null } => {
  if (cursor >= 50) {
    return { posts: [], nextCursor: null }
  }
  const posts = Array.from({ length: limit }, (_, i) =>
    labelPrefix
      ? `${labelPrefix} :: Post ${cursor + i + 1}`
      : `Post ${cursor + i + 1}`
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
        const { cursor, limit, filter, q, sort } = args[0]
        const labelPrefix =
          filter !== undefined || q !== undefined || sort !== undefined
            ? `filter=${filter ?? ""};q=${q ?? ""};sort=${sort ?? ""}`
            : undefined
        return generatePosts(cursor, limit, labelPrefix)
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
      .mockImplementation(({ functionName, queryKey }) => [
        "test-canister",
        functionName,
        ...(queryKey ?? []),
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

    it("should apply refetchOnMount from config to hook", async () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        refetchOnMount: "always",
      })

      renderHook(() => postsQuery.useInfiniteQuery(), { wrapper })

      await waitFor(() => {
        const queryState = queryClient
          .getQueryCache()
          .find({ queryKey: postsQuery.getQueryKey() })
        expect(queryState?.getObserversCount()).toBeGreaterThan(0)
      })

      const queryState = queryClient
        .getQueryCache()
        .find({ queryKey: postsQuery.getQueryKey() })
      expect(queryState?.observers[0].options.refetchOnMount).toBe("always")
    })

    it("should apply refetchInterval from config to hook", async () => {
      const postsQuery = createInfiniteQuery(mockReactor, {
        functionName: "getPosts",
        initialPageParam: 0,
        getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        refetchInterval: 12345,
      })

      renderHook(() => postsQuery.useInfiniteQuery(), { wrapper })

      await waitFor(() => {
        const queryState = queryClient
          .getQueryCache()
          .find({ queryKey: postsQuery.getQueryKey() })
        expect(queryState?.getObserversCount()).toBeGreaterThan(0)
      })

      const queryState = queryClient
        .getQueryCache()
        .find({ queryKey: postsQuery.getQueryKey() })
      expect(queryState?.observers[0].options.refetchInterval).toBe(12345)
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

  it("should create distinct keys for different args builders by default", async () => {
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

    // Safer default: initial args from each builder contribute to key identity
    expect(smallPageQuery.getQueryKey()).not.toEqual(
      largePageQuery.getQueryKey()
    )

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

  it("should generate different query keys for different params", () => {
    const makeList = createInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      getKeyArgs: (args) => {
        const [{ filter, q, sort }] = args
        return [{ filter, q, sort }]
      },
    })

    const allQuery = makeList((cursor) => [
      { cursor, limit: 10, filter: "all", q: "" },
    ])
    const completedQuery = makeList((cursor) => [
      { cursor, limit: 10, filter: "completed", q: "" },
    ])

    expect(allQuery.getQueryKey()).not.toEqual(completedQuery.getQueryKey())
  })

  it("should generate the same query key for the same params", () => {
    const makeList = createInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      getKeyArgs: (args) => {
        const [{ filter, q, sort }] = args
        return [{ filter, q, sort }]
      },
    })

    const queryA = makeList((cursor) => [
      { cursor, limit: 10, filter: "active", q: "foo", sort: "newest" },
    ])
    const queryB = makeList((cursor) => [
      { cursor, limit: 10, filter: "active", q: "foo", sort: "newest" },
    ])

    expect(queryA.getQueryKey()).toEqual(queryB.getQueryKey())
  })

  it("should keep distinct cache entries when route/search params change", async () => {
    const makeList = createInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      getKeyArgs: (args) => {
        const [{ filter, q, sort }] = args
        return [{ filter, q, sort }]
      },
    })

    const allQuery = makeList((cursor) => [
      { cursor, limit: 5, filter: "all", q: "" },
    ])
    const completedQuery = makeList((cursor) => [
      { cursor, limit: 5, filter: "completed", q: "" },
    ])

    const allData = await allQuery.fetch()
    const completedData = await completedQuery.fetch()

    expect(allData.pages[0].posts[0]).toContain("filter=all;q=;sort=")
    expect(completedData.pages[0].posts[0]).toContain(
      "filter=completed;q=;sort="
    )

    const allQueryRerun = makeList((cursor) => [
      { cursor, limit: 5, filter: "all", q: "" },
    ])
    const callCountBeforeRerun = (
      mockReactor.callMethod as ReturnType<typeof vi.fn>
    ).mock.calls.length
    const rerunData = await allQueryRerun.fetch()

    expect(rerunData.pages[0].posts[0]).toContain("filter=all;q=;sort=")
    expect(
      (mockReactor.callMethod as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBe(callCountBeforeRerun)

    expect(queryClient.getQueryData(allQuery.getQueryKey())).toBeDefined()
    expect(queryClient.getQueryData(completedQuery.getQueryKey())).toBeDefined()
  })

  it("should avoid cache collisions for different q params", async () => {
    const makeList = createInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      getKeyArgs: (args) => {
        const [{ filter, q }] = args
        return [{ filter, q }]
      },
    })

    const fooQuery = makeList((cursor) => [
      { cursor, limit: 5, filter: "active", q: "foo" },
    ])
    const barQuery = makeList((cursor) => [
      { cursor, limit: 5, filter: "active", q: "bar" },
    ])

    const fooData = await fooQuery.fetch()
    const barData = await barQuery.fetch()

    expect(fooData.pages[0].posts[0]).toContain("q=foo")
    expect(barData.pages[0].posts[0]).toContain("q=bar")
    expect(fooQuery.getQueryKey()).not.toEqual(barQuery.getQueryKey())
  })

  it("should preserve infinite pagination with factory-level getKeyArgs", async () => {
    const makeList = createInfiniteQueryFactory(mockReactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      getKeyArgs: (args) => {
        const [{ filter, q, sort }] = args
        return [{ filter, q, sort }]
      },
    })

    const postsQuery = makeList((cursor) => [
      { cursor, limit: 3, filter: "active", q: "foo", sort: "newest" },
    ])

    const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.pages).toHaveLength(1)
    expect(result.current.data?.pages[0].posts[0]).toContain("q=foo")

    await act(async () => {
      await result.current.fetchNextPage()
    })

    await waitFor(() => {
      expect(result.current.data?.pages).toHaveLength(2)
    })

    expect(result.current.data?.pages[1].posts[0]).toContain("q=foo")
  })
})
