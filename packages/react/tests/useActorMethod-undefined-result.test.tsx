import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, DisplayReactor } from "@ic-reactor/core"
import { useActorMethod } from "../src/hooks/useActorMethod.js"
import { useActorQuery } from "../src/hooks/useActorQuery.js"

/**
 * A `DisplayReactor` types a Candid `opt` as `T | null | undefined`, and its
 * codec decodes `None` to `undefined`, so `callMethod` resolves `undefined` for
 * a successful "nothing found" answer. TanStack Query v5 reserves `undefined`
 * for a missing cache entry and fails any query whose queryFn resolves to it.
 * Every other query path normalizes the value to `null` first. useActorMethod
 * passed it straight through, so the successful reply surfaced as `isError`
 * with "data is undefined" and fired `onError`.
 */

interface TestActor {
  find_profile: ActorMethod<[string], [] | [string]>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    find_profile: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
  })

describe("useActorMethod with a query that successfully returns None", () => {
  let queryClient: QueryClient
  let reactor: DisplayReactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    reactor = new DisplayReactor<TestActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "profiles",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    // A real Candid reply for an `opt text` None. The real codec decodes it.
    vi.spyOn(reactor as any, "executeQuery").mockResolvedValue(
      IDL.encode([IDL.Opt(IDL.Text)], [[]])
    )
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("settles as a success with null data, like useActorQuery", async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()

    const { result } = renderHook(
      () => ({
        method: useActorMethod({
          reactor,
          functionName: "find_profile",
          args: ["alice"],
          onSuccess,
          onError,
        }),
        query: useActorQuery({
          reactor,
          functionName: "find_profile",
          args: ["bob"],
        }),
      }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true))
    await waitFor(() =>
      expect(
        result.current.method.isSuccess || result.current.method.isError
      ).toBe(true)
    )

    expect(result.current.query.data).toBeNull()
    expect(result.current.method.error).toBeNull()
    expect(result.current.method.isError).toBe(false)
    expect(result.current.method.isSuccess).toBe(true)
    expect(result.current.method.data).toBeNull()
    expect(onError).not.toHaveBeenCalled()
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(null))
  })

  it("resolves call(args) with the None reply instead of reporting an error", async () => {
    const onError = vi.fn()

    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "find_profile",
          args: ["alice"],
          enabled: false,
          onError,
        }),
      { wrapper }
    )

    let returned: unknown = "not called"
    await act(async () => {
      returned = await result.current.call(["carol"])
    })

    expect(onError).not.toHaveBeenCalled()
    expect(returned).toBeNull()
  })
})
