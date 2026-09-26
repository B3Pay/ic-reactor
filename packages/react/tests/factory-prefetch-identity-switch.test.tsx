import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient } from "@tanstack/react-query"
import type { ActorMethod, Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createQuery } from "../src/createQuery.js"
import { createSuspenseQuery } from "../src/createSuspenseQuery.js"
import {
  createTestCanister,
  installFakeReplica,
  type FakeReplica,
} from "../src/testing.js"

/**
 * A query object's `prefetch()` warms the cache, and a route loader or a hover
 * handler may await it before reading the entry. When the user signs in or out
 * while it is in flight, `ClientManager.updateAgent` cancels it so that the
 * previous identity's answer is never cached, and TanStack resolves the
 * prefetch anyway. An entry nothing observes was left empty, and one a
 * mounted query shows still held the previous principal's data when the
 * prefetch resolved. It now runs again for the principal signed in, as
 * `fetch()` does, and resolves once the cache holds that principal's answer.
 */

interface ProfileActor {
  whoami: ActorMethod<[], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ whoami: IDL.Func([], [IDL.Text], ["query"]) })

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
let clientManager: ClientManager
let reactor: Reactor<ProfileActor>

beforeEach(() => {
  holding = false
  held = []
  replica = installFakeReplica({
    canisters: {
      [CANISTER_ID]: createTestCanister<ProfileActor>(idlFactory, {
        // A caller-scoped answer: who the replica says sent the call.
        whoami: async (_args, { caller }) => {
          if (holding) await new Promise<void>((answer) => held.push(answer))
          return nameOf(caller.toText())
        },
      }),
    },
  })
  clientManager = new ClientManager({
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    agentOptions: { host: replica.host },
  })
  reactor = new Reactor<ProfileActor>({
    clientManager,
    name: "profile",
    canisterId: CANISTER_ID,
    idlFactory,
  })
  clientManager.updateAgent(alice)
})

afterEach(() => {
  replica.restore()
})

/**
 * Starts `prefetch` with the canister holding its call, signs bob in while it
 * is in flight, then answers every call, alice's too. Resolves with what the
 * cache held for `read` at the moment the prefetch resolved.
 */
async function signInBobDuring(
  prefetch: () => Promise<void>,
  read: () => unknown
): Promise<unknown> {
  holding = true
  const cachedWhenDone = prefetch().then(read)
  await vi.waitFor(() => expect(held).toHaveLength(1))
  act(() => clientManager.updateAgent(bob))
  holding = false
  for (const answer of held.splice(0)) answer()
  return cachedWhenDone
}

describe("a query object's prefetch() across a sign-in", () => {
  it("createQuery().prefetch() caches the new principal's answer", async () => {
    const query = createQuery(reactor, { functionName: "whoami" })

    expect(
      await signInBobDuring(
        () => query.prefetch(),
        () => query.getCacheData()
      )
    ).toBe("bob")
  })

  it("createSuspenseQuery().prefetch() caches the new principal's answer", async () => {
    const query = createSuspenseQuery(reactor, { functionName: "whoami" })

    expect(
      await signInBobDuring(
        () => query.prefetch(),
        () => query.getCacheData()
      )
    ).toBe("bob")
  })

  it("resolves only once a mounted query's entry holds the new principal's answer", async () => {
    // staleTime 0, so the prefetch refetches the entry the hook shows.
    const query = createQuery(reactor, {
      functionName: "whoami",
      staleTime: 0,
    })
    const { result } = renderHook(() => query.useQuery())
    await waitFor(() => expect(result.current.data).toBe("alice"))

    expect(
      await signInBobDuring(
        () => query.prefetch(),
        () => query.getCacheData()
      )
    ).toBe("bob")
  })

  it("still never rejects when the principal keeps switching", async () => {
    const query = createQuery(reactor, { functionName: "whoami" })
    holding = true
    let settled = false
    const prefetched = query.prefetch().finally(() => {
      settled = true
    })

    // Every run is overtaken by a switch of its own, until the prefetch gives
    // up. (Before runs were repeated, it resolved at the first switch.)
    for (let switches = 0; !settled; switches++) {
      await vi.waitFor(() => {
        expect(settled || held.length > switches).toBe(true)
      })
      if (settled) break
      act(() => clientManager.updateAgent(switches % 2 === 0 ? bob : alice))
    }
    holding = false
    for (const answer of held.splice(0)) answer()

    await expect(prefetched).resolves.toBeUndefined()
    expect(query.getCacheData()).toBeUndefined()
  })
})
