/**
 * What a sign-out, an expired session and a switch of account leave in the
 * client's cache: the new caller's reads and the anonymous ones, and nothing
 * read as anyone else.
 *
 * A key carries its caller, so the next caller's reads never meet the
 * previous one's. Removing the previous one's as well keeps them out of the
 * next person's reach in a shared browser: devtools, a read by key prefix,
 * and a persister that saves the cache.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { principal } from "@meantjs/schema"
import { MutationObserver, onlineManager } from "@tanstack/query-core"
import { KEY_ROOT } from "../src/keys.js"
import { createTestClient } from "../src/testing/index.js"
import { createTestAuth, type TestAuth } from "../src/testing/test-auth.js"
import {
  ANONYMOUS,
  LEDGER,
  SHAPES,
  clientWithAuth,
  deferred,
  replicaWith,
  serve,
} from "./canister-helpers.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * A client on a fake replica whose `who` answers with its caller, signed in
 * as the identity of seed 1 unless `signedIn` is false; a read of `who`; and
 * the callers of the reads its cache holds.
 */
function setUp({ signedIn = true } = {}) {
  const replica = replicaWith({
    [SHAPES]: serve<shapes.Actor>(shapes.actor, {
      who: (_args, { caller }) => principal(caller),
    }),
  })
  const auth = createTestAuth({ seed: 1, signedIn })
  const client = clientWithAuth(replica, auth)
  const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
  const read = () =>
    client.queryClient.fetchQuery(client.queryOptions(canister, "who"))
  const callers = () =>
    client.queryClient
      .getQueryCache()
      .findAll({ queryKey: [KEY_ROOT] })
      .map((query) => query.queryKey[2])
  return { auth, client, read, callers }
}

describe("the cache after the caller changes", () => {
  it("keeps no read of a principal that signed out, and keeps the anonymous ones", async () => {
    const { client, read, callers } = setUp({ signedIn: false })
    await read()
    await client.signIn()
    const alice = client.caller()
    await expect(read()).resolves.toBe(alice)
    expect(callers()).toEqual([ANONYMOUS, alice])

    await client.signOut()

    expect(callers()).toEqual([ANONYMOUS])
    client.dispose()
  })

  it("keeps no read of the account switched away from", async () => {
    const { auth, client, read, callers } = setUp()
    const alice = client.caller()
    await read()

    auth.switchTo(2)
    const bob = client.caller()
    expect(bob).not.toBe(alice)
    expect(callers()).toEqual([])
    await expect(read()).resolves.toBe(bob)
    expect(callers()).toEqual([bob])

    // Switching back reads again: the first account's reads are gone.
    auth.switchTo(1)
    expect(callers()).toEqual([])
    client.dispose()
  })

  it.each(["expire", "elsewhere"] as const)(
    "keeps no read of a session that ends with %s()",
    async (end) => {
      const { auth, client, read, callers } = setUp()
      await read()

      auth[end]()

      expect(client.caller()).toBe(ANONYMOUS)
      expect(callers()).toEqual([])
      client.dispose()
    }
  )

  it("removes them before a listener hears of the change", async () => {
    const { client, read, callers } = setUp()
    await read()
    const seen: unknown[][] = []
    client.subscribe(() => seen.push(callers()))

    await client.signOut()

    expect(seen).toEqual([[]])
    client.dispose()
  })

  it("leaves the app's own queries, and a change of status that keeps the caller", async () => {
    const { auth, client, read, callers } = setUp()
    client.queryClient.setQueryData(["app", "theme"], "dark")
    const alice = client.caller()
    await read()

    // Signing in again as the same account keeps its reads.
    await client.signIn()
    expect(callers()).toEqual([alice])

    auth.expire()
    await read()
    expect(callers()).toEqual([ANONYMOUS])
    // Expired and then held by another tab: anonymous both times.
    auth.elsewhere()
    expect(callers()).toEqual([ANONYMOUS])
    expect(client.queryClient.getQueryData(["app", "theme"])).toBe("dark")
    client.dispose()
  })
})

