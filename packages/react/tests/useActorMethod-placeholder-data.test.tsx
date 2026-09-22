import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"
import {
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
} from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { useActorMethod } from "../src/hooks/useActorMethod.js"

/**
 * `useActorMethod` reports a query's success from the observer result, and
 * while `placeholderData` is shown that result has `status: "success"`. The
 * effect took it for a settled call and ran `onSuccess` with the placeholder,
 * before any call had been made. With `placeholderData: keepPreviousData`, the
 * usual way to page through args, every args change ran `onSuccess` with the
 * previous args' data as though the new call had returned it.
 */

interface GreeterActor {
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) })

describe("useActorMethod onSuccess and placeholderData", () => {
  let queryClient: QueryClient
  let reactor: Reactor<GreeterActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    reactor = new Reactor<GreeterActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "greeter",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    vi.spyOn(reactor, "callMethod").mockImplementation((async ({
      args,
    }: {
      args?: string[]
    }) => {
      // A real round trip, so the placeholder is on screen for a while.
      await new Promise((resolve) => setTimeout(resolve, 20))
      return `hello ${args?.[0]}`
    }) as never)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("does not report the placeholder as a result", async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["alice"],
          placeholderData: "…",
          onSuccess,
        }),
      { wrapper }
    )
    expect(result.current.data).toBe("…")

    await waitFor(() => expect(result.current.data).toBe("hello alice"))

    expect(onSuccess.mock.calls).toEqual([["hello alice"]])
  })

  it("does not report the previous args' data when the args change", async () => {
    const onSuccess = vi.fn()
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: [name],
          placeholderData: keepPreviousData,
          onSuccess,
        }),
      { wrapper, initialProps: { name: "alice" } }
    )
    await waitFor(() => expect(result.current.data).toBe("hello alice"))

    rerender({ name: "bob" })
    // bob's call is in flight, and alice's data stands in for it.
    expect(result.current.data).toBe("hello alice")

    await waitFor(() => expect(result.current.data).toBe("hello bob"))

    expect(onSuccess.mock.calls).toEqual([["hello alice"], ["hello bob"]])
  })
})
