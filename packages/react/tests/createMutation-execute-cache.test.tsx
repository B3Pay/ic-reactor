import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
  useIsMutating,
} from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor, CanisterError } from "@ic-reactor/core"
import { createMutation } from "../src/createMutation.js"

/**
 * `createMutation(...).execute()` called the canister and the factory's
 * callbacks itself, outside the QueryClient's MutationCache (#564). The
 * MutationCache's global `onError`, `onSuccess` and `onSettled` never heard of
 * it, `useIsMutating` did not count it, and it ran without the options
 * `useMutation()` gets: the factory's `retry` and the QueryClient's mutation
 * defaults. The factory's `onMutate` and `onSettled` did not run either, so a
 * factory `onError` had no `onMutate` result to roll back from.
 *
 * `execute()` now builds the mutation in the MutationCache and runs it, as
 * TanStack Query's own `useMutation()` does.
 */

interface TestActor {
  transfer: ActorMethod<[string], boolean>
}

const MUTATION_KEY = ["test-canister", "transfer"]

type CacheEvent = [string, ...unknown[]]

describe("createMutation execute() runs in the MutationCache", () => {
  let events: CacheEvent[]
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>
  let callMethod: Mock<() => Promise<boolean>>

  beforeEach(() => {
    events = []
    queryClient = new QueryClient({
      mutationCache: new MutationCache({
        onSuccess: (data, variables) => {
          events.push(["cache.onSuccess", data, variables])
        },
        onError: (error, variables) => {
          events.push(["cache.onError", error, variables])
        },
        onSettled: (data, error, variables) => {
          events.push(["cache.onSettled", data, error, variables])
        },
      }),
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    callMethod = vi.fn(async () => true)
    reactor = {
      queryClient,
      callMethod,
      generateQueryKey: vi.fn(() => MUTATION_KEY),
      getQueryOptions: vi.fn(() => ({ queryKey: MUTATION_KEY })),
    } as unknown as Reactor<TestActor>
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("reports a success to the MutationCache's onSuccess and onSettled", async () => {
    const mutation = createMutation(reactor, { functionName: "transfer" })

    await expect(mutation.execute(["alice"])).resolves.toBe(true)

    expect(events).toEqual([
      ["cache.onSuccess", true, ["alice"]],
      ["cache.onSettled", true, null, ["alice"]],
    ])
  })

  it("reports a failure to the MutationCache's onError and onSettled", async () => {
    // A global onError is the usual place for an app's error toast.
    const canisterError = new CanisterError({ InsufficientFunds: null })
    callMethod.mockRejectedValue(canisterError)
    const mutation = createMutation(reactor, { functionName: "transfer" })

    await expect(mutation.execute(["alice"])).rejects.toBe(canisterError)

    expect(events).toEqual([
      ["cache.onError", canisterError, ["alice"]],
      ["cache.onSettled", undefined, canisterError, ["alice"]],
    ])
  })

  it("is counted by useIsMutating while it runs", async () => {
    let answer = (_value: boolean) => {}
    callMethod.mockReturnValue(
      new Promise<boolean>((resolve) => {
        answer = resolve
      })
    )
    const mutation = createMutation(reactor, { functionName: "transfer" })
    const { result } = renderHook(
      () => useIsMutating({ mutationKey: MUTATION_KEY }),
      { wrapper }
    )
    expect(result.current).toBe(0)

    let executed: Promise<boolean> | undefined
    act(() => {
      executed = mutation.execute(["alice"])
    })
    await waitFor(() => expect(result.current).toBe(1))

    await act(async () => {
      answer(true)
      await executed
    })
    await waitFor(() => expect(result.current).toBe(0))
  })

  it("applies the QueryClient's mutation defaults for the method's key", async () => {
    queryClient.setMutationDefaults(MUTATION_KEY, { retry: 1, retryDelay: 1 })
    callMethod.mockRejectedValueOnce(new Error("boundary node timeout"))
    const mutation = createMutation(reactor, { functionName: "transfer" })

    await expect(mutation.execute(["alice"])).resolves.toBe(true)
    expect(callMethod).toHaveBeenCalledTimes(2)
  })

  it("applies the factory's own options, such as retry", async () => {
    callMethod.mockRejectedValueOnce(new Error("boundary node timeout"))
    const mutation = createMutation(reactor, {
      functionName: "transfer",
      retry: 1,
      retryDelay: 1,
    })

    await expect(mutation.execute(["alice"])).resolves.toBe(true)
    expect(callMethod).toHaveBeenCalledTimes(2)
  })

  describe("onMutate", () => {
    it("hands each call's callbacks the result of the factory's onMutate", async () => {
      // Two calls in flight at once: each keeps its own onMutate result.
      callMethod.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return true
      })
      const received: unknown[] = []
      const mutation = createMutation(reactor, {
        functionName: "transfer",
        onMutate: ([to]) => ({ previous: `${to}'s balance` }),
        onSuccess: (_data, [to], onMutateResult) => {
          received.push(["onSuccess", to, onMutateResult])
        },
        onSettled: (_data, _error, [to], onMutateResult) => {
          received.push(["onSettled", to, onMutateResult])
        },
      })

      await Promise.all([
        mutation.execute(["alice"]),
        mutation.execute(["bob"]),
      ])

      expect(received).toEqual(
        expect.arrayContaining([
          ["onSuccess", "alice", { previous: "alice's balance" }],
          ["onSuccess", "bob", { previous: "bob's balance" }],
          ["onSettled", "alice", { previous: "alice's balance" }],
          ["onSettled", "bob", { previous: "bob's balance" }],
        ])
      )
      expect(received).toHaveLength(4)
    })

    it("lets a factory onError roll back from its onMutate result", async () => {
      callMethod.mockRejectedValue(new Error("replica unavailable"))
      let rollback: unknown
      const mutation = createMutation(reactor, {
        functionName: "transfer",
        onMutate: () => ({ previous: "snapshot" }),
        onError: (_error, _variables, onMutateResult) => {
          rollback = onMutateResult
        },
      })

      await expect(mutation.execute(["alice"])).rejects.toThrow(
        "replica unavailable"
      )
      expect(rollback).toEqual({ previous: "snapshot" })
    })
  })

  it("still rejects with what a factory onError throws", async () => {
    // execute() has always rejected with it. So does a TanStack Query mutation
    // at the 5.90.2 peer floor, but later releases (5.95.0, and the 5.102.8
    // this repo installs) reject with the call's error and report the thrown
    // one as an unhandled rejection, which ends a Node script.
    callMethod.mockRejectedValue(new CanisterError({ InsufficientFunds: null }))
    const mutation = createMutation(reactor, {
      functionName: "transfer",
      onError: () => {
        throw new Error("Not enough ICP for this transfer")
      },
    })

    await expect(mutation.execute(["alice"])).rejects.toThrow(
      "Not enough ICP for this transfer"
    )
  })
})
