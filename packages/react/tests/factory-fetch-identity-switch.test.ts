import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import type { ActorMethod, Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createQuery } from "../src/createQuery.js"
import { createSuspenseQuery } from "../src/createSuspenseQuery.js"
import { createInfiniteQuery } from "../src/createInfiniteQuery.js"
import { createSuspenseInfiniteQuery } from "../src/createSuspenseInfiniteQuery.js"

/**
 * A route loader awaits a factory's `fetch()`. When the user signs in or out
 * while it is in flight, `ClientManager.updateAgent` cancels it so that the
 * previous identity's answer is never cached, and `fetch()` rejected with
 * TanStack's CancelledError, so the router showed its error boundary. It now
 * resolves with the answer fetched for the new identity (#647).
 */

interface FeedActor {
  greet: ActorMethod<[string], string>
  get_page: ActorMethod<[number], { items: string[]; next: [] | [number] }>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    get_page: IDL.Func(
      [IDL.Nat32],
      [IDL.Record({ items: IDL.Vec(IDL.Text), next: IDL.Opt(IDL.Nat32) })],
      ["query"]
    ),
  })

describe("factory fetch() across a sign-in or sign-out", () => {
  let clientManager: ClientManager
  let reactor: Reactor<FeedActor>
  /** Who each canister call was made as, and how to answer it. */
  let calls: Array<{
    caller: string
    answer: (value: unknown) => void
  }>

  beforeEach(() => {
    clientManager = new ClientManager({
      queryClient: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
      agentOptions: { host: "https://icp-api.io" },
    })
    reactor = new Reactor<FeedActor>({
      clientManager,
      name: "feed",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    calls = []
    vi.spyOn(reactor, "callMethod").mockImplementation((() => {
      const caller = clientManager.identity?.getPrincipal().toText() ?? "none"
      return new Promise((answer) => calls.push({ caller, answer }))
    }) as never)
  })

  /**
   * Starts `fetch`, switches to another user while its canister call is in
   * flight, answers each call with the name of the user it was made as, and
   * returns what `fetch` settled with.
   */
  async function switchDuring<T>(fetch: () => Promise<T>) {
    const alice: Identity = Ed25519KeyIdentity.generate()
    const bob: Identity = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(alice)
    const settled = fetch().then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    )
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    clientManager.updateAgent(bob)
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    const name = (caller: string) =>
      caller === bob.getPrincipal().toText() ? "bob" : "alice"
    // The call made as alice is answered too, and must not be what resolves.
    for (const { caller, answer } of calls) {
      answer({ greeting: name(caller) })
    }
    return settled
  }

  it("createQuery().fetch() resolves with the new user's answer", async () => {
    const query = createQuery(reactor, {
      functionName: "greet",
      args: ["me"],
    })
    expect(await switchDuring(() => query.fetch())).toEqual({
      value: { greeting: "bob" },
    })
  })

  it("createSuspenseQuery().fetch() resolves with the new user's answer", async () => {
    const query = createSuspenseQuery(reactor, {
      functionName: "greet",
      args: ["me"],
    })
    expect(await switchDuring(() => query.fetch())).toEqual({
      value: { greeting: "bob" },
    })
  })

  const infinite = {
    functionName: "get_page",
    initialPageParam: 0,
    getArgs: (page: number): [number] => [page],
    getNextPageParam: () => undefined,
  } as const

  it("createInfiniteQuery().fetch() resolves with the new user's pages", async () => {
    const query = createInfiniteQuery(reactor, infinite)
    expect(await switchDuring(() => query.fetch())).toMatchObject({
      value: { pages: [{ greeting: "bob" }] },
    })
  })

  it("createSuspenseInfiniteQuery().fetch() resolves with the new user's pages", async () => {
    const query = createSuspenseInfiniteQuery(reactor, infinite)
    expect(await switchDuring(() => query.fetch())).toMatchObject({
      value: { pages: [{ greeting: "bob" }] },
    })
  })
})
