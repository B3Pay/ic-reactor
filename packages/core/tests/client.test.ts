/**
 * `createClient`: who calls, how the client follows its auth, and what it
 * releases. The agents and the calls they send are in
 * `client-agents.test.ts`; the cache's dehydration in
 * `client-hydration.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import {
  createClient,
  internalsOf,
  type AuthLike,
  type Client,
  type ClientOptions,
} from "../src/client.js"
import {
  classifyError,
  createReactorError,
  isReactorError,
  retryQuery,
} from "../src/errors.js"
import { createTestAuth, type TestAuth } from "../src/testing/test-auth.js"
import {
  ANONYMOUS,
  CALL,
  networkOf,
  onPage,
  readAs,
  replicaWithWhoami,
} from "./client-helpers.js"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** A client in a browser page, signed in through `auth`. */
function clientOf(auth: AuthLike): Client {
  onPage()
  const replica = replicaWithWhoami()
  return createClient({
    network: networkOf(replica),
    fetch: replica.fetch,
    auth: () => auth,
  })
}

describe("createClient options", () => {
  it("refuses options that do not say who calls, or say it twice", () => {
    const identity = Ed25519KeyIdentity.generate()
    const options = (extra: object) =>
      ({ network: "ic", ...extra }) as unknown as ClientOptions

    expect(() => createClient(options({}))).toThrow(
      /needs to know who calls: identity: "anonymous"/
    )
    expect(() =>
      createClient(options({ identity, auth: () => createTestAuth() }))
    ).toThrow(/identity or auth, not both/)
    expect(() => createClient(options({ auth: createTestAuth() }))).toThrow(
      /auth is a factory/
    )
    expect(() => createClient(options({ identity: "anon" }))).toThrow(
      /identity is an Identity/
    )
    expect(() => createClient(null as unknown as ClientOptions)).toThrow(
      TypeError
    )
  })

  it("refuses a network host the agent cannot read when the client is built", () => {
    expect(() =>
      createClient({ network: { host: "not a url" }, identity: "anonymous" })
    ).toThrow(/"not a url" is not a URL the agent can read/)
  })

  it("passes maxDepth on, 256 unless given, and refuses one candid-core would refuse", () => {
    const at = (maxDepth?: number) =>
      internalsOf(
        createClient({ network: "ic", identity: "anonymous", maxDepth })
      ).maxDepth

    expect(at()).toBe(256)
    expect(at(1_024)).toBe(1_024)
    expect(at(0)).toBe(0)
    for (const bad of [-1, 1.5, NaN, Infinity, "256"]) {
      expect(() => at(bad as number)).toThrow(/maxDepth is a non-negative/)
    }
  })

  it("names the network by its key segment", () => {
    expect(createClient({ network: "ic", identity: "anonymous" }).network).toBe(
      "ic"
    )
    expect(
      createClient({
        network: { host: "http://127.0.0.1:4943", name: "dev" },
        identity: "anonymous",
      }).network
    ).toBe("dev")
  })

  it("keeps its internals off the client object", () => {
    const client = createClient({ network: "ic", identity: "anonymous" })

    expect(Object.keys(client).sort()).toEqual([
      "authState",
      "caller",
      "canister",
      "dispose",
      "func",
      "mutationOptions",
      "network",
      "queryClient",
      "queryKey",
      "queryOptions",
      "signIn",
      "signOut",
      "subscribe",
    ])
    expect(Object.isFrozen(client)).toBe(true)
    expect(() => internalsOf({ ...client })).toThrow(
      /expected a client made by createClient/
    )
  })
})

describe("a client built with an identity", () => {
  it('calls anonymously and may not write with identity: "anonymous"', () => {
    const client = createClient({ network: "ic", identity: "anonymous" })

    expect(client.caller()).toBe(ANONYMOUS)
    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    expect(internalsOf(client).current()).toEqual({
      principal: ANONYMOUS,
      authenticated: false,
    })
  })

  it("may write as the anonymous principal only with an explicit AnonymousIdentity", () => {
    const client = createClient({
      network: "ic",
      identity: new AnonymousIdentity(),
    })

    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    expect(internalsOf(client).current()).toEqual({
      principal: ANONYMOUS,
      authenticated: true,
    })
  })

  it("calls as a signing identity, signed in", () => {
    const identity = Ed25519KeyIdentity.generate()
    const principal = identity.getPrincipal().toText()
    const client = createClient({ network: "ic", identity })

    expect(client.caller()).toBe(principal)
    expect(client.authState()).toEqual({ status: "signed-in", principal })
    expect(internalsOf(client).current()).toEqual({
      principal,
      authenticated: true,
    })
  })

  it("has no sign-in: signIn and signOut reject a TypeError that names the fix", async () => {
    const client = createClient({ network: "ic", identity: "anonymous" })

    await expect(client.signIn()).rejects.toThrow(TypeError)
    await expect(client.signIn()).rejects.toThrow(
      /built with identity.*auth: \(\) => new AuthClient\(\)/
    )
    await expect(client.signOut()).rejects.toThrow(TypeError)
  })
})

