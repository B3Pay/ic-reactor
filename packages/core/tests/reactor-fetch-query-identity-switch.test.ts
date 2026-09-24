import { describe, it, expect, vi, beforeEach } from "vitest"
import { CancelledError, QueryClient } from "@tanstack/query-core"
import {
  AnonymousIdentity,
  type ActorMethod,
  type Identity,
} from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { CallError } from "../src/errors/index.js"

/**
 * `updateAgent` cancels the queries in flight when the principal changes, so
 * an answer fetched for the previous principal is never cached for the next.
 * A mounted query refetches afterwards. `fetchQuery`, which route loaders use
 * through the factories' `fetch()`, has no observer: it rejected with
 * TanStack's CancelledError, which is not a reactor error, and a loader
 * running during a sign-out showed its error boundary (#647).
 */

interface Ledger {
  balance: ActorMethod<[], bigint>
}

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ balance: IDL.Func([], [IDL.Nat], ["query"]) })

/** Resolves or rejects when the test says so. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

/** A canister call the test answers, and the identity it was made under. */
interface PendingCall {
  identity: Identity | undefined
  answer: ReturnType<typeof deferred<unknown>>
}

describe("fetchQuery across an identity switch", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let calls: PendingCall[]

  /** Makes every canister call of `reactor` wait for the test to answer. */
  function holdCalls(reactor: Reactor<Ledger> | DisplayReactor<Ledger>) {
    vi.spyOn(reactor, "callMethod").mockImplementation((() => {
      const answer = deferred<unknown>()
      calls.push({ identity: clientManager.identity, answer })
      return answer.promise
    }) as never)
  }

  /** Waits until the fetch has made `count` canister calls. */
  const callsMade = (count: number) =>
    vi.waitFor(() => expect(calls).toHaveLength(count))

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    clientManager = new ClientManager({
      queryClient,
      agentOptions: { host: "https://icp-api.io" },
    })
    calls = []
  })

  const ledger = () =>
    new Reactor<Ledger>({
      clientManager,
      name: "ledger",
      canisterId: CANISTER_ID,
      idlFactory,
    })

  it("resolves with the answer fetched for the identity signed in meanwhile", async () => {
    const reactor = ledger()
    holdCalls(reactor)
    const alice = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(alice)

    const pending = reactor.fetchQuery({ functionName: "balance" })
    await callsMade(1)
    const bob = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(bob)
    await callsMade(2)
    calls[0].answer.resolve(100n)
    calls[1].answer.resolve(7n)

    await expect(pending).resolves.toBe(7n)
    expect(calls.map((call) => call.identity)).toEqual([alice, bob])
  })

  it("never caches the previous identity's answer", async () => {
    const reactor = ledger()
    holdCalls(reactor)
    clientManager.updateAgent(Ed25519KeyIdentity.generate())

    const pending = reactor.fetchQuery({ functionName: "balance" })
    await callsMade(1)
    clientManager.updateAgent(new AnonymousIdentity())
    await callsMade(2)
    calls[1].answer.resolve(0n)
    await expect(pending).resolves.toBe(0n)
    // The signed-in user's answer arrives last, and is dropped.
    calls[0].answer.resolve(100n)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(reactor.getQueryData({ functionName: "balance" })).toBe(0n)
  })

  it("runs again after a sign-in that follows the first render", async () => {
    // Nothing is installed yet: the fetch runs as the agent's anonymous
    // identity, and the first sign-in cancels it.
    const reactor = ledger()
    holdCalls(reactor)

    const pending = reactor.fetchQuery({ functionName: "balance" })
    await callsMade(1)
    const alice = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(alice)
    await callsMade(2)
    calls[1].answer.resolve(42n)

    await expect(pending).resolves.toBe(42n)
    expect(calls[1].identity).toBe(alice)
  })

  it("does the same for a DisplayReactor", async () => {
    const reactor = new DisplayReactor<Ledger>({
      clientManager,
      name: "ledger",
      canisterId: CANISTER_ID,
      idlFactory,
    })
    holdCalls(reactor)
    clientManager.updateAgent(Ed25519KeyIdentity.generate())

    const pending = reactor.fetchQuery({ functionName: "balance" })
    await callsMade(1)
    clientManager.updateAgent(Ed25519KeyIdentity.generate())
    await callsMade(2)
    calls[1].answer.resolve("7")

    await expect(pending).resolves.toBe("7")
  })

  it("gives up after three runs cut short by further switches", async () => {
    const reactor = ledger()
    holdCalls(reactor)

    const pending = reactor.fetchQuery({ functionName: "balance" })
    const settled = pending.catch((error: unknown) => error)
    for (let count = 1; count <= 4; count++) {
      await callsMade(count)
      clientManager.updateAgent(Ed25519KeyIdentity.generate())
    }

    // A CallError, the type a reactor call documents, with TanStack's
    // cancellation as its cause.
    const error = await settled
    expect(error).toBeInstanceOf(CallError)
    expect((error as CallError).cause).toBeInstanceOf(CancelledError)
    expect(calls).toHaveLength(4)
  })

  it("resolves with the answer in flight when the principal stays", async () => {
    // A renewal cancels nothing (#719), so the fetch in flight answers.
    const reactor = ledger()
    holdCalls(reactor)
    const alice = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(alice)

    const pending = reactor.fetchQuery({ functionName: "balance" })
    await callsMade(1)
    clientManager.updateAgent(alice)
    calls[0].answer.resolve(100n)

    await expect(pending).resolves.toBe(100n)
    expect(calls).toHaveLength(1)
  })

  describe("passes on", () => {
    it("a cancellation with no identity switch behind it", async () => {
      const reactor = ledger()
      holdCalls(reactor)

      const pending = reactor.fetchQuery({ functionName: "balance" })
      await callsMade(1)
      void queryClient.cancelQueries({ queryKey: [CANISTER_ID] })

      await expect(pending).rejects.toBeInstanceOf(CancelledError)
      expect(calls).toHaveLength(1)
    })

    it("a call error", async () => {
      const reactor = ledger()
      holdCalls(reactor)

      const pending = reactor.fetchQuery({ functionName: "balance" })
      await callsMade(1)
      const failure = new CallError("replica unavailable", new Error("503"))
      calls[0].answer.reject(failure)

      await expect(pending).rejects.toBe(failure)
      expect(calls).toHaveLength(1)
    })
  })
})

