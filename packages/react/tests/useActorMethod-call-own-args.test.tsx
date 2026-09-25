import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
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
    // Give the call a later timestamp than the mount, as any real round trip
    // to a canister would. On the mount's timestamp the effects would skip the
    // call's settle anyway, and the double report could not show.
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

  /**
   * Both sides used to claim a settle by its timestamp, and a timestamp does
   * not identify a settle. A call now marks the settle its own fetch produced,
   * as TanStack dispatches it, and reports what it settled with.
   */
  describe("tells settles apart without their timestamps", () => {
    it("reports the new identity's answer to a call a switch cancels after a failure", async () => {
      // ClientManager.updateAgent cancels in-flight canister queries, and
      // TanStack puts a cancelled query back the way it was before the fetch:
      // here the earlier failure, timestamp included, and nothing settles
      // for the cancelled fetch. The call used to report TanStack's
      // CancelledError. It now runs again for the new identity, joining the
      // refetch the switch starts for the entry the hook shows, and reports
      // that answer.
      const onSuccess = vi.fn()
      const onError = vi.fn()
      callMethod.mockRejectedValueOnce(new Error("replica unavailable"))
      const { result } = renderHook(
        () =>
          useActorMethod({
            reactor,
            functionName: "greet",
            args: ["alice"],
            onSuccess,
            onError,
          }),
        { wrapper }
      )
      await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))

      let answerRefetch = (_greeting: string) => {}
      callMethod
        // The call: still waiting for an answer when the switch cancels it.
        .mockReturnValueOnce(new Promise(() => {}))
        // The refetch the switch starts for the entry the hook shows.
        .mockReturnValueOnce(
          new Promise((resolve) => {
            answerRefetch = resolve
          })
        )
      let called: Promise<unknown> | undefined
      act(() => {
        called = result.current.call(["alice"])
      })
      act(() =>
        reactor.clientManager.updateAgent(Ed25519KeyIdentity.generate())
      )
      await act(async () => answerRefetch("hello again, alice"))
      await act(async () => {
        expect(await called).toBe("hello again, alice")
      })
      await settle()

      // The call reports the refetch it joined, and the effects leave that
      // settle to it.
      expect(onSuccess.mock.calls).toEqual([["hello again, alice"]])
      expect(onError).toHaveBeenCalledTimes(1)
      expect(callMethod).toHaveBeenCalledTimes(3)
    })

    it("reports the new identity's answer, not the data a cancelled call reverts to", async () => {
      // With data to go back to, TanStack resolves the cancelled call with it
      // instead of rejecting, and call() used to return and report that
      // previous result, which was the previous identity's. It now runs
      // again for the new identity.
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

      let answerRefetch = (_greeting: string) => {}
      callMethod.mockReturnValueOnce(new Promise(() => {})).mockReturnValueOnce(
        new Promise((resolve) => {
          answerRefetch = resolve
        })
      )
      let called: Promise<unknown> | undefined
      act(() => {
        called = result.current.call(["alice"])
      })
      act(() =>
        reactor.clientManager.updateAgent(Ed25519KeyIdentity.generate())
      )
      await act(async () => answerRefetch("hello again, alice"))
      await act(async () => {
        expect(await called).toBe("hello again, alice")
      })
      await settle()

      // Once for the mount, once for the call.
      expect(onSuccess.mock.calls).toEqual([
        ["hello alice #1"],
        ["hello again, alice"],
      ])
    })

    it("reports every call when settles share a millisecond", async () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
      try {
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
          await result.current.call(["alice"])
        })
        await act(async () => {
          await result.current.call(["alice"])
        })
        await settle()

        expect(result.current.queryResult?.dataUpdatedAt).toBe(
          1_700_000_000_000
        )
        expect(onSuccess.mock.calls).toEqual([
          ["hello alice #1"],
          ["hello alice #2"],
          ["hello alice #3"],
        ])
      } finally {
        now.mockRestore()
      }
    })

    it("leaves the app's own queries alone while a call is in flight", async () => {
      // The listener sees every settle in the QueryClient, which an app may
      // share. This app query hashes its own key, since hashKey cannot
      // serialize a BigInt, so the listener must not hash keys itself.
      const { result } = renderHook(
        () => useActorMethod({ reactor, functionName: "greet", args: ["bob"] }),
        { wrapper }
      )
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      callMethod.mockReturnValueOnce(new Promise(() => {}))
      act(() => {
        void result.current.call(["bob"])
      })

      const balance = queryClient.fetchQuery({
        queryKey: ["balance", 10n],
        queryKeyHashFn: (key) =>
          JSON.stringify(key, (_, value: unknown) =>
            typeof value === "bigint" ? value.toString() : value
          ),
        queryFn: async () => 42,
      })

      await expect(balance).resolves.toBe(42)
    })

    it("reports a failed call that fails in the same millisecond as the last", async () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
      try {
        const onError = vi.fn()
        callMethod.mockRejectedValueOnce(new Error("first failure"))
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
        await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))

        callMethod.mockRejectedValueOnce(new Error("second failure"))
        await act(async () => {
          await result.current.call(["alice"])
        })
        await settle()

        expect(result.current.queryResult?.errorUpdatedAt).toBe(
          1_700_000_000_000
        )
        expect(
          onError.mock.calls.map(([error]) => (error as Error).message)
        ).toEqual(["first failure", "second failure"])
      } finally {
        now.mockRestore()
      }
    })
  })
})
