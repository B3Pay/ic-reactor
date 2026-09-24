import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient } from "@tanstack/react-query"
import type { ActorMethod, Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createQueryFactory } from "../src/createQuery.js"

/**
 * `optimisticUpdate()` snapshots the cached value and its `rollback()` writes
 * that snapshot back. Two things the snapshot did not carry made the rollback
 * write back more than the value it replaced.
 *
 * Whose value it was. Query keys carry no principal, so a sign-in, sign-out or
 * account switch sweeps the cache: inactive entries are removed and active
 * ones refetch as the new principal. A rollback after the switch wrote the
 * previous principal's value back, recreating a removed entry or overwriting
 * the new principal's refetched one, where `fetch()` and `getCacheData()`
 * then served it to the new principal. It now leaves the entry to the sweep.
 *
 * That it was invalidated. `optimisticUpdate()` cancels the fetch in flight,
 * which is often the refetch an invalidation started, and the write clears
 * the invalidated mark. The rollback restored the value but not the mark, so
 * a value known to be outdated read as fresh for its whole `staleTime` and
 * nothing refetched it. The rollback now invalidates it again.
 */

interface Post {
  title: string
  likes: bigint
}

interface BlogActor {
  get_post: ActorMethod<[string], Post>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_post: IDL.Func(
      [IDL.Text],
      [IDL.Record({ title: IDL.Text, likes: IDL.Nat })],
      ["query"]
    ),
  })

let clientManager: ClientManager
let reactor: Reactor<BlogActor>
let alice: Identity
let bob: Identity
/** Each principal's likes on the canister, by principal text. */
let likesOf: Map<string, bigint>
/** While set, every call waits for it, so a fetch stays in flight. */
let gate: Promise<void> | undefined

const openGate = () => {
  let open!: () => void
  gate = new Promise<void>((resolve) => (open = resolve))
  return () => {
    gate = undefined
    open()
  }
}

beforeEach(() => {
  clientManager = new ClientManager({
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    agentOptions: { host: "https://icp-api.io" },
  })
  reactor = new Reactor<BlogActor>({
    clientManager,
    name: "blog",
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
  })
  alice = Ed25519KeyIdentity.generate()
  bob = Ed25519KeyIdentity.generate()
  likesOf = new Map([
    [alice.getPrincipal().toText(), 10n],
    [bob.getPrincipal().toText(), 99n],
  ])
  gate = undefined
  vi.spyOn(reactor, "callMethod").mockImplementation((async ({
    args,
  }: {
    args?: unknown[]
  }) => {
    // Answered as the caller the call was made as, from the state the
    // canister had when it arrived.
    const caller = clientManager.identity?.getPrincipal().toText() ?? ""
    const likes = likesOf.get(caller) ?? 0n
    await (gate ?? new Promise((resolve) => setTimeout(resolve, 5)))
    return { title: `post ${String(args?.[0])}`, likes }
  }) as never)
  clientManager.updateAgent(alice)
})

const like = (post: Post): Post => ({ ...post, likes: post.likes + 1n })

describe("optimisticUpdate() rollback across a principal switch", () => {
  it("does not bring back the previous principal's value the switch removed", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    const post = getPost(["a"])
    await post.fetch()
    const update = await post.optimisticUpdate(like)
    expect(post.getCacheData()?.likes).toBe(11n)

    // Signing in as bob removes the entry, which no component shows.
    clientManager.updateAgent(bob)
    expect(post.getCacheData()).toBeUndefined()

    update.rollback()

    expect(post.getCacheData()).toBeUndefined()
    // So bob's own fetch asks the canister rather than reading alice's post.
    await expect(post.fetch()).resolves.toEqual({
      title: "post a",
      likes: 99n,
    })
  })

  it("does not overwrite the new principal's refetched value", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    const post = getPost(["a"])
    const { result } = renderHook(() => post.useQuery())
    await waitFor(() => expect(result.current.data?.likes).toBe(10n))
    const update = await post.optimisticUpdate(like)

    // The mounted query refetches as bob.
    clientManager.updateAgent(bob)
    await waitFor(() => expect(result.current.data?.likes).toBe(99n))

    update.rollback()

    expect(post.getCacheData()?.likes).toBe(99n)
    expect(result.current.data?.likes).toBe(99n)
  })

  it("writes nothing when the principal switches while it cancels", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    const post = getPost(["a"])
    // Mounted, so the switch keeps alice's value on screen while it refetches
    // as bob rather than removing it.
    const { result } = renderHook(() => post.useQuery())
    await waitFor(() => expect(result.current.data?.likes).toBe(10n))
    const cancelQueries = reactor.queryClient.cancelQueries.bind(
      reactor.queryClient
    )
    vi.spyOn(reactor.queryClient, "cancelQueries").mockImplementationOnce(
      async (...params) => {
        const cancelled = cancelQueries(...params)
        clientManager.updateAgent(bob)
        return cancelled
      }
    )
    const updater = vi.fn(like)

    const update = await post.optimisticUpdate(updater)

    // Alice's post is not the base of a value shown to bob.
    expect(updater).not.toHaveBeenCalled()
    expect(post.getCacheData()?.likes).toBe(10n)
    update.rollback()
    await waitFor(() => expect(result.current.data?.likes).toBe(99n))
  })

  it("still rolls back after a renewal that keeps the principal", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    const post = getPost(["a"])
    await post.fetch()
    const update = await post.optimisticUpdate(like)

    // A renewed delegation: another identity object, the same principal.
    clientManager.updateAgent(alice)
    update.rollback()

    expect(post.getCacheData()?.likes).toBe(10n)
  })
})

describe("optimisticUpdate() rollback of an invalidated value", () => {
  it("invalidates it again, so the refetch the update cancelled runs", async () => {
    const getPost = createQueryFactory(reactor, {
      functionName: "get_post",
      staleTime: 60_000,
    })
    const post = getPost(["a"])
    const { result } = renderHook(() => post.useQuery())
    await waitFor(() => expect(result.current.data?.likes).toBe(10n))

    // Another mutation changed the post and invalidated it; its refetch is in
    // flight when the like cancels it.
    likesOf.set(alice.getPrincipal().toText(), 20n)
    const release = openGate()
    void post.invalidate()
    await waitFor(() =>
      expect(
        reactor.queryClient.getQueryState(post.getQueryKey())?.fetchStatus
      ).toBe("fetching")
    )
    const update = await post.optimisticUpdate(like)
    release()
    await waitFor(() => expect(result.current.data?.likes).toBe(11n))

    update.rollback()

    expect(
      reactor.queryClient.getQueryState(post.getQueryKey())?.isInvalidated
    ).toBe(true)
    await waitFor(() => expect(result.current.data?.likes).toBe(20n))
  })

  it("leaves a value that was not invalidated as it was", async () => {
    const getPost = createQueryFactory(reactor, {
      functionName: "get_post",
      staleTime: 60_000,
    })
    const post = getPost(["a"])
    const { result } = renderHook(() => post.useQuery())
    await waitFor(() => expect(result.current.data?.likes).toBe(10n))
    const update = await post.optimisticUpdate(like)

    update.rollback()

    const state = reactor.queryClient.getQueryState(post.getQueryKey())
    expect(state?.isInvalidated).toBe(false)
    expect(state?.fetchStatus).toBe("idle")
    expect(result.current.data?.likes).toBe(10n)
  })
})
