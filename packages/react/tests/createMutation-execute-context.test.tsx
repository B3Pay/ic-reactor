import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import React from "react"
import {
  QueryClient,
  QueryClientProvider,
  type MutationFunctionContext,
} from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Reactor, CanisterError } from "@ic-reactor/core"
import { createMutation } from "../src/createMutation.js"

/**
 * TanStack Query hands every mutation callback a `MutationFunctionContext`,
 * `{ client, meta, mutationKey }`, as its last argument, and the callback types
 * createMutation accepts declare it as always present. `execute()` passed
 * `undefined` in its place. A factory callback that reads `context.client`
 * type-checks and works through `useMutation()`, but on `execute()` it threw.
 * In `onSuccess` that rejected a call that had already succeeded. In `onError`
 * the TypeError replaced the canister error the caller was waiting for.
 */

interface TestActor {
  transfer: ActorMethod<[string], boolean>
}

const MUTATION_KEY = ["test-canister", "transfer"]

describe("createMutation execute() passes TanStack's mutation context", () => {
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
      callMethod: vi.fn(async () => true),
      generateQueryKey: vi.fn(() => MUTATION_KEY),
      getQueryOptions: vi.fn(() => ({ queryKey: MUTATION_KEY })),
    } as unknown as Reactor<TestActor>
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("hands onSuccess the same context the hook path does", async () => {
    const contexts: MutationFunctionContext[] = []
    const mutation = createMutation(reactor, {
      functionName: "transfer",
      meta: { feature: "payments" },
      onSuccess: (_data, _variables, _onMutateResult, context) => {
        contexts.push(context)
      },
    })

    const { result } = renderHook(() => mutation.useMutation(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(["alice"])
    })
    await mutation.execute(["alice"])

    const [fromHook, fromExecute] = contexts
    expect(fromHook.client).toBe(queryClient)
    expect(fromExecute?.client).toBe(queryClient)
    expect(fromExecute?.meta).toEqual(fromHook.meta)
    expect(fromExecute?.mutationKey).toEqual(fromHook.mutationKey)
  })

  it("includes the QueryClient's mutation defaults, as the hook path does", async () => {
    // TanStack resolves client-level defaults before it builds the context, so
    // a factory without its own meta still sees them through useMutation().
    queryClient.setDefaultOptions({
      mutations: { retry: false, meta: { source: "client default" } },
    })
    queryClient.setMutationDefaults(MUTATION_KEY, {
      meta: { source: "key default" },
    })
    const contexts: MutationFunctionContext[] = []
    const mutation = createMutation(reactor, {
      functionName: "transfer",
      onSuccess: (_data, _variables, _onMutateResult, context) => {
        contexts.push(context)
      },
    })

    const { result } = renderHook(() => mutation.useMutation(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(["alice"])
    })
    await mutation.execute(["alice"])

    const [fromHook, fromExecute] = contexts
    expect(fromHook.meta).toEqual({ source: "key default" })
    expect(fromExecute?.meta).toEqual(fromHook.meta)
  })

  it("resolves a successful call when onSuccess reads context.client", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const mutation = createMutation(reactor, {
      functionName: "transfer",
      onSuccess: async (_data, _variables, _onMutateResult, context) => {
        await context.client.invalidateQueries({ queryKey: ["balance"] })
      },
    })

    // The update has committed by the time onSuccess runs, so a rejection here
    // reports a completed transfer as a failure.
    await expect(mutation.execute(["alice"])).resolves.toBe(true)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["balance"] })
  })

  it("rejects with the canister error when onError reads context.client", async () => {
    const canisterError = new CanisterError({ InsufficientFunds: null })
    vi.mocked(reactor.callMethod).mockRejectedValue(canisterError)
    const mutation = createMutation(reactor, {
      functionName: "transfer",
      onError: (_error, _variables, _onMutateResult, context) => {
        context.client.setQueryData(["balance"], 0)
      },
    })

    await expect(mutation.execute(["alice"])).rejects.toBe(canisterError)
    expect(queryClient.getQueryData(["balance"])).toBe(0)
  })
})
