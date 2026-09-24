import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import {
  MutationCache,
  QueryClient,
  onlineManager,
  type QueryClientConfig,
} from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor, reactorRetry } from "@ic-reactor/core"
import {
  useActorMethod,
  type UseActorMethodParameters,
} from "../src/hooks/useActorMethod.js"

/**
 * `useActorMethod` sends an update method's `call(args)` through a
 * mutation, which was built with only a key, a function and callbacks. The
 * hook's `retry`, `retryDelay`, `networkMode` and `meta` reached the query
 * branch and not that mutation (#564): `networkMode: "always"` left the call
 * paused while the browser reported itself offline, `meta` never reached the
 * MutationCache callbacks, and a `retry` was ignored.
 *
 * They now apply. `retry` still re-sends a state-changing call only when it is
 * set, on the hook or in the QueryClient's mutation defaults: the query
 * defaults, such as `reactorRetry`, do not reach an update.
 */

interface LedgerActor {
  transfer: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ transfer: IDL.Func([IDL.Text], [IDL.Text], []) })

/** Resolve with "timed out" if `promise` has not settled within 200 ms. */
function within<T>(promise: Promise<T>): Promise<T | "timed out"> {
  return Promise.race([
    promise,
    new Promise<"timed out">((resolve) =>
      setTimeout(() => resolve("timed out"), 200)
    ),
  ])
}

describe("useActorMethod call() of an update method", () => {
  let reactor: Reactor<LedgerActor>
  let callMethod: ReturnType<typeof vi.spyOn>
  let failuresLeft: number
  const mutationErrorMeta: unknown[] = []

  const createReactor = (config: QueryClientConfig = {}) => {
    reactor = new Reactor<LedgerActor>({
      clientManager: new ClientManager({
        queryClient: new QueryClient({
          mutationCache: new MutationCache({
            onError: (_error, _variables, _context, mutation) =>
              mutationErrorMeta.push(mutation.meta),
          }),
          ...config,
        }),
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "ledger",
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
      return `sent to ${args?.[0]}`
    }) as never)
  }

  beforeEach(() => {
    failuresLeft = 0
    mutationErrorMeta.length = 0
    createReactor()
  })

  afterEach(() => onlineManager.setOnline(true))

  const renderTransfer = (
    options: Partial<UseActorMethodParameters<LedgerActor, "transfer">> = {}
  ) =>
    renderHook(() =>
      useActorMethod({ reactor, functionName: "transfer", ...options })
    )

  const callTransfer = async (
    result: ReturnType<typeof renderTransfer>["result"]
  ) => {
    let called: unknown
    await act(async () => {
      called = await within(result.current.call(["bob"]))
    })
    return called
  }

  it("retries as the hook's retry says", async () => {
    failuresLeft = 2
    const onError = vi.fn()
    const { result } = renderTransfer({ retry: 2, retryDelay: 1, onError })

    expect(await callTransfer(result)).toBe("sent to bob")
    expect(callMethod).toHaveBeenCalledTimes(3)
    expect(onError).not.toHaveBeenCalled()
  })

  it("waits between retries as the hook's retryDelay says", async () => {
    // The client retries mutations once. Without the hook's retryDelay the
    // retry waits TanStack's default delay of a second.
    createReactor({ defaultOptions: { mutations: { retry: 1 } } })
    failuresLeft = 1
    const { result } = renderTransfer({ retryDelay: 1 })

    expect(await callTransfer(result)).toBe("sent to bob")
  })

  it("sends it offline with the hook's networkMode: always", async () => {
    // A local replica answers while the browser reports itself offline.
    onlineManager.setOnline(false)
    const { result } = renderTransfer({ networkMode: "always" })

    expect(await callTransfer(result)).toBe("sent to bob")
  })

  it("attaches the hook's meta to a failure the MutationCache reports", async () => {
    failuresLeft = 1
    const { result } = renderTransfer({
      meta: { errorMessage: "Could not send the transfer" },
    })

    await callTransfer(result)

    expect(mutationErrorMeta).toEqual([
      { errorMessage: "Could not send the transfer" },
    ])
  })

  it("lets the hook's retry replace the QueryClient's mutation default", async () => {
    createReactor({
      defaultOptions: { mutations: { retry: 3, retryDelay: 1 } },
    })
    failuresLeft = 1
    const { result } = renderTransfer({ retry: false })

    expect(await callTransfer(result)).toBeUndefined()
    expect(callMethod).toHaveBeenCalledTimes(1)
  })

  describe("without a retry on the hook", () => {
    it.each([
      ["reactorRetry, the query default defineReactor installs", reactorRetry],
      ["a plain count", 3],
    ])("sends it once under a query default of %s", async (_, retry) => {
      createReactor({ defaultOptions: { queries: { retry, retryDelay: 1 } } })
      failuresLeft = 1
      const onError = vi.fn()
      const { result } = renderTransfer({ onError })

      expect(await callTransfer(result)).toBeUndefined()
      expect(callMethod).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledTimes(1)
    })

    it("follows the QueryClient's mutation defaults, an app's own choice", async () => {
      createReactor({
        defaultOptions: { mutations: { retry: 1, retryDelay: 1 } },
      })
      failuresLeft = 1
      const { result } = renderTransfer()

      expect(await callTransfer(result)).toBe("sent to bob")
      expect(callMethod).toHaveBeenCalledTimes(2)
    })
  })
})