describe("ClientManager.fetchAcrossIdentitySwitch", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    clientManager = new ClientManager({
      queryClient,
      agentOptions: { host: "https://icp-api.io" },
    })
    clientManager.registerCanisterId(CANISTER_ID)
  })

  it("runs a fetch of its own again when a switch cancels it", async () => {
    const answers = [deferred<string>(), deferred<string>()]
    let run = 0
    const queryFn = () => answers[run++].promise

    const pending = clientManager.fetchAcrossIdentitySwitch(() =>
      queryClient.fetchQuery({ queryKey: [CANISTER_ID, "profile"], queryFn })
    )
    await vi.waitFor(() => expect(run).toBe(1))
    clientManager.updateAgent(Ed25519KeyIdentity.generate())
    await vi.waitFor(() => expect(run).toBe(2))
    answers[1].resolve("bob")

    await expect(pending).resolves.toBe("bob")
  })

  /**
   * TanStack does not reject a cancelled fetch of an entry that held data
   * before the fetch began: it puts that data back and resolves the fetch
   * with it. After a switch, that data is the previous principal's.
   */
  it("runs a fetch of a cached entry again when a switch puts the old data back", async () => {
    const key = [CANISTER_ID, "profile"]
    queryClient.setQueryData(key, "alice's profile")
    const answers: Array<(value: string) => void> = []
    const queryFn = () =>
      new Promise<string>((resolve) => answers.push(resolve))

    const pending = clientManager.fetchAcrossIdentitySwitch(() =>
      queryClient.fetchQuery({ queryKey: key, queryFn, staleTime: 0 })
    )
    await vi.waitFor(() => expect(answers).toHaveLength(1))
    clientManager.updateAgent(Ed25519KeyIdentity.generate())
    await vi.waitFor(() => expect(answers).toHaveLength(2))
    answers[1]("bob's profile")

    await expect(pending).resolves.toBe("bob's profile")
  })

  it("does the same for the infinite query in its example", async () => {
    const key = [CANISTER_ID, "feed"]
    const answers: Array<(value: string) => void> = []
    const options = {
      queryKey: key,
      queryFn: () => new Promise<string>((resolve) => answers.push(resolve)),
      initialPageParam: 0,
      getNextPageParam: () => undefined,
      staleTime: 0,
    }
    const first = queryClient.fetchInfiniteQuery(options)
    answers[0]("alice's page")
    await first

    const pending = clientManager.fetchAcrossIdentitySwitch(() =>
      queryClient.fetchInfiniteQuery(options)
    )
    await vi.waitFor(() => expect(answers).toHaveLength(2))
    clientManager.updateAgent(Ed25519KeyIdentity.generate())
    await vi.waitFor(() => expect(answers).toHaveLength(3))
    answers[2]("bob's page")

    await expect(pending).resolves.toMatchObject({ pages: ["bob's page"] })
  })

  it("rejects with a CallError when every run is overtaken by a switch", async () => {
    // Each run resolves only after a switch, as a fetch that TanStack
    // resolves with the data it put back does.
    const runs: Array<(value: string) => void> = []
    const pending = clientManager.fetchAcrossIdentitySwitch(
      () => new Promise<string>((resolve) => runs.push(resolve))
    )
    const settled = pending.catch((error: unknown) => error)
    for (let run = 1; run <= 4; run++) {
      await vi.waitFor(() => expect(runs).toHaveLength(run))
      clientManager.updateAgent(Ed25519KeyIdentity.generate())
      runs[run - 1]("someone's profile")
    }

    const error = await settled
    expect(error).toBeInstanceOf(CallError)
    expect((error as CallError).cause).toBeUndefined()
    expect(runs).toHaveLength(4)
  })

  it("passes on what a fetch settles with while the principal stays", async () => {
    const alice = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(alice)
    const key = [CANISTER_ID, "profile"]
    queryClient.setQueryData(key, "alice's profile")
    let runs = 0
    const pending = clientManager.fetchAcrossIdentitySwitch(() => {
      runs++
      return queryClient.fetchQuery({
        queryKey: key,
        queryFn: () => new Promise<string>(() => {}),
        staleTime: 0,
      })
    })
    await vi.waitFor(() => expect(runs).toBe(1))
    // A renewal, then the app's own cancellation.
    clientManager.updateAgent(alice)
    void queryClient.cancelQueries({ queryKey: key })

    // TanStack settles it with the data it put back, still alice's, or, in
    // releases before that, with a CancelledError. Either is passed on.
    const outcome = await pending.catch((error: unknown) => error)
    expect(
      outcome === "alice's profile" || outcome instanceof CancelledError
    ).toBe(true)
    expect(runs).toBe(1)
  })
})