describe("a client on a server", () => {
  it("never builds its auth, and is anonymous", async () => {
    expect(typeof window).toBe("undefined")
    const factory = vi.fn(() => createTestAuth({ seed: 1 }))
    const client = createClient({ network: "ic", auth: factory })

    expect(client.caller()).toBe(ANONYMOUS)
    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    client.subscribe(() => {})
    expect(internalsOf(client).current()).toEqual({
      principal: ANONYMOUS,
      authenticated: false,
    })
    await internalsOf(client).agentFor(ANONYMOUS, CALL)
    await expect(client.signIn()).rejects.toThrow(/only in a browser/)
    await expect(client.signOut()).rejects.toThrow(/only in a browser/)
    client.dispose()

    expect(factory).not.toHaveBeenCalled()
  })
})

describe("a client following its auth in a browser", () => {
  it("builds the auth once, on first use, and not before", () => {
    onPage()
    const factory = vi.fn(() => createTestAuth({ seed: 1 }))
    const client = createClient({ network: "ic", auth: factory })

    expect(factory).not.toHaveBeenCalled()
    client.caller()
    client.authState()
    client.subscribe(() => {})
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it("refuses a factory that returns something other than an auth, naming what is missing", () => {
    onPage()
    const client = createClient({
      network: "ic",
      auth: () => ({ getStatus: () => ({ state: "signed-out" }) }) as never,
    })

    expect(() => client.caller()).toThrow(
      /not an AuthLike: it has no getPrincipal\(\), getIdentity\(\), subscribe\(\), signIn\(\), signOut\(\)/
    )
  })

  it("calls as the auth's principal only while it is signed in", () => {
    const auth = createTestAuth({ seed: 1 })
    const alice = auth.getPrincipal()!.toText()
    const client = clientOf(auth)
    const current = () => internalsOf(client).current()

    expect(client.caller()).toBe(alice)
    expect(client.authState()).toEqual({
      status: "signed-in",
      principal: alice,
    })
    expect(current()).toEqual({ principal: alice, authenticated: true })

    // An expired session and one held by a sibling origin name the account in
    // the auth's status, but neither can sign a call.
    auth.expire()
    expect(client.authState()).toEqual({
      status: "expired",
      principal: ANONYMOUS,
    })
    expect(current()).toEqual({ principal: ANONYMOUS, authenticated: false })

    auth.elsewhere()
    expect(client.authState()).toEqual({
      status: "signed-in-elsewhere",
      principal: ANONYMOUS,
    })
    expect(current()).toEqual({ principal: ANONYMOUS, authenticated: false })

    void auth.signOut()
    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    expect(client.caller()).toBe(ANONYMOUS)
  })

  it("calls anonymously in a state it does not know, and for a signed-in anonymous principal", () => {
    let state = "restoring"
    const auth = {
      ...createTestAuth({ identity: new AnonymousIdentity() }),
      getStatus: () => ({ state }) as never,
    }
    const client = clientOf(auth)

    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    state = "signed-in"
    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    expect(internalsOf(client).current().authenticated).toBe(false)
  })

  it("tells its listeners once about a sign-out in another tab, and calls anonymously after it", () => {
    const auth = createTestAuth({ seed: 1 })
    const client = clientOf(auth)
    const listener = vi.fn()
    client.subscribe(listener)

    // What another tab's sign-out looks like here: the auth notifies on its own.
    void auth.signOut()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(client.caller()).toBe(ANONYMOUS)
    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
  })

  it("passes a notification on only when the status or the principal changed", () => {
    const auth = createTestAuth({ seed: 1 })
    const alice = auth.getStatus()
    const client = clientOf(auth)
    const listener = vi.fn()
    client.subscribe(listener)
    const signedIn = client.authState()

    // A new sign-in as the same account notifies the auth's listeners with a
    // new status object, but the client calls as the same principal.
    void auth.signIn()
    expect(auth.getStatus()).not.toBe(alice)
    expect(listener).not.toHaveBeenCalled()
    expect(client.authState()).toBe(signedIn)

    auth.switchTo(2)
    expect(listener).toHaveBeenCalledTimes(1)
    const switched = client.authState()
    expect(switched).not.toBe(signedIn)
    expect(client.authState()).toBe(switched)

    auth.expire()
    auth.elsewhere()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it("returns the same state object until the state changes, even when the auth changed without notifying", () => {
    let state: "signed-in" | "signed-out" = "signed-in"
    let notify = () => {}
    const identity = Ed25519KeyIdentity.generate()
    const auth: AuthLike = {
      getPrincipal: () =>
        state === "signed-in" ? identity.getPrincipal() : undefined,
      getStatus: () => ({ state }),
      getIdentity: () => Promise.resolve(identity),
      subscribe(listener) {
        notify = listener
        return () => {}
      },
      signIn: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
    }
    const client = clientOf(auth)
    const listener = vi.fn()
    client.subscribe(listener)
    const before = client.authState()

    state = "signed-out"
    const after = client.authState()
    expect(after).not.toBe(before)
    expect(after).toEqual({ status: "anonymous", principal: ANONYMOUS })
    expect(client.authState()).toBe(after)
    expect(listener).not.toHaveBeenCalled()

    // The next notification tells the listeners, who have not heard of it.
    notify()
    expect(listener).toHaveBeenCalledTimes(1)
    notify()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("forwards signIn and signOut to the auth, and tells its listeners even if the auth does not", async () => {
    let state: "signed-in" | "signed-out" = "signed-out"
    const identity = Ed25519KeyIdentity.generate()
    const signIn = vi.fn((_options?: unknown) => {
      state = "signed-in"
      return Promise.resolve()
    })
    const signOut = vi.fn((_options?: unknown) => {
      state = "signed-out"
      return Promise.resolve()
    })
    const client = clientOf({
      getPrincipal: () =>
        state === "signed-in" ? identity.getPrincipal() : undefined,
      getStatus: () => ({ state }),
      getIdentity: () => Promise.resolve(identity),
      // An auth that never notifies.
      subscribe: () => () => {},
      signIn,
      signOut,
    })
    const listener = vi.fn()
    client.subscribe(listener)

    await client.signIn({ maxTimeToLive: 1n })
    expect(signIn).toHaveBeenCalledWith({ maxTimeToLive: 1n })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(client.caller()).toBe(identity.getPrincipal().toText())

    await client.signOut({ returnTo: "https://app.example/bye" })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledWith({
      returnTo: "https://app.example/bye",
    })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(client.caller()).toBe(ANONYMOUS)
  })

  it("keeps telling the other listeners when one throws, and reports the error", () => {
    const queued: Array<() => void> = []
    vi.stubGlobal("queueMicrotask", (task: () => void) => queued.push(task))
    const auth = createTestAuth({ seed: 1 })
    const client = clientOf(auth)
    const bug = new Error("listener bug")
    const after = vi.fn()
    client.subscribe(() => {
      throw bug
    })
    client.subscribe(after)

    void auth.signOut()

    expect(after).toHaveBeenCalledTimes(1)
    expect(queued).toHaveLength(1)
    expect(() => queued[0]!()).toThrow(bug)
  })

  it("stops telling a listener once it unsubscribes", () => {
    const auth = createTestAuth({ seed: 1 })
    const client = clientOf(auth)
    const listener = vi.fn()
    const unsubscribe = client.subscribe(listener)

    unsubscribe()
    auth.switchTo(2)

    expect(listener).not.toHaveBeenCalled()
  })
})

describe("two clients", () => {
  it("share no QueryClient and no agent", async () => {
    const replica = replicaWithWhoami()
    const identity = Ed25519KeyIdentity.generate()
    const principal = identity.getPrincipal().toText()
    const options = {
      network: networkOf(replica),
      fetch: replica.fetch,
      identity,
    }
    const first = createClient(options)
    const second = createClient(options)

    expect(first.queryClient).not.toBe(second.queryClient)
    first.queryClient.setQueryData(["balance"], 1n)
    expect(second.queryClient.getQueryData(["balance"])).toBeUndefined()
    second.queryClient.setQueryData(["balance"], 2n)

    const firstAgent = await internalsOf(first).agentFor(principal, CALL)
    const secondAgent = await internalsOf(second).agentFor(principal, CALL)
    expect(firstAgent).not.toBe(secondAgent)

    // Disposing one (the end of one request) leaves the other as it was.
    first.dispose()
    expect(second.queryClient.getQueryData(["balance"])).toBe(2n)
    await expect(internalsOf(second).agentFor(principal, CALL)).resolves.toBe(
      secondAgent
    )
  })
})

// A query built by hand on `client.queryClient` (a `useQuery` with its own
// query function) sets no `retry`, so the client's default decides. The
// default must never be TanStack's own: three retries in a browser, of any
// failure, a canister's Err included.
describe("the QueryClient's default retry", () => {
  /** A client whose reads go to a fake replica, and a query function for it. */
  function anonymousReader() {
    const replica = replicaWithWhoami()
    const client = createClient({
      network: networkOf(replica),
      fetch: replica.fetch,
      identity: "anonymous",
    })
    // As a read's query function does it: the failure is classified as a query's.
    const queryFn = vi.fn(async () => {
      try {
        return await readAs(client, ANONYMOUS)
      } catch (error) {
        throw classifyError(error, { ...CALL, mode: "query" })
      }
    })
    const queries = (): number =>
      replica.requests.filter((request) => request.endpoint === "query").length
    return { replica, client, queryFn, queries }
  }

  it("is the client's retry predicate", () => {
    const { client } = anonymousReader()

    expect(client.queryClient.getDefaultOptions().queries?.retry).toBe(
      retryQuery
    )
  })

  it("tries a read again in a browser page when the replica refused it for now", async () => {
    onPage()
    const { replica, client, queryFn, queries } = anonymousReader()
    replica.refuseNext(503)

    await expect(
      client.queryClient.fetchQuery({
        queryKey: ["whoami"],
        queryFn,
        retryDelay: 0,
      })
    ).resolves.toBe(ANONYMOUS)
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(queries()).toBe(2)
  })

  it("never tries again a read whose canister answered with an Err", async () => {
    onPage()
    const { client } = anonymousReader()
    const queryFn = vi.fn(() =>
      Promise.reject(
        createReactorError("canister_err", {
          ...CALL,
          err: { InsufficientFunds: null },
        })
      )
    )

    await expect(
      client.queryClient.fetchQuery({
        queryKey: ["balance"],
        queryFn,
        retryDelay: 0,
      })
    ).rejects.toMatchObject({ kind: "canister_err" })
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it("never tries a read again on a server, where it fails fast", async () => {
    const { replica, client, queryFn, queries } = anonymousReader()
    replica.refuseNext(503)

    await expect(
      client.queryClient.fetchQuery({
        queryKey: ["whoami"],
        queryFn,
        retryDelay: 0,
      })
    ).rejects.toMatchObject({ kind: "not_delivered", httpStatus: 503 })
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(queries()).toBe(1)
  })
})

describe("dispose", () => {
  function disposable() {
    const auth: TestAuth = createTestAuth({ seed: 1 })
    const disposeAuth = vi.spyOn(auth, "dispose")
    const client = clientOf(auth)
    return { auth, disposeAuth, client }
  }

  it("releases the auth, the cache and the listeners, and a second call does nothing", () => {
    const { auth, disposeAuth, client } = disposable()
    const listener = vi.fn()
    client.subscribe(listener)
    client.queryClient.setQueryData(["balance"], 1n)
    expect(auth.listenerCount).toBe(1)

    client.dispose()
    client.dispose()

    expect(disposeAuth).toHaveBeenCalledTimes(1)
    expect(auth.listenerCount).toBe(0)
    expect(client.queryClient.getQueryCache().getAll()).toEqual([])
    expect(client.caller()).toBe(ANONYMOUS)
    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    expect(listener).not.toHaveBeenCalled()
  })

  it("cancels every call asked for afterwards, before it is sent", async () => {
    const { auth, client } = disposable()
    const alice = auth.getPrincipal()!.toText()
    client.dispose()

    for (const principal of [alice, ANONYMOUS]) {
      const error = await internalsOf(client)
        .agentFor(principal, CALL)
        .catch((e: unknown) => e)
      expect(isReactorError(error)).toBe(true)
      expect(error).toMatchObject({
        kind: "cancelled",
        code: "client_disposed",
        mayHaveExecuted: false,
      })
    }
  })

  it("adds no listener afterwards, and refuses to sign in or out", async () => {
    const { auth, client } = disposable()
    client.dispose()
    const listener = vi.fn()

    const unsubscribe = client.subscribe(listener)
    auth.switchTo(2)

    expect(listener).not.toHaveBeenCalled()
    expect(unsubscribe).not.toThrow()
    await expect(client.signIn()).rejects.toThrow(/disposed client/)
    await expect(client.signOut()).rejects.toThrow(/disposed client/)
  })

  it("never builds an auth it has not built yet", () => {
    onPage()
    const factory = vi.fn(() => createTestAuth())
    const client = createClient({ network: "ic", auth: factory })

    client.dispose()
    client.caller()
    client.subscribe(() => {})

    expect(factory).not.toHaveBeenCalled()
  })
})

describe("the stamps ReactorProvider reads", () => {
  // An internal contract with @ic-reactor/react (see `CLIENTS_CREATED` in
  // src/client.ts): the provider owns a client only if its serial is above
  // the count it read before calling its factory.
  const CREATED = Symbol.for("ic-reactor.clients.created")
  const SERIAL = Symbol.for("ic-reactor.client.serial")
  const DISPOSED = Symbol.for("ic-reactor.client.disposed")
  const created = (): unknown =>
    (globalThis as { [CREATED]?: unknown })[CREATED]
  const stamp = (client: Client, key: symbol): unknown =>
    (client as unknown as Record<symbol, unknown>)[key]
  const anonymous = () => createClient({ network: "ic", identity: "anonymous" })

  it("numbers each client one above the realm's count, and keeps the count on globalThis", () => {
    const first = anonymous()
    const second = anonymous()
    const third = createClient({ network: "ic", auth: () => createTestAuth() })

    expect(typeof stamp(first, SERIAL)).toBe("number")
    expect(stamp(second, SERIAL)).toBe((stamp(first, SERIAL) as number) + 1)
    expect(stamp(third, SERIAL)).toBe((stamp(first, SERIAL) as number) + 2)
    expect(created()).toBe(stamp(third, SERIAL))
  })

  it("counts the clients of two copies of the package together", async () => {
    const before = anonymous()
    vi.resetModules()
    const { createClient: createFromCopy } = await import("../src/client.js")
    expect(createFromCopy).not.toBe(createClient)

    const fromCopy = createFromCopy({ network: "ic", identity: "anonymous" })
    const after = anonymous()

    expect(stamp(fromCopy, SERIAL)).toBe((stamp(before, SERIAL) as number) + 1)
    expect(stamp(after, SERIAL)).toBe((stamp(before, SERIAL) as number) + 2)
  })

  it("keeps the stamps out of sight: not enumerable, not writable, not copied by a spread", () => {
    const client = anonymous()

    expect(Object.getOwnPropertyDescriptor(client, SERIAL)).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    })
    expect(Object.getOwnPropertyDescriptor(client, DISPOSED)).toMatchObject({
      enumerable: false,
      configurable: false,
    })
    expect(Object.keys(client)).not.toContain(SERIAL)
    expect(Object.getOwnPropertySymbols({ ...client })).toEqual([])
    expect(
      Object.getOwnPropertyDescriptor(globalThis, CREATED)?.enumerable
    ).toBe(false)
  })

  it("says whether the client was disposed", () => {
    const client = anonymous()
    expect(stamp(client, DISPOSED)).toBe(false)

    client.dispose()

    expect(stamp(client, DISPOSED)).toBe(true)
  })
})

describe('network: "env" outside a browser page', () => {
  /** A fresh copy of the module, so its once-per-process warning is unspent. */
  async function freshCreateClient() {
    vi.resetModules()
    return (await import("../src/client.js")).createClient
  }

  it("warns once per process in development, naming the fix", async () => {
    const create = await freshCreateClient()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    create({ network: "env", identity: "anonymous" })
    create({ network: "env", identity: "anonymous" })

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toMatch(
      /no ic_env cookie.*canister_id_unresolved.*by \{ id \}/
    )
  })

  it("does not warn in production, in a browser page, or for another network", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    vi.stubEnv("NODE_ENV", "production")
    ;(await freshCreateClient())({ network: "env", identity: "anonymous" })
    vi.unstubAllEnvs()

    onPage()
    ;(await freshCreateClient())({ network: "env", identity: "anonymous" })
    vi.unstubAllGlobals()

    ;(await freshCreateClient())({ network: "ic", identity: "anonymous" })

    expect(warn).not.toHaveBeenCalled()
  })
})
