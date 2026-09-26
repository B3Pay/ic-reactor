import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, skipToken } from "@tanstack/react-query"
import type { ActorMethod, Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createActorHooks } from "../src/createActorHooks.js"
import { createQuery, createQueryFactory } from "../src/createQuery.js"

/**
 * A query waiting on `skipToken` was keyed by its method alone. That is also
 * the key of a query of the method made without args, which is how a method
 * with no parameters is called, so `args: ready ? [] : skipToken` in one
 * component and a plain query of the same method in another shared one
 * cache entry. The waiting query showed the other one's data, and TanStack
 * Query refetches an entry with the options of whichever observer rendered
 * last: when that was the waiting one, an invalidation found `skipToken` in
 * place of a query function. The refetch failed with "Missing queryFn", so a
 * sign-in left the plain query showing the previous caller's answer. A
 * skipped query now has an entry of its own under its method's key.
 */

interface WhoamiActor {
  whoami: ActorMethod<[], string>
  get_blocks: ActorMethod<[bigint], string[]>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    whoami: IDL.Func([], [IDL.Text], ["query"]),
    get_blocks: IDL.Func([IDL.Nat], [IDL.Vec(IDL.Text)], ["query"]),
  })

let clientManager: ClientManager
let reactor: Reactor<WhoamiActor>
let alice: Identity
let bob: Identity
/** What was logged with console.error, first argument only. */
let consoleErrors: string[]

const nameOf = (identity: Identity) =>
  identity === alice ? "alice" : identity === bob ? "bob" : "anonymous"

beforeEach(() => {
  clientManager = new ClientManager({
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    agentOptions: { host: "https://icp-api.io" },
  })
  reactor = new Reactor<WhoamiActor>({
    clientManager,
    name: "backend",
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
  })
  alice = Ed25519KeyIdentity.generate()
  bob = Ed25519KeyIdentity.generate()
  // Answered as the caller the call was made as.
  vi.spyOn(reactor, "callMethod").mockImplementation((async () => {
    const caller = clientManager.identity
    return caller ? nameOf(caller) : "anonymous"
  }) as never)
  clientManager.updateAgent(alice)
  consoleErrors = []
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleErrors.push(String(args[0]))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** TanStack Query's report of a refetch that found skipToken to run. */
const skipTokenInvoked = () =>
  consoleErrors.some((message) => message.includes("skipToken"))

describe("a skipped query beside a query of the same method without args", () => {
  it("useActorQuery: shows no data, and a sign-in still refetches the other", async () => {
    const { useActorQuery } = createActorHooks(reactor)
    const { result } = renderHook(() => {
      const plain = useActorQuery({ functionName: "whoami" })
      // Rendered last, so its options are the entry's when they share one.
      const waiting = useActorQuery({
        functionName: "whoami",
        args: skipToken,
      })
      return { plain, waiting }
    })

    await waitFor(() => expect(result.current.plain.data).toBe("alice"))
    expect(result.current.waiting.data).toBeUndefined()

    act(() => clientManager.updateAgent(bob))

    await waitFor(() => expect(result.current.plain.data).toBe("bob"))
    expect(result.current.waiting.data).toBeUndefined()
    expect(skipTokenInvoked()).toBe(false)
  })

  it("a factory's skipped query beside createQuery of the method: an invalidation refetches", async () => {
    const whoami = createQuery(reactor, { functionName: "whoami" })
    const getWhoami = createQueryFactory(reactor, { functionName: "whoami" })
    const { result } = renderHook(() => {
      const plain = whoami.useQuery()
      const waiting = getWhoami(skipToken).useQuery()
      return { plain, waiting }
    })

    await waitFor(() => expect(result.current.plain.data).toBe("alice"))
    expect(result.current.waiting.data).toBeUndefined()

    const calls = vi.mocked(reactor.callMethod).mock.calls.length
    await act(() => whoami.invalidate())

    expect(vi.mocked(reactor.callMethod).mock.calls.length).toBe(calls + 1)
    expect(result.current.plain.isError).toBe(false)
    expect(skipTokenInvoked()).toBe(false)
  })
})

describe("a skipped list and a skipped query of the same method", () => {
  it("wait in different entries", async () => {
    const { useActorQuery, useActorInfiniteQuery } = createActorHooks(reactor)
    renderHook(() => {
      useActorQuery({ functionName: "get_blocks", args: skipToken })
      useActorInfiniteQuery({
        functionName: "get_blocks",
        getArgs: skipToken,
        initialPageParam: 0n,
        getNextPageParam: () => undefined,
      })
    })

    // TanStack Query does not share an entry between useQuery and
    // useInfiniteQuery.
    const keys = clientManager.queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryHash)
    expect(keys).toHaveLength(2)
    expect(vi.mocked(reactor.callMethod)).not.toHaveBeenCalled()
  })
})