/**
 * The writes go with the reads. A mutation key of the client's own names no
 * caller, so without this a `useMutation` kept showing the last account's
 * result or error to the next one (an `InsufficientFunds` error carries a
 * balance), and `useMutationState` listed it (#920).
 */
/** Node's `gc()`, present when the worker runs with `--expose-gc`. */
const collectGarbage = (globalThis as { gc?: () => void }).gc

/** ES2021's `WeakRef`, which the tests compile without (ES2020's lib). */
const RealWeakRef = (
  globalThis as unknown as {
    WeakRef?: new <T extends object>(target: T) => { deref(): T | undefined }
  }
).WeakRef

/**
 * A `WeakRef` whose collections the test decides: a real one answers
 * `undefined` at some garbage collection after its target became
 * unreachable, which no test can wait for. `made` lists every reference in
 * order, with how often it was asked for its target; set `gone` and it
 * answers as after a collection.
 */
function fakeWeakRef() {
  const made: { readonly target: object; gone: boolean; asked: number }[] = []
  class Ref {
    readonly #entry: (typeof made)[number]
    constructor(target: object) {
      this.#entry = { target, gone: false, asked: 0 }
      made.push(this.#entry)
    }
    deref(): object | undefined {
      this.#entry.asked++
      return this.#entry.gone ? undefined : this.#entry.target
    }
  }
  return { Ref, made }
}

/**
 * Starts `write` in a runtime whose `WeakRef` is `ref`, or that has none
 * when it is `undefined`. Only until `write` returns, which is after
 * `mutate()` has attached its observer and before anything is sent: Node's
 * own `fetch` makes weak references too, and needs the real one.
 */
function withWeakRef<T>(ref: unknown, write: () => T): T {
  vi.stubGlobal("WeakRef", ref)
  try {
    return write()
  } finally {
    vi.unstubAllGlobals()
  }
}

describe("the writes after the caller changes", () => {
  const made: ReturnType<typeof createTestClient>[] = []
  afterEach(() => {
    for (const test of made.splice(0)) test.client.dispose()
    onlineManager.setOnline(true)
  })

  const BOB = principal("aaaaa-aa")
  /** The key under which a client hands `@ic-reactor/react` a caller's view. */
  const AS_VIEW = Symbol.for("ic-reactor.client.as")
  const transferOf = (amount: bigint): icrc1.TransferArg => ({
    to: { owner: BOB, subaccount: null },
    amount,
    fee: null,
    memo: null,
    from_subaccount: null,
    created_at_time: null,
  })

  /**
   * A test client signed in as seed 1, whose ledger holds 500 for everyone:
   * a transfer of more answers `InsufficientFunds` with that balance, and
   * `hold()` keeps the next transfer's answer back until it is released.
   */
  function setUp() {
    const test = createTestClient({ identity: 1 })
    made.push(test)
    let held: Promise<void> | undefined
    test.mock<icrc1.Actor>(icrc1.actor, LEDGER, {
      icrc1_transfer: async (arg) => {
        const wait = held
        held = undefined
        await wait
        return arg.amount > 500n
          ? {
              tag: "Err",
              value: { tag: "InsufficientFunds", value: { balance: 500n } },
            }
          : { tag: "Ok", value: 7n }
      },
    })
    const { client } = test
    const ledger = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    const cache = client.queryClient.getMutationCache()
    return {
      ...test,
      ledger,
      cache,
      /** A new observer of the ledger's transfer, as a `useMutation` holds one. */
      watch: (options = client.mutationOptions(ledger, "icrc1_transfer")) =>
        new MutationObserver(client.queryClient, options),
      /** What the cache holds: each mutation's status. */
      cached: () => cache.getAll().map(({ state }) => state.status),
      /** Keeps the next transfer's answer back; returns what releases it. */
      hold() {
        const gate = deferred()
        held = gate.promise
        return gate.resolve
      },
      /** How many transfers reached the replica. */
      sent: () =>
        test.requests.filter(
          ({ endpoint, methodName }) =>
            endpoint === "call" && methodName === "icrc1_transfer"
        ).length,
    }
  }

  /** What an observer with nothing to show reports. */
  const idle = {
    status: "idle",
    data: undefined,
    error: null,
    variables: undefined,
  }

  it.each([
    ["a switch of account", (auth: TestAuth) => void auth.switchTo(2)],
    ["a sign-out", (auth: TestAuth) => auth.signOut()],
    ["a session that expires", (auth: TestAuth) => void auth.expire()],
    ["a session held elsewhere", (auth: TestAuth) => void auth.elsewhere()],
  ])(
    "starts a finished write over for whoever shows it, and keeps it out of the cache, after %s",
    async (_, change) => {
      const { auth, watch, cached } = setUp()
      const refused = watch()
      const done = watch()
      await refused.mutate(transferOf(501n)).catch(() => {})
      await done.mutate(transferOf(1n))
      // The first account's own view of them: an error with its balance.
      expect(refused.getCurrentResult()).toMatchObject({
        status: "error",
        error: { err: { tag: "InsufficientFunds", value: { balance: 500n } } },
        variables: { amount: 501n },
      })
      expect(done.getCurrentResult()).toMatchObject({
        status: "success",
        data: 7n,
      })
      const shown: unknown[] = []
      refused.subscribe((result) => shown.push(result.status))

      await change(auth)

      expect(refused.getCurrentResult()).toMatchObject(idle)
      expect(done.getCurrentResult()).toMatchObject(idle)
      // Whoever listens is told, as after the observer's own `reset()`.
      expect(shown).toEqual(["idle"])
      expect(cached()).toEqual([])
    }
  )

  it("starts over the refusal of a write nobody was signed in for, once someone signs in", async () => {
    const { auth, client, watch, cached, sent } = setUp()
    await auth.signOut()
    const observer = watch()
    await observer.mutate(transferOf(1n)).catch(() => {})
    expect(observer.getCurrentResult()).toMatchObject({
      status: "error",
      error: { code: "anonymous_write" },
    })

    await client.signIn()

    expect(observer.getCurrentResult()).toMatchObject(idle)
    expect(cached()).toEqual([])
    expect(sent()).toBe(0)
  })

  it("has done so before a listener hears of the change", async () => {
    const { auth, client, watch, cached } = setUp()
    const observer = watch()
    await observer.mutate(transferOf(501n)).catch(() => {})
    const seen: unknown[] = []
    client.subscribe(() =>
      seen.push([observer.getCurrentResult().status, cached()])
    )

    auth.switchTo(2)

    expect(seen).toEqual([["idle", []]])
  })

  it("starts a write still in flight over at once, keeps it in the cache while it runs, and removes it when it settles", async () => {
    const { auth, watch, cached, hold, sent } = setUp()
    const release = hold()
    const observer = watch()
    const settled = vi.fn()
    const write = observer.mutate(transferOf(1n), { onSettled: settled })
    await vi.waitFor(() => expect(sent()).toBe(1))

    auth.switchTo(2)

    // Nothing of it is shown to the next account, and its run goes on: a
    // pending mutation removed from the cache would never be continued.
    expect(observer.getCurrentResult()).toMatchObject(idle)
    expect(cached()).toEqual(["pending"])

    release()
    // What the write's promise settles with is the first account's to read:
    // the app's own state, if it keeps it. The cache does not.
    await write.catch(() => {})
    expect(cached()).toEqual([])
    expect(observer.getCurrentResult()).toMatchObject(idle)
    // The callbacks given to `mutate()` belong to the observer, which let go.
    expect(settled).not.toHaveBeenCalled()
  })

  it("leaves a write that waits offline in the cache until it runs, refused and then removed, with nothing sent", async () => {
    const { auth, client, watch, cached, sent } = setUp()
    onlineManager.setOnline(false)
    const observer = watch()
    const write = observer.mutate(transferOf(1n))
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().isPaused).toBe(true)
    )

    auth.switchTo(2)

    expect(observer.getCurrentResult()).toMatchObject(idle)
    expect(cached()).toEqual(["pending"])

    onlineManager.setOnline(true)
    void client.queryClient.resumePausedMutations()
    await expect(write).rejects.toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
      mayHaveExecuted: false,
    })
    expect(sent()).toBe(0)
    expect(cached()).toEqual([])
  })

  it("lets the next write of a scope run after one that settles and is removed", async () => {
    const { auth, client, ledger, watch, cached, hold, sent } = setUp()
    const scoped = {
      ...client.mutationOptions(ledger, "icrc1_transfer"),
      scope: { id: "transfers" },
    }
    const release = hold()
    const first = watch(scoped).mutate(transferOf(1n))
    const second = watch(scoped).mutate(transferOf(2n))
    await vi.waitFor(() => expect(sent()).toBe(1))

    auth.switchTo(2)
    expect(cached()).toEqual(["pending", "pending"])

    release()
    await first.catch(() => {})
    // The second waited behind the first; it runs now, as its caller or not
    // at all, and leaves the cache as the first did.
    await expect(second).rejects.toMatchObject({ code: "caller_changed" })
    expect(sent()).toBe(1)
    expect(cached()).toEqual([])
  })

  it("starts over an observer nobody listens to, at the change and not when someone listens again", async () => {
    const { auth, watch, cached } = setUp()
    const observer = watch()
    // A component that is shown: it listens, and its write finishes.
    const hide = observer.subscribe(() => {})
    await observer.mutate(transferOf(501n)).catch(() => {})
    // Hidden (React's `<Activity mode="hidden">`): it stops listening, and
    // TanStack detaches the observer, which keeps what it shows.
    hide()
    expect(observer.getCurrentResult().status).toBe("error")

    auth.switchTo(2)

    // Shown again, a component renders what the observer holds before it
    // listens to it: there is nothing of the last caller's to render.
    expect(observer.getCurrentResult()).toMatchObject(idle)
    expect(cached()).toEqual([])
    const shown: unknown[] = []
    observer.subscribe((result) => shown.push(result.status))
    expect(observer.getCurrentResult()).toMatchObject(idle)
    expect(shown).toEqual([])
  })

  it("does the same for a mutation TanStack collected from the cache while nobody listened", async () => {
    const { auth, watch, cache, cached } = setUp()
    const observer = watch()
    const hide = observer.subscribe(() => {})
    await observer.mutate(transferOf(501n)).catch(() => {})
    hide()
    // What TanStack does `gcTime` after the last observer detached. The
    // observer still shows the mutation, which the cache no longer lists.
    cache.remove(cache.getAll()[0] as never)
    expect(observer.getCurrentResult().status).toBe("error")

    auth.switchTo(2)

    expect(observer.getCurrentResult()).toMatchObject(idle)
    expect(cached()).toEqual([])
  })

  it("tells whoever listens once for each change, however often the observer wrote", async () => {
    const { auth, watch } = setUp()
    const observer = watch()
    const shown: unknown[] = []
    observer.subscribe((result) => shown.push(result.status))
    await observer.mutate(transferOf(1n))
    auth.switchTo(2)
    await observer.mutate(transferOf(1n))
    await observer.mutate(transferOf(1n))
    shown.length = 0

    auth.switchTo(3)
    expect(shown).toEqual(["idle"])

    // It shows nothing now, so the next change has nothing to tell.
    auth.switchTo(4)
    expect(shown).toEqual(["idle"])
  })

  it("leaves alone a write that a listener starts for the next caller while the last one's are started over", async () => {
    const { auth, watch, cached } = setUp()
    const first = watch()
    const second = watch()
    await first.mutate(transferOf(501n)).catch(() => {})
    await second.mutate(transferOf(501n)).catch(() => {})
    // An app that writes again as soon as its form is clear.
    let write: Promise<unknown> | undefined
    first.subscribe((result) => {
      if (result.isIdle) write ??= second.mutate(transferOf(1n))
    })

    auth.switchTo(2)

    expect(first.getCurrentResult()).toMatchObject(idle)
    // Built after the change, it is the next caller's: not started over.
    expect(second.getCurrentResult().status).toBe("pending")
    await write
    expect(second.getCurrentResult()).toMatchObject({
      status: "success",
      data: 7n,
    })
    expect(cached()).toEqual(["success"])
  })

  it("holds each observer through a WeakRef alone, and forgets one that is gone", async () => {
    const refs = fakeWeakRef()
    const { auth, watch } = setUp()
    const write = (observer: ReturnType<typeof watch>) =>
      withWeakRef(refs.Ref, () => observer.mutate(transferOf(1n)))
    const first = watch()
    await write(first)
    await write(first)
    // One reference for an observer, however often it writes.
    expect(refs.made.map(({ target }) => target)).toEqual([first])
    const [held] = refs.made as [(typeof refs.made)[number]]
    // The app lets go of the observer, and the runtime collects it.
    held.gone = true
    const reset = vi.spyOn(first, "reset")

    // The next observer to hold is the moment the client finds out.
    const second = watch()
    await write(second)
    const asked = held.asked
    const third = watch()
    await write(third)
    auth.switchTo(2)

    // Forgotten: not asked for again, and not touched.
    expect(held.asked).toBe(asked)
    expect(reset).not.toHaveBeenCalled()
    expect(refs.made.map(({ target }) => target)).toEqual([
      first,
      second,
      third,
    ])
    expect(second.getCurrentResult()).toMatchObject(idle)
    expect(third.getCurrentResult()).toMatchObject(idle)
  })

  it("holds an observer through the one WeakRef still, after the caller has changed and it writes again", async () => {
    const refs = fakeWeakRef()
    const { auth, watch } = setUp()
    const observer = watch()
    const write = () =>
      withWeakRef(refs.Ref, () => observer.mutate(transferOf(1n)))
    await write()

    // A screen that stays through every change, and writes after each.
    for (const seed of [2, 3, 4]) {
      auth.switchTo(seed)
      expect(observer.getCurrentResult()).toMatchObject(idle)
      await write()
    }

    expect(refs.made.map(({ target }) => target)).toEqual([observer])
  })

  it.skipIf(
    typeof collectGarbage !== "function" || typeof RealWeakRef !== "function"
  )(
    "keeps no observer alive: one the app lets go of is collected",
    async () => {
      const gc = collectGarbage as () => void
      const { watch } = setUp()
      // In a function of its own, so that nothing here keeps the observer.
      const let_go = async () => {
        const observer = watch()
        const unmount = observer.subscribe(() => {})
        await observer.mutate(transferOf(501n)).catch(() => {})
        // An unmounted `useMutation`: nobody listens, nobody holds it.
        unmount()
        return new (RealWeakRef as NonNullable<typeof RealWeakRef>)(observer)
      }
      const ref = await let_go()

      // `deref()` keeps its target for the rest of the task it is called
      // in, so each round collects in a task of its own.
      for (let round = 0; round < 20 && ref.deref() !== undefined; round++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        gc()
      }

      expect(ref.deref()).toBeUndefined()
    }
  )

  it("clears the cache and leaves what an observer shows where the runtime has no WeakRef", async () => {
    // ES2020, the oldest runtime the packages compile for, has nothing to
    // hold an observer with that would not keep it alive.
    const { auth, watch, cached } = setUp()
    const observer = watch()
    await withWeakRef(undefined, () => observer.mutate(transferOf(501n))).catch(
      () => {}
    )

    auth.switchTo(2)

    expect(cached()).toEqual([])
    expect(observer.getCurrentResult().status).toBe("error")
    // The next caller's write replaces it, as any write does.
    await withWeakRef(undefined, () => observer.mutate(transferOf(1n)))
    expect(observer.getCurrentResult()).toMatchObject({
      status: "success",
      data: 7n,
    })
    expect(cached()).toEqual(["success"])
  })

  /** What `useClient()` hands a render: a view of `client` for its caller now. */
  function viewOf(client: ReturnType<typeof setUp>["client"]) {
    const view = (
      client as unknown as Record<symbol, (principal: string) => typeof client>
    )[AS_VIEW]?.call(client, client.caller())
    if (view === undefined) throw new Error("the client makes no view")
    return view
  }

  it("removes the mutation of a press from a render the caller has left, once it is refused", async () => {
    const { auth, client, ledger, cached, sent } = setUp()
    const observer = new MutationObserver(
      client.queryClient,
      viewOf(client).mutationOptions(ledger, "icrc1_transfer")
    )

    auth.switchTo(2)
    // The switch has not reached the render: its handler still presses.
    await expect(observer.mutate(transferOf(1n))).rejects.toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
    })

    expect(sent()).toBe(0)
    // What was pressed with (the last caller's form) is not kept.
    expect(cached()).toEqual([])
  })

  it("leaves such a press in the cache under a key of the app's own", async () => {
    const { auth, client, ledger, cached, sent } = setUp()
    const observer = new MutationObserver(client.queryClient, {
      ...viewOf(client).mutationOptions(ledger, "icrc1_transfer"),
      mutationKey: ["app", "transfer"],
    })

    auth.switchTo(2)
    await expect(observer.mutate(transferOf(1n))).rejects.toMatchObject({
      code: "caller_changed",
    })

    // Refused all the same, and kept where the app put it: that key is the
    // app's to clear.
    expect(sent()).toBe(0)
    expect(cached()).toEqual(["error"])
  })

  it("leaves the app's own mutations, and the writes of a caller who stays", async () => {
    const { auth, client, ledger, watch, cached } = setUp()
    const own = new MutationObserver(client.queryClient, {
      mutationKey: ["app", "save"],
      mutationFn: () => Promise.resolve("saved"),
    })
    await own.mutate()
    // The client's function under a key of the app's is the app's to clear.
    const rekeyed = watch({
      ...client.mutationOptions(ledger, "icrc1_transfer"),
      mutationKey: ["app", "transfer"],
    })
    await rekeyed.mutate(transferOf(1n))
    const observer = watch()
    await observer.mutate(transferOf(1n))

    // Signing in again as the same account changes no caller.
    await client.signIn()
    expect(observer.getCurrentResult().status).toBe("success")
    expect(cached()).toEqual(["success", "success", "success"])

    auth.expire()
    expect(observer.getCurrentResult()).toMatchObject(idle)
    expect(own.getCurrentResult().data).toBe("saved")
    expect(rekeyed.getCurrentResult().data).toBe(7n)
    expect(cached()).toEqual(["success", "success"])

    // Expired and then held by another tab: anonymous both times.
    const again = watch()
    await again.mutate(transferOf(1n)).catch(() => {})
    auth.elsewhere()
    expect(again.getCurrentResult().status).toBe("error")
    expect(cached()).toEqual(["success", "success", "error"])
  })

  it("keeps what the next caller writes", async () => {
    const { auth, watch, cached } = setUp()
    const observer = watch()
    await observer.mutate(transferOf(501n)).catch(() => {})

    auth.switchTo(2)
    await observer.mutate(transferOf(1n))

    expect(observer.getCurrentResult()).toMatchObject({
      status: "success",
      data: 7n,
    })
    expect(cached()).toEqual(["success"])
  })
})
