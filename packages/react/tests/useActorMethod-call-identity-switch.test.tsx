import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient } from "@tanstack/react-query"
import type { ActorMethod, Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor, isCallError } from "@ic-reactor/core"
import { useActorMethod } from "../src/hooks/useActorMethod.js"
import {
  createTestCanister,
  installFakeReplica,
  type FakeReplica,
} from "../src/testing.js"

/**
 * `call()` and `refetch()` on a query method fetch straight through the
 * QueryClient, and `ClientManager.updateAgent` cancels that fetch when a
 * sign-in or sign-out switches the principal, so that the previous
 * principal's answer is never cached. They then resolved with the data
 * TanStack put the entry back to, which was the previous principal's, and
 * `call(args)` reported it to `onSuccess`, or, for an entry with no data,
 * reported TanStack's `CancelledError` to `onError`. They now run again for
 * the principal signed in, as `reactor.fetchQuery()` and the factories'
 * `fetch()` do.
 */

interface GreeterActor {
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) })

const CANISTER_ID = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

const alice: Identity = Ed25519KeyIdentity.generate()
const bob: Identity = Ed25519KeyIdentity.generate()

const nameOf = (principal: string) =>
  principal === alice.getPrincipal().toText()
    ? "alice"
    : principal === bob.getPrincipal().toText()
      ? "bob"
      : principal

let replica: FakeReplica
/** Whether the canister holds each call until the test answers it. */
let holding: boolean
/** The calls it holds, each answered by calling it. */
let held: Array<() => void>
let reactor: Reactor<GreeterActor>

/** Let the observer's notification and the effects it causes run. */
const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))

beforeEach(() => {
  holding = false
  held = []
  replica = installFakeReplica({
    canisters: {
      [CANISTER_ID]: createTestCanister<GreeterActor>(idlFactory, {
        // A caller-scoped answer: who the replica says sent the call.
        greet: async ([name], { caller }) => {
          if (holding) await new Promise<void>((answer) => held.push(answer))
          return `${name}, ${nameOf(caller.toText())}`
        },
      }),
    },
  })
  const clientManager = new ClientManager({
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    agentOptions: { host: replica.host },
  })
  reactor = new Reactor<GreeterActor>({
    clientManager,
    name: "greeter",
    canisterId: CANISTER_ID,
    idlFactory,
  })
  clientManager.updateAgent(alice)
})

afterEach(() => {
  replica.restore()
})

/**
 * Starts `call` with the canister holding it, signs bob in while it is in
 * flight, then answers every call, alice's too, and returns what `call`
 * resolved with.
 */
async function signInBobDuring<T>(call: () => Promise<T>): Promise<T> {
  holding = true
  let called: Promise<T> | undefined
  act(() => {
    called = call()
  })
  await vi.waitFor(() => expect(held).toHaveLength(1))
  act(() => reactor.clientManager.updateAgent(bob))
  holding = false
  for (const answer of held.splice(0)) answer()
  let value: T | undefined
  await act(async () => {
    value = await called
  })
  return value as T
}

describe("useActorMethod call() and refetch() on a query across a sign-in", () => {
  it("resolves call(args) with the new principal's answer", async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useActorMethod({
        reactor,
        functionName: "greet",
        args: ["hi"],
        enabled: false,
        onSuccess,
        onError,
      })
    )

    const value = await signInBobDuring(() => result.current.call(["hello"]))

    expect(value).toBe("hello, bob")
    expect(onSuccess.mock.calls).toEqual([["hello, bob"]])
    expect(onError).not.toHaveBeenCalled()
  })

  it("does not resolve call(args) with the previous principal's cached answer", async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() =>
      useActorMethod({
        reactor,
        functionName: "greet",
        args: ["hi"],
        enabled: false,
        onSuccess,
      })
    )
    await act(async () => {
      await result.current.call(["hello"])
    })

    const value = await signInBobDuring(() => result.current.call(["hello"]))

    expect(value).toBe("hello, bob")
    expect(onSuccess.mock.calls).toEqual([["hello, alice"], ["hello, bob"]])
  })

  it("reports the new principal's answer once when call(args) are the hook's own", async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useActorMethod({
        reactor,
        functionName: "greet",
        args: ["hi"],
        onSuccess,
        onError,
      })
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))

    // The switch also refetches the entry the hook shows. The call resolves
    // with that refetch's answer, and the effects leave it to the call.
    const value = await signInBobDuring(() => result.current.call(["hi"]))
    await waitFor(() => expect(result.current.data).toBe("hi, bob"))
    await settle()

    expect(value).toBe("hi, bob")
    expect(onSuccess.mock.calls).toEqual([["hi, alice"], ["hi, bob"]])
    expect(onError).not.toHaveBeenCalled()
  })

  it("resolves call() with the new principal's answer", async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() =>
      useActorMethod({
        reactor,
        functionName: "greet",
        args: ["hi"],
        onSuccess,
      })
    )
    await waitFor(() => expect(result.current.data).toBe("hi, alice"))

    expect(await signInBobDuring(() => result.current.call())).toBe("hi, bob")
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(2))
    await settle()
    expect(onSuccess.mock.calls).toEqual([["hi, alice"], ["hi, bob"]])
  })

  it("resolves refetch() with the new principal's answer", async () => {
    const { result } = renderHook(() =>
      useActorMethod({
        reactor,
        functionName: "greet",
        args: ["hi"],
        // Fetched only when asked, and so removed from the cache by the
        // switch: the second run fetches it anew.
        enabled: false,
      })
    )
    await act(async () => {
      expect(await result.current.refetch()).toBe("hi, alice")
    })

    expect(await signInBobDuring(() => result.current.refetch())).toBe(
      "hi, bob"
    )
  })

  it("reports a CallError when the principal keeps switching", async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useActorMethod({
        reactor,
        functionName: "greet",
        args: ["hi"],
        enabled: false,
        onSuccess,
        onError,
      })
    )
    holding = true
    let settled = false
    let called: Promise<unknown> | undefined
    act(() => {
      called = result.current.call(["hello"]).finally(() => {
        settled = true
      })
    })

    // Every run is overtaken by a switch of its own, until the call gives up
    // rather than resolve with an answer that may be a previous principal's.
    for (let switches = 0; !settled; switches++) {
      await vi.waitFor(() => {
        expect(settled || held.length > switches).toBe(true)
      })
      if (settled) break
      act(() => reactor.clientManager.updateAgent(switches % 2 ? alice : bob))
    }
    holding = false
    for (const answer of held.splice(0)) answer()

    await act(async () => {
      expect(await called).toBeUndefined()
    })
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(isCallError(onError.mock.calls[0][0])).toBe(true)
  })
})
