import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor, CanisterError } from "@ic-reactor/core"
import {
  useReactorMutation,
  useActorMethod,
  createMutation,
} from "../src/index.js"

interface TestActor {
  update_profile: ActorMethod<[{ name: string }], boolean>
}

const PROFILE_KEY = ["test-canister", "get_profile"]
const SETTINGS_KEY = ["test-canister", "get_settings"]

const createMockReactor = (
  queryClient: QueryClient,
  callMethod: (params: unknown) => Promise<unknown>
) =>
  ({
    queryClient,
    callMethod,
    canisterId: "test-canister",
    isQueryMethod: vi.fn().mockReturnValue(false),
    generateQueryKey: vi
      .fn()
      .mockImplementation(({ functionName }) => [
        "test-canister",
        functionName,
      ]),
    getQueryOptions: vi.fn().mockImplementation((params: any) => ({
      queryKey: ["test-canister", params.functionName],
      queryFn: () => callMethod(params),
    })),
  }) as unknown as Reactor<TestActor>

describe("mutations do not invalidate on error", () => {
  let queryClient: QueryClient
  let invalidateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(PROFILE_KEY, "profile")
    queryClient.setQueryData(SETTINGS_KEY, "settings")
    invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  const expectNothingInvalidated = () => {
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(queryClient.getQueryState(PROFILE_KEY)?.isInvalidated).toBe(false)
    expect(queryClient.getQueryState(SETTINGS_KEY)?.isInvalidated).toBe(false)
  }

  it("useReactorMutation leaves configured keys untouched when the call fails", async () => {
    const canisterError = new CanisterError({
      InsufficientFunds: { balance: 0n },
    })
    const reactor = createMockReactor(
      queryClient,
      vi.fn().mockRejectedValue(canisterError)
    )
    const onError = vi.fn()

    const { result } = renderHook(
      () =>
        useReactorMutation({
          reactor,
          functionName: "update_profile",
          invalidateQueries: [PROFILE_KEY],
          onError,
        }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])
    await waitFor(() => expect(result.current.isError).toBe(true))

    expectNothingInvalidated()
    // The error still reaches the caller — skipping invalidation must not
    // mean swallowing the failure.
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("useReactorMutation invalidates the same keys once the call succeeds (control)", async () => {
    // Positive control for this file's mock wiring: the negative assertions
    // above only mean something if the identical setup invalidates on success.
    const reactor = createMockReactor(
      queryClient,
      vi.fn().mockResolvedValue(true)
    )

    const { result } = renderHook(
      () =>
        useReactorMutation({
          reactor,
          functionName: "update_profile",
          invalidateQueries: [PROFILE_KEY],
        }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(queryClient.getQueryState(PROFILE_KEY)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(SETTINGS_KEY)?.isInvalidated).toBe(false)
  })

  it("createMutation hook path skips both factory and hook invalidation on error", async () => {
    const canisterError = new CanisterError({
      InsufficientFunds: { balance: 0n },
    })
    const reactor = createMockReactor(
      queryClient,
      vi.fn().mockRejectedValue(canisterError)
    )
    const factoryOnError = vi.fn()

    const transfer = createMutation(reactor, {
      functionName: "update_profile",
      invalidateQueries: [PROFILE_KEY],
      onError: factoryOnError,
    })

    const { result } = renderHook(
      () =>
        transfer.useMutation({
          invalidateQueries: [SETTINGS_KEY],
        }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])
    await waitFor(() => expect(result.current.isError).toBe(true))

    expectNothingInvalidated()
    expect(factoryOnError).toHaveBeenCalledTimes(1)
  })

  it("useActorMethod mutation path skips invalidation on error", async () => {
    const canisterError = new CanisterError({
      InsufficientFunds: { balance: 0n },
    })
    const reactor = createMockReactor(
      queryClient,
      vi.fn().mockRejectedValue(canisterError)
    )

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "update_profile",
          invalidateQueries: [PROFILE_KEY, SETTINGS_KEY],
        }),
      { wrapper }
    )

    await act(async () => {
      await result.current.call([{ name: "Alice" }])
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expectNothingInvalidated()
  })
})
