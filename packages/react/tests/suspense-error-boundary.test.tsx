import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React, { Suspense } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor, CanisterError, isCanisterError } from "@ic-reactor/core"
import {
  useReactorSuspenseQuery,
  useReactorSuspenseInfiniteQuery,
  createSuspenseQuery,
  createSuspenseQueryFactory,
  createSuspenseInfiniteQuery,
  createSuspenseInfiniteQueryFactory,
} from "../src/index.js"

interface User {
  name: string
  age: bigint
}

interface TestActor {
  get_user: ActorMethod<[], User>
  get_item: ActorMethod<[string], [] | [{ id: string }]>
  getPosts: ActorMethod<
    [{ cursor: number; limit: number }],
    { posts: string[]; nextCursor: number | null }
  >
}

const createRejectingReactor = (queryClient: QueryClient, error: unknown) => {
  const callMethod = vi.fn().mockRejectedValue(error)
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
    fetchQuery: vi
      .fn()
      .mockImplementation(async (params: any) => callMethod(params)),
    getQueryData: vi
      .fn()
      .mockImplementation((params: any) =>
        queryClient.getQueryData(keyFor(params))
      ),
  } as unknown as Reactor<TestActor>
}

// Suspense hooks deliver failures by throwing during render, so the only
// consumer-visible error channel is an error boundary — none existed in any
// test before, which is exactly how a propagation regression would ship green.
class TestErrorBoundary extends React.Component<
  { onError: (error: unknown) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error)
  }

  render() {
    if (this.state.hasError) return <div>boundary fallback</div>
    return this.props.children
  }
}

describe("suspense hooks propagate errors to an ErrorBoundary", () => {
  let queryClient: QueryClient
  let captured: unknown
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    captured = undefined
    // React logs every boundary-caught error; silence the expected noise.
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {}) as ReturnType<typeof vi.spyOn>
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestErrorBoundary
        onError={(error) => {
          captured = error
        }}
      >
        <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
      </TestErrorBoundary>
    </QueryClientProvider>
  )

  it("useReactorSuspenseQuery throws the exact error to the boundary", async () => {
    const canisterError = new CanisterError({
      InsufficientFunds: { balance: 0n },
    })
    const reactor = createRejectingReactor(queryClient, canisterError)

    renderHook(
      () => useReactorSuspenseQuery({ reactor, functionName: "get_user" }),
      { wrapper }
    )

    await waitFor(() => expect(captured).toBe(canisterError))
    // The taxonomy survives the throw: a boundary can still classify it.
    expect(isCanisterError(captured)).toBe(true)
    expect((captured as CanisterError).code).toBe("InsufficientFunds")
  })

  it("useReactorSuspenseInfiniteQuery throws the exact error to the boundary", async () => {
    const canisterError = new CanisterError({ NotFound: null })
    const reactor = createRejectingReactor(queryClient, canisterError)

    renderHook(
      () =>
        useReactorSuspenseInfiniteQuery({
          reactor,
          functionName: "getPosts",
          initialPageParam: 0,
          getArgs: (cursor: number) => [{ cursor, limit: 10 }] as const,
          getNextPageParam: (lastPage) => lastPage?.nextCursor,
        }),
      { wrapper }
    )

    await waitFor(() => expect(captured).toBe(canisterError))
  })

  it("createSuspenseQuery.useSuspenseQuery() throws to the boundary", async () => {
    const canisterError = new CanisterError({
      InsufficientFunds: { balance: 0n },
    })
    const reactor = createRejectingReactor(queryClient, canisterError)
    const userQuery = createSuspenseQuery(reactor, {
      functionName: "get_user",
    })

    renderHook(() => userQuery.useSuspenseQuery(), { wrapper })

    await waitFor(() => expect(captured).toBe(canisterError))
  })

  it("createSuspenseQueryFactory(args).useSuspenseQuery() throws to the boundary", async () => {
    const canisterError = new CanisterError({ NotFound: null })
    const reactor = createRejectingReactor(queryClient, canisterError)
    const getItem = createSuspenseQueryFactory(reactor, {
      functionName: "get_item",
    })
    const itemQuery = getItem(["item-1"])

    renderHook(() => itemQuery.useSuspenseQuery(), { wrapper })

    await waitFor(() => expect(captured).toBe(canisterError))
  })

  it("createSuspenseInfiniteQuery.useSuspenseInfiniteQuery() throws to the boundary", async () => {
    const canisterError = new CanisterError({ NotFound: null })
    const reactor = createRejectingReactor(queryClient, canisterError)
    const postsQuery = createSuspenseInfiniteQuery(reactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
      getNextPageParam: (lastPage) => lastPage?.nextCursor,
    })

    renderHook(() => postsQuery.useSuspenseInfiniteQuery(), { wrapper })

    await waitFor(() => expect(captured).toBe(canisterError))
  })

  it("createSuspenseInfiniteQueryFactory(getArgs).useSuspenseInfiniteQuery() throws to the boundary", async () => {
    const canisterError = new CanisterError({ NotFound: null })
    const reactor = createRejectingReactor(queryClient, canisterError)
    const postsFactory = createSuspenseInfiniteQueryFactory(reactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage?.nextCursor,
    })
    const postsQuery = postsFactory((cursor) => [{ cursor, limit: 10 }])

    renderHook(() => postsQuery.useSuspenseInfiniteQuery(), { wrapper })

    await waitFor(() => expect(captured).toBe(canisterError))
  })
})
