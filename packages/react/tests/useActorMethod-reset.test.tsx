import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { useActorMethod } from "../src/hooks/useActorMethod.js"

/**
 * `reset()` on a query method called `removeQueries` on the entry its own
 * observer was subscribed to. TanStack Query does not notify observers when it
 * removes a query, so the component kept rendering the old data while its
 * observer stayed bound to an entry that was gone from the cache. Nothing
 * reached that observer afterwards. `setQueryData` and `invalidateQueries`
 * missed it, and so did the canister-scoped invalidation that
 * `ClientManager.updateAgent` runs on an identity switch, until something else
 * re-rendered the component.
 */

interface TestActor {
  whoami: ActorMethod<[], string>
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    whoami: IDL.Func([], [IDL.Text], ["query"]),
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
  })

describe("useActorMethod reset() on a query method", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    clientManager = new ClientManager({
      queryClient,
      agentOptions: { host: "https://icp-api.io" },
    })
    reactor = new Reactor<TestActor>({
      clientManager,
      name: "whoami",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    // whoami gives a caller-scoped answer: whoever the agent is signed as
    // right now. greet answers from its argument.
    vi.spyOn(reactor, "callMethod").mockImplementation((async ({
      functionName,
      args,
    }: {
      functionName: string
      args?: string[]
    }) =>
      functionName === "greet"
        ? `hi ${args?.[0] ?? "all"}`
        : (clientManager.identity?.getPrincipal().toText() ??
          "anonymous")) as never)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("clears the data it renders", async () => {
    const { result } = renderHook(
      () => useActorMethod({ reactor, functionName: "whoami", enabled: false }),
      { wrapper }
    )

    await act(async () => {
      await result.current.call()
    })
    await waitFor(() => expect(result.current.data).toBe("anonymous"))

    act(() => result.current.reset())

    await waitFor(() => expect(result.current.data).toBeUndefined())
  })

  it("still follows the cache afterwards, so an identity switch refetches", async () => {
    const alice = Ed25519KeyIdentity.generate()
    const bob = Ed25519KeyIdentity.generate()
    act(() => clientManager.updateAgent(alice))

    const { result } = renderHook(
      () => useActorMethod({ reactor, functionName: "whoami" }),
      { wrapper }
    )
    await waitFor(() =>
      expect(result.current.data).toBe(alice.getPrincipal().toText())
    )

    act(() => result.current.reset())
    act(() => clientManager.updateAgent(bob))

    await waitFor(() =>
      expect(result.current.data).toBe(bob.getPrincipal().toText())
    )
  })

  it("resets only its own entry, not another hook's args variant", async () => {
    // The no-args key is a prefix of every args variant's key, so a reset
    // matched by prefix would also wipe what the other hook renders.
    const { result } = renderHook(
      () => ({
        all: useActorMethod({ reactor, functionName: "greet", enabled: false }),
        bob: useActorMethod({
          reactor,
          functionName: "greet",
          args: ["bob"],
          enabled: false,
        }),
      }),
      { wrapper }
    )

    await act(async () => {
      await result.current.all.call()
      await result.current.bob.call()
    })
    await waitFor(() => expect(result.current.bob.data).toBe("hi bob"))
    expect(result.current.all.data).toBe("hi all")

    act(() => result.current.all.reset())

    await waitFor(() => expect(result.current.all.data).toBeUndefined())
    expect(result.current.bob.data).toBe("hi bob")
  })

  it("goes back to initialData when the hook was given one", async () => {
    // TanStack's reset restores the query's initial state, and initialData is
    // part of it. reset() documents that rather than hiding it.
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "whoami",
          enabled: false,
          initialData: "seed",
        }),
      { wrapper }
    )

    await act(async () => {
      await result.current.call()
    })
    await waitFor(() => expect(result.current.data).toBe("anonymous"))

    act(() => result.current.reset())

    await waitFor(() => expect(result.current.data).toBe("seed"))
  })
})
