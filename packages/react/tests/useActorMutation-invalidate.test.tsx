import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor } from "@ic-reactor/core"
import { useActorMutation } from "../src/hooks/useActorMutation.js"

interface TestActor {
  update_profile: ActorMethod<[{ name: string }], boolean>
}

const createMockReactor = (queryClient: QueryClient) =>
  ({
    queryClient,
    callMethod: vi.fn().mockResolvedValue(true),
    generateQueryKey: vi
      .fn()
      .mockImplementation(({ functionName }) => [
        "test-canister",
        functionName,
      ]),
    getQueryOptions: vi.fn().mockImplementation((params) => ({
      queryKey: ["test-canister", params.functionName],
      queryFn: () => Promise.resolve(true),
    })),
  }) as unknown as Reactor<TestActor>

describe("useActorMutation — invalidateQueries entries", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    reactor = createMockReactor(queryClient)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("skips undefined entries instead of invalidating the entire client", async () => {
    // Regression: React Query reads `{ queryKey: undefined }` as "match
    // everything", so one undefined entry wiped every query in the client —
    // including an app's unrelated non-canister queries. The natural
    // `[maybeQuery?.getQueryKey()]` idiom produces exactly that.
    queryClient.setQueryData(["unrelated", "a"], "A")
    queryClient.setQueryData(["unrelated", "b"], "B")

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(
      () =>
        useActorMutation({
          reactor,
          functionName: "update_profile",
          invalidateQueries: [undefined],
        }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(queryClient.getQueryState(["unrelated", "a"])?.isInvalidated).toBe(
      false
    )
    expect(queryClient.getQueryState(["unrelated", "b"])?.isInvalidated).toBe(
      false
    )
  })

  it("still invalidates the defined entries alongside an undefined one", async () => {
    queryClient.setQueryData(["test-canister", "get_profile"], "old")
    queryClient.setQueryData(["unrelated", "a"], "A")

    const { result } = renderHook(
      () =>
        useActorMutation({
          reactor,
          functionName: "update_profile",
          invalidateQueries: [undefined, ["test-canister", "get_profile"]],
        }),
      { wrapper }
    )

    result.current.mutate([{ name: "Alice" }])
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(
      queryClient.getQueryState(["test-canister", "get_profile"])?.isInvalidated
    ).toBe(true)
    expect(queryClient.getQueryState(["unrelated", "a"])?.isInvalidated).toBe(
      false
    )
  })
})
