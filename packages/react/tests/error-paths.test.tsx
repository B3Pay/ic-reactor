import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import {
  Reactor,
  CanisterError,
  CallError,
  isCanisterError,
  isCallError,
  reactorRetry,
} from "@ic-reactor/core"
// Imported through the public barrel on purpose: the raw hooks are public only
// under the `useReactor*` aliases, and no other test imports them by those
// names — a broken alias re-export used to ship green.
import {
  useReactorQuery,
  useReactorInfiniteQuery,
  useReactorMutation,
  useActorMethod,
  createActorMethodHooks,
  createQuery,
  createQueryFactory,
  createSuspenseQuery,
  createInfiniteQuery,
  createInfiniteQueryFactory,
  createMutation,
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
  update_profile: ActorMethod<[{ name: string }], boolean>
}

// Real error shapes, mirroring what `Reactor.callMethod` actually throws: a
// canister `Err` variant passes through as a CanisterError, everything else is
// wrapped in a CallError whose `cause` is the original agent error. The cause
// shapes are the ones captured live in
// packages/core/tests/retry-classification.test.ts — the reject code nests at
// `cause.code.rejectCode`, not `cause.rejectCode`.
const makeCanisterError = () =>
  new CanisterError({ InsufficientFunds: { balance: 0n } })

const makeRejectCallError = () =>
  new CallError('Failed to call method "get_user": no such method', {
    name: "RejectError",
    kind: "Reject",
    code: { rejectCode: 5 },
  })

const makeTransportCallError = () =>
  new CallError('Failed to call method "get_user": fetch failed', {
    name: "TransportError",
    kind: "Transport",
  })

