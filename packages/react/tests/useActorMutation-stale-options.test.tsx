import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor } from "@ic-reactor/core"
import { useActorMutation } from "../src/hooks/useActorMutation.js"

interface TestActor {
  transfer: ActorMethod<[string], boolean>
}

/**
 * Pass-through options were spread into a memo whose deps could only list the
 * destructured values, never the rest bucket — so `onMutate`, `onSettled`,
 * `retry`, `meta` and `gcTime` were frozen at the first render. `useMutation`
 * applies options from an effect keyed on their identity, so a later render's
 * closures never reached the observer.
 */
describe("useActorMutation — pass-through options are not frozen", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    })
    reactor = {
      queryClient,
      callMethod: vi.fn(async () => true),
      generateQueryKey: vi.fn(() => ["test-canister", "transfer"]),
      getQueryOptions: vi.fn(() => ({
        queryKey: ["test-canister", "transfer"],
      })),
    } as unknown as Reactor<TestActor>
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("runs the latest onSettled, not the one from the first render", async () => {
    const settled: string[] = []
    const { result, rerender } = renderHook(
      ({ label }: { label: string }) =>
        useActorMutation({
          reactor,
          functionName: "transfer",
          onSettled: () => settled.push(label),
        }),
      { wrapper, initialProps: { label: "v1" } }
    )

    rerender({ label: "v2" })
    await act(async () => {
      result.current.mutate(["alice"])
    })
    await waitFor(() => expect(settled.length).toBeGreaterThan(0))

    expect(settled).toEqual(["v2"])
  })

  it("runs the latest onMutate too", async () => {
    const mutated: string[] = []
    const { result, rerender } = renderHook(
      ({ label }: { label: string }) =>
        useActorMutation({
          reactor,
          functionName: "transfer",
          onMutate: () => {
            mutated.push(label)
          },
        }),
      { wrapper, initialProps: { label: "v1" } }
    )

    rerender({ label: "v2" })
    await act(async () => {
      result.current.mutate(["alice"])
    })
    await waitFor(() => expect(mutated.length).toBeGreaterThan(0))

    expect(mutated).toEqual(["v2"])
  })
})
