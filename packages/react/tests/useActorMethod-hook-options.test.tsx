import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import {
  useActorMethod,
  type UseActorMethodParameters,
} from "../src/hooks/useActorMethod.js"

/**
 * Two places where `useActorMethod` did not follow the options it was given
 * for a query method (#564).
 *
 * `call(args)` fetched through `fetchQuery` with only a key, a query function
 * and `staleTime: 0`. The hook's `retry`, `retryDelay`, `networkMode` and
 * `meta` reached the fetches of its mounted observer and not the fetch of a
 * call. A call failed on the first transient error that the hook's own fetch
 * retried through, stayed paused offline under `networkMode: "always"`, and
 * reached the QueryCache callbacks without the hook's `meta`.
 *
 * `onSuccess` fired for `initialData`, which no call returned: an entry
 * created with it already has `status: "success"`, and so does an entry that
 * `reset()` puts back to it. Placeholder data was skipped for the same reason
 * (#501).
 */

interface GreeterActor {
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) })

/** Resolve with "timed out" if `promise` has not settled within 200 ms. */
function within<T>(promise: Promise<T>): Promise<T | "timed out"> {
  return Promise.race([
    promise,
    new Promise<"timed out">((resolve) =>
      setTimeout(() => resolve("timed out"), 200)
    ),
  ])
}

/** Let the observer's notification and the effects it causes run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe("useActorMethod hook options", () => {
  let queryClient: QueryClient
  let reactor: Reactor<GreeterActor>
  let callMethod: ReturnType<typeof vi.spyOn>
  let failuresLeft: number
  const cacheErrorMeta: unknown[] = []

  beforeEach(() => {
    failuresLeft = 0
    cacheErrorMeta.length = 0
    queryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (_error, query) => cacheErrorMeta.push(query.meta),
      }),
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
    callMethod = vi.spyOn(reactor, "callMethod").mockImplementation((async ({
      args,
    }: {
      args?: string[]
    }) => {
      if (failuresLeft > 0) {
        failuresLeft--
        throw new Error("boundary node timeout")
      }
      return `hello ${args?.[0]}`
    }) as never)
  })

  afterEach(() => onlineManager.setOnline(true))

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  describe("call(args) fetches with the hook's fetch options", () => {
    // The hook renders alice and is disabled, so only call(["bob"]) fetches.
    const renderGreeter = (
      options: Partial<UseActorMethodParameters<GreeterActor, "greet">>
    ) =>
      renderHook(
        () =>
          useActorMethod({
            reactor,
            functionName: "greet",
            args: ["alice"],
            enabled: false,
            ...options,
          }),
        { wrapper }
      )

    it("retries as the hook's retry says", async () => {
      failuresLeft = 2
      const onError = vi.fn()
      const { result } = renderGreeter({ retry: 2, retryDelay: 1, onError })

      let called: unknown
      await act(async () => {
        called = await result.current.call(["bob"])
      })

      expect(called).toBe("hello bob")
      expect(callMethod).toHaveBeenCalledTimes(3)
      expect(onError).not.toHaveBeenCalled()
    })

    it("waits between retries as the hook's retryDelay says", async () => {
      // The client retries once. Without the hook's retryDelay the retry
      // waits TanStack's default delay of a second or more.
      queryClient.setDefaultOptions({ queries: { retry: 1 } })
      failuresLeft = 1
      const { result } = renderGreeter({ retryDelay: 1 })

      let called: unknown
      await act(async () => {
        called = await within(result.current.call(["bob"]))
      })

      expect(called).toBe("hello bob")
    })

    it("fetches offline with the hook's networkMode: always", async () => {
      // A local replica answers while the browser reports itself offline.
      onlineManager.setOnline(false)
      const { result } = renderGreeter({ networkMode: "always" })

      let called: unknown
      await act(async () => {
        called = await within(result.current.call(["bob"]))
      })

      expect(called).toBe("hello bob")
    })

    it("attaches the hook's meta to a failure the QueryCache reports", async () => {
      failuresLeft = 1
      const { result } = renderGreeter({
        meta: { errorMessage: "Could not load the greeting" },
      })

      await act(async () => {
        await result.current.call(["bob"])
      })

      expect(cacheErrorMeta).toEqual([
        { errorMessage: "Could not load the greeting" },
      ])
    })
  })

  describe("onSuccess and initialData", () => {
    it("does not report initialData, and reports the fetch that replaces it", async () => {
      const onSuccess = vi.fn()
      const { result } = renderHook(
        () =>
          useActorMethod({
            reactor,
            functionName: "greet",
            args: ["alice"],
            initialData: "seed",
            // Fresh until invalidated, so nothing fetches on mount.
            staleTime: Infinity,
            onSuccess,
          }),
        { wrapper }
      )
      expect(result.current.data).toBe("seed")
      await settle()

      // Once the seed is stale, the fetch that replaces it is a result.
      await act(() => queryClient.invalidateQueries())
      await waitFor(() => expect(result.current.data).toBe("hello alice"))
      await settle()

      expect(onSuccess.mock.calls).toEqual([["hello alice"]])
    })

    it("reports the fetch that replaces stale initialData on mount", async () => {
      const onSuccess = vi.fn()
      const { result } = renderHook(
        () =>
          useActorMethod({
            reactor,
            functionName: "greet",
            args: ["alice"],
            initialData: "seed",
            onSuccess,
          }),
        { wrapper }
      )
      expect(result.current.data).toBe("seed")

      await waitFor(() => expect(result.current.data).toBe("hello alice"))
      await settle()

      expect(onSuccess.mock.calls).toEqual([["hello alice"]])
    })

    it("does not report the initialData that reset() puts back", async () => {
      const onSuccess = vi.fn()
      const { result } = renderHook(
        () =>
          useActorMethod({
            reactor,
            functionName: "greet",
            args: ["alice"],
            enabled: false,
            initialData: "seed",
            onSuccess,
          }),
        { wrapper }
      )
      await act(async () => {
        await result.current.call()
      })
      await waitFor(() => expect(result.current.data).toBe("hello alice"))

      act(() => result.current.reset())
      await waitFor(() => expect(result.current.data).toBe("seed"))
      await settle()

      expect(onSuccess.mock.calls).toEqual([["hello alice"]])
    })
  })
})