// Rejecting mock reactor: same shape as the resolve-only mocks used across
// these test files, but every call path fails with the supplied error.
const createRejectingReactor = (
  queryClient: QueryClient,
  error: unknown,
  isQueryMethod: (functionName: string) => boolean = () => true
) => {
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
    isQueryMethod: vi.fn().mockImplementation(isQueryMethod),
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

describe("error paths — query hooks", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("useReactorQuery surfaces a CanisterError with err and code intact", async () => {
    const canisterError = makeCanisterError()
    const reactor = createRejectingReactor(queryClient, canisterError)

    const { result } = renderHook(
      () => useReactorQuery({ reactor, functionName: "get_user" }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))

    // The exact instance, not a copy or a re-wrap.
    expect(result.current.error).toBe(canisterError)
    expect(isCanisterError(result.current.error)).toBe(true)
    expect((result.current.error as CanisterError).code).toBe(
      "InsufficientFunds"
    )
    expect((result.current.error as CanisterError).err).toEqual({
      InsufficientFunds: { balance: 0n },
    })
    expect(result.current.data).toBeUndefined()
  })

  it("useReactorQuery surfaces a CallError with its agent cause intact", async () => {
    const callError = makeRejectCallError()
    const reactor = createRejectingReactor(queryClient, callError)

    const { result } = renderHook(
      () => useReactorQuery({ reactor, functionName: "get_user" }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBe(callError)
    expect(isCallError(result.current.error)).toBe(true)
    expect(isCanisterError(result.current.error)).toBe(false)
    expect((result.current.error as CallError).cause).toMatchObject({
      kind: "Reject",
      code: { rejectCode: 5 },
    })
  })

  it("useReactorInfiniteQuery surfaces the rejection as error state", async () => {
    const canisterError = makeCanisterError()
    const reactor = createRejectingReactor(queryClient, canisterError)

    const { result } = renderHook(
      () =>
        useReactorInfiniteQuery({
          reactor,
          functionName: "getPosts",
          initialPageParam: 0,
          getArgs: (cursor: number) => [{ cursor, limit: 10 }] as const,
          getNextPageParam: (lastPage) => lastPage?.nextCursor,
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(canisterError)
    expect(result.current.data).toBeUndefined()
  })

  it("useActorMethod (query) reports error state and fires onError once", async () => {
    const canisterError = makeCanisterError()
    const reactor = createRejectingReactor(queryClient, canisterError)
    const onError = vi.fn()

    const { result } = renderHook(
      () => useActorMethod({ reactor, functionName: "get_user", onError }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(canisterError)
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onError).toHaveBeenCalledWith(canisterError)
  })

  it("useActorMethod (update) resolves call() to undefined and reports the error", async () => {
    const callError = makeTransportCallError()
    const reactor = createRejectingReactor(queryClient, callError, () => false)
    const onError = vi.fn()

    const { result } = renderHook(
      () =>
        useActorMethod({ reactor, functionName: "update_profile", onError }),
      { wrapper }
    )

    let callResult: unknown = "sentinel"
    await act(async () => {
      callResult = await result.current.call([{ name: "Alice" }])
    })

    // The unified call() swallows the rejection after dispatching onError.
    expect(callResult).toBeUndefined()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(callError)
    expect(onError).toHaveBeenCalledWith(callError)
  })

  it("createActorMethodHooks().useMethod surfaces error state", async () => {
    const canisterError = makeCanisterError()
    const reactor = createRejectingReactor(queryClient, canisterError)
    const { useMethod } = createActorMethodHooks(reactor)

    const { result } = renderHook(
      () => useMethod({ functionName: "get_user" }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(canisterError)
  })
})

describe("error paths — mutation hooks", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("useReactorMutation surfaces error state and fires onError", async () => {
    const callError = makeTransportCallError()
    const reactor = createRejectingReactor(queryClient, callError)
    const onError = vi.fn()

    const { result } = renderHook(
      () =>
        useReactorMutation({
          reactor,
          functionName: "update_profile",
          onError,
        }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(callError)
    expect(result.current.data).toBeUndefined()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBe(callError)
  })

  it("useReactorMutation fires onCanisterError for a CanisterError, alongside onError", async () => {
    const canisterError = makeCanisterError()
    const reactor = createRejectingReactor(queryClient, canisterError)
    const onError = vi.fn()
    const onCanisterError = vi.fn()

    const { result } = renderHook(
      () =>
        useReactorMutation({
          reactor,
          functionName: "update_profile",
          onError,
          onCanisterError,
        }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(onCanisterError).toHaveBeenCalledTimes(1)
    expect(onCanisterError.mock.calls[0][0]).toBe(canisterError)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("useReactorMutation does NOT fire onCanisterError for a CallError", async () => {
    const callError = makeTransportCallError()
    const reactor = createRejectingReactor(queryClient, callError)
    const onError = vi.fn()
    const onCanisterError = vi.fn()

    const { result } = renderHook(
      () =>
        useReactorMutation({
          reactor,
          functionName: "update_profile",
          onError,
          onCanisterError,
        }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(onCanisterError).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("createMutation.useMutation() surfaces error state and the hook-level split callbacks", async () => {
    const canisterError = makeCanisterError()
    const reactor = createRejectingReactor(queryClient, canisterError)
    const hookOnError = vi.fn()
    const hookOnCanisterError = vi.fn()

    const transfer = createMutation(reactor, {
      functionName: "update_profile",
    })

    const { result } = renderHook(
      () =>
        transfer.useMutation({
          onError: hookOnError,
          onCanisterError: hookOnCanisterError,
        }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(canisterError)
    expect(hookOnCanisterError).toHaveBeenCalledTimes(1)
    expect(hookOnCanisterError.mock.calls[0][0]).toBe(canisterError)
    expect(hookOnError).toHaveBeenCalledTimes(1)
  })

  it("createMutation.useMutation() skips hook onCanisterError for a CallError", async () => {
    const callError = makeTransportCallError()
    const reactor = createRejectingReactor(queryClient, callError)
    const hookOnCanisterError = vi.fn()

    const transfer = createMutation(reactor, {
      functionName: "update_profile",
    })

    const { result } = renderHook(
      () => transfer.useMutation({ onCanisterError: hookOnCanisterError }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(hookOnCanisterError).not.toHaveBeenCalled()
  })
})

describe("error paths — query factories", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("createQuery.useQuery() surfaces error state", async () => {
    const canisterError = makeCanisterError()
    const reactor = createRejectingReactor(queryClient, canisterError)
    const userQuery = createQuery(reactor, { functionName: "get_user" })

    const { result } = renderHook(() => userQuery.useQuery(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(canisterError)
    expect(result.current.data).toBeUndefined()
  })

  it("createQuery.fetch() rejects with the original error", async () => {
    const canisterError = makeCanisterError()
    const reactor = createRejectingReactor(queryClient, canisterError)
    const userQuery = createQuery(reactor, { functionName: "get_user" })

    await expect(userQuery.fetch()).rejects.toBe(canisterError)
  })

  it("createQueryFactory(args).useQuery() surfaces error state and fetch() rejects", async () => {
    const callError = makeRejectCallError()
    const reactor = createRejectingReactor(queryClient, callError)
    const getItem = createQueryFactory(reactor, { functionName: "get_item" })
    const itemQuery = getItem(["item-1"])

    const { result } = renderHook(() => itemQuery.useQuery(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(callError)

    await expect(itemQuery.fetch()).rejects.toBe(callError)
  })

  it("createSuspenseQuery.fetch() rejects with the original error", async () => {
    const canisterError = makeCanisterError()
    const reactor = createRejectingReactor(queryClient, canisterError)
    const userQuery = createSuspenseQuery(reactor, {
      functionName: "get_user",
    })

    await expect(userQuery.fetch()).rejects.toBe(canisterError)
  })

  it("createInfiniteQuery.useInfiniteQuery() surfaces error state and fetch() rejects", async () => {
    const canisterError = makeCanisterError()
    const reactor = createRejectingReactor(queryClient, canisterError)
    const postsQuery = createInfiniteQuery(reactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getArgs: (cursor) => [{ cursor, limit: 10 }] as const,
      getNextPageParam: (lastPage) => lastPage?.nextCursor,
    })

    const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(canisterError)

    await expect(postsQuery.fetch()).rejects.toBe(canisterError)
  })

  it("createInfiniteQueryFactory(getArgs).useInfiniteQuery() surfaces error state", async () => {
    const callError = makeTransportCallError()
    const reactor = createRejectingReactor(queryClient, callError)
    const postsFactory = createInfiniteQueryFactory(reactor, {
      functionName: "getPosts",
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage?.nextCursor,
    })
    const postsQuery = postsFactory((cursor) => [{ cursor, limit: 10 }])

    const { result } = renderHook(() => postsQuery.useInfiniteQuery(), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(callError)
  })
})

describe("error paths — retry classification through hooks", () => {
  // The reactorRetry default wired by defineReactor must not retry
  // deterministic failures: a canister Err variant or a definitive replica
  // reject repeats identically, while a transport fault may not.
  const wrapperFor = (queryClient: QueryClient) =>
    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    }

  const retryingClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { retry: reactorRetry, retryDelay: () => 1 },
      },
    })

  it("a CanisterError is never retried", async () => {
    const queryClient = retryingClient()
    const reactor = createRejectingReactor(queryClient, makeCanisterError())

    const { result } = renderHook(
      () => useReactorQuery({ reactor, functionName: "get_user" }),
      { wrapper: wrapperFor(queryClient) }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(reactor.callMethod).toHaveBeenCalledTimes(1)
  })

  it("a definitive replica reject (code 5) is never retried", async () => {
    const queryClient = retryingClient()
    const reactor = createRejectingReactor(queryClient, makeRejectCallError())

    const { result } = renderHook(
      () => useReactorQuery({ reactor, functionName: "get_user" }),
      { wrapper: wrapperFor(queryClient) }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(reactor.callMethod).toHaveBeenCalledTimes(1)
  })

  it("a transport-caused CallError retries three times before settling", async () => {
    const queryClient = retryingClient()
    const reactor = createRejectingReactor(
      queryClient,
      makeTransportCallError()
    )

    const { result } = renderHook(
      () => useReactorQuery({ reactor, functionName: "get_user" }),
      { wrapper: wrapperFor(queryClient) }
    )

    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 3000,
    })
    // Initial attempt + 3 retries from reactorRetry's failureCount < 3 cap.
    expect(reactor.callMethod).toHaveBeenCalledTimes(4)
  })
})
