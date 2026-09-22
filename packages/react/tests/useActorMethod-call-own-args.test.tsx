import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { useActorMethod } from "../src/hooks/useActorMethod.js"

/**
 * `call(args)` on a query method fetches under the key of the args it was
 * given and reports that result itself, since the mounted observer normally
 * watches a different key (#238). When the args are the hook's own, though,
 * the fetch lands in the entry the observer does watch, and the observer's
 * effect reported the same settle again: `onSuccess` or `onError` fired twice
 * for one call. A "reload" button calling `call(args)` with the args the hook
 * was rendered with, or a lazy query (`enabled: false`) triggered that way,
 * double-fired every toast and analytics event hung off those callbacks.
 */

interface GreeterActor {
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) })

/** Let the observer's notification and the effects it causes run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe("useActorMethod call() with the hook's own args", () => {
  let queryClient: QueryClient
  let reactor: Reactor<GreeterActor>
  let callMethod: ReturnType<typeof vi.spyOn>

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
    let calls = 0
    callMethod = vi
      .spyOn(reactor, "callMethod")
      .mockImplementation(
        (async ({ args }: { args?: string[] }) =>
          `hello ${args?.[0]} #${++calls}`) as never
      )
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("fires onSuccess once per call", async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["alice"],
          onSuccess,
        }),
      { wrapper }
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    // A settle is identified by its timestamp, so keep this one apart from the
    // mount's, as any real round trip to a canister would.
    await settle()

    await act(async () => {
      await result.current.call(["alice"])
    })
    await settle()

    expect(onSuccess.mock.calls).toEqual([
      ["hello alice #1"],
      ["hello alice #2"],
    ])
  })

  it("fires onError once per failed call", async () => {
    const onError = vi.fn()
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["alice"],
          onError,
        }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await settle()
    callMethod.mockRejectedValueOnce(new Error("replica unavailable"))

    await act(async () => {
      await result.current.call(["alice"])
    })
    await settle()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toMatchObject({
      message: "replica unavailable",
    })
  })

  it("fires onSuccess once when a lazy query is triggered by call(args)", async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["bob"],
          enabled: false,
          onSuccess,
        }),
      { wrapper }
    )

    await act(async () => {
      await result.current.call(["bob"])
    })
    await settle()

    expect(onSuccess.mock.calls).toEqual([["hello bob #1"]])
  })

  it("still reports a call with other args, which the observer does not watch", async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["alice"],
          onSuccess,
        }),
      { wrapper }
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.call(["carol"])
    })
    await settle()

    expect(onSuccess.mock.calls).toEqual([
      ["hello alice #1"],
      ["hello carol #2"],
    ])
  })
})
