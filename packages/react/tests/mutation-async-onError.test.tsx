import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor, CanisterError } from "@ic-reactor/core"
import { useActorMutation } from "../src/hooks/useActorMutation.js"
import { createMutation } from "../src/createMutation.js"

/**
 * TanStack Query awaits a mutation's `onError` before it runs `onSettled`,
 * marks the mutation as errored, and rejects `mutateAsync`, the same way it
 * awaits `onSuccess`. Both mutation hooks wrap `onError` to add
 * `onCanisterError`, and the wrappers called the caller's `onError` without
 * returning its promise. An async `onError` was left running while
 * `onSettled` ran, `isPending` went false, and `mutateAsync` rejected.
 * `onSuccess` was already awaited in both hooks.
 */

interface TestActor {
  transfer: ActorMethod<[string], boolean>
}

const later = () => new Promise((resolve) => setTimeout(resolve, 20))

describe("mutation hooks await an async onError", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    reactor = {
      queryClient,
      callMethod: vi.fn(async () => {
        throw new CanisterError({ InsufficientFunds: null })
      }),
      generateQueryKey: vi.fn(() => ["test-canister", "transfer"]),
      getQueryOptions: vi.fn(() => ({
        queryKey: ["test-canister", "transfer"],
      })),
    } as unknown as Reactor<TestActor>
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("useActorMutation", async () => {
    const order: string[] = []
    const { result } = renderHook(
      () =>
        useActorMutation({
          reactor,
          functionName: "transfer",
          onCanisterError: () => {
            order.push("onCanisterError")
          },
          onError: async () => {
            await later()
            order.push("onError finished")
          },
          onSettled: () => {
            order.push("onSettled")
          },
        }),
      { wrapper }
    )

    await act(async () => {
      await result.current.mutateAsync(["alice"]).catch(() => {
        order.push("mutateAsync rejected")
      })
    })
    await waitFor(() => expect(order).toContain("onError finished"))

    expect(order).toEqual([
      "onCanisterError",
      "onError finished",
      "onSettled",
      "mutateAsync rejected",
    ])
  })

  it("createMutation's useMutation, for factory and hook onError", async () => {
    const order: string[] = []
    const mutation = createMutation(reactor, {
      functionName: "transfer",
      onError: async () => {
        await later()
        order.push("factory onError finished")
      },
    })
    const { result } = renderHook(
      () =>
        mutation.useMutation({
          onError: async () => {
            await later()
            order.push("hook onError finished")
          },
          onSettled: () => {
            order.push("onSettled")
          },
        }),
      { wrapper }
    )

    await act(async () => {
      await result.current.mutateAsync(["alice"]).catch(() => {
        order.push("mutateAsync rejected")
      })
    })
    await waitFor(() => expect(order).toContain("hook onError finished"))

    expect(order).toEqual([
      "factory onError finished",
      "hook onError finished",
      "onSettled",
      "mutateAsync rejected",
    ])
  })

  it("createMutation's execute(), for the factory onError", async () => {
    // execute() runs the factory callbacks without a hook, and it rejects for
    // the caller once they are done, just as mutateAsync does.
    const order: string[] = []
    const mutation = createMutation(reactor, {
      functionName: "transfer",
      onError: async () => {
        await later()
        order.push("factory onError finished")
      },
    })

    await mutation.execute(["alice"]).catch((error: unknown) => {
      expect(error).toBeInstanceOf(CanisterError)
      order.push("execute rejected")
    })

    expect(order).toEqual(["factory onError finished", "execute rejected"])
  })
})
