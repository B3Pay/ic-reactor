/**
 * `createClient`: who calls, how the client follows its auth, and what it
 * releases. The agents and the calls they send are in
 * `client-agents.test.ts`; the cache's dehydration in
 * `client-hydration.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  AnonymousIdentity,
  HttpErrorCode,
  ProtocolError,
} from "@icp-sdk/core/agent"
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
  deferred,
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

  it("refuses an option it does not have, in the options or a network object", () => {
    const build = (options: object) => () =>
      createClient(options as unknown as ClientOptions)

    // The 3.x habit: a host beside the network talked to port 8000.
    expect(
      build({
        network: "local",
        identity: "anonymous",
        host: "http://127.0.0.1:4943",
      })
    ).toThrow(
      new TypeError(
        "[ic-reactor] createClient() has no option host. Its options: network, identity, auth, allowEnvConfig, fetch, maxDepth, maxElements."
      )
    )
    expect(
      build({ network: "ic", identity: "anonymous", allowEnvconfig: true })
    ).toThrow(/^\[ic-reactor\] createClient\(\) has no option allowEnvconfig\./)
    expect(
      build({
        network: "ic",
        identity: "anonymous",
        verifyQuerySignatures: false,
      })
    ).toThrow(/has no option verifyQuerySignatures\./)
    for (const key of ["rootkey", "fetchRootkey"]) {
      expect(
        build({
          network: { host: "https://example.com", [key]: true },
          identity: "anonymous",
        })
      ).toThrow(
        new TypeError(
          `[ic-reactor] a network object has no option ${key}. Its options: host, rootKey, name, fetchRootKey.`
        )
      )
    }
  })

  it("refuses a boolean option that is not a boolean, such as an environment variable's text", () => {
    // On a page, where "false" read as truthy believed the ic_env cookie.
    onPage()
    for (const value of ["false", "true", 0, 1, null]) {
      expect(() =>
        createClient({
          network: "ic",
          identity: "anonymous",
          allowEnvConfig: value as never,
        })
      ).toThrow(
        new TypeError(
          `[ic-reactor] allowEnvConfig is true or false, got ${JSON.stringify(value)}.`
        )
      )
      // "false" read as truthy fetched the root key from a remote host.
      expect(() =>
        createClient({
          network: {
            host: "https://example.com",
            fetchRootKey: value as never,
          },
          identity: "anonymous",
        })
      ).toThrow(
        new TypeError(
          `[ic-reactor] fetchRootKey is true or false, got ${JSON.stringify(value)}.`
        )
      )
    }
    for (const allowEnvConfig of [true, false, undefined]) {
      expect(
        createClient({ network: "ic", identity: "anonymous", allowEnvConfig })
          .network
      ).toBe("ic")
    }
    expect(
      internalsOf(
        createClient({
          network: { host: "https://example.com", fetchRootKey: false },
          identity: "anonymous",
        })
      ).network.fetchRootKey
    ).toBe(false)
  })

  it("refuses a rootKey that is not 133 bytes in a Uint8Array, and a fetch that is not a function", () => {
    const network = (extra: object) =>
      ({ host: "https://example.com", ...extra }) as never

    // The agent's own IC_ROOT_KEY export is hex text: decode it first.
    expect(() =>
      createClient({
        network: network({ rootKey: "ab" }),
        identity: "anonymous",
      })
    ).toThrow(
      new TypeError(
        '[ic-reactor] rootKey is a Uint8Array of 133 bytes (decode hex first), got "ab".'
      )
    )
    expect(() =>
      createClient({
        network: network({ rootKey: new Uint8Array(96) }),
        identity: "anonymous",
      })
    ).toThrow(/rootKey is a Uint8Array of 133 bytes .*, got 96 bytes\.$/)
    expect(() =>
      createClient({
        network: network({ rootKey: null }),
        identity: "anonymous",
      })
    ).toThrow(/rootKey is a Uint8Array of 133 bytes .*, got null\.$/)
    expect(() =>
      createClient({
        network: "ic",
        identity: "anonymous",
        fetch: "fetch" as never,
      })
    ).toThrow("[ic-reactor] fetch is a function, got string.")
    expect(
      internalsOf(
        createClient({
          network: network({ rootKey: new Uint8Array(133).fill(5) }),
          identity: "anonymous",
        })
      ).network.rootKey
    ).toHaveLength(133)
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

  it("passes maxElements on, 1,000,000 unless given, and refuses one candid-core would refuse", () => {
    const at = (maxElements?: number) =>
      internalsOf(
        createClient({ network: "ic", identity: "anonymous", maxElements })
      ).maxElements

    expect(at()).toBe(1_000_000)
    expect(at(5_000_000)).toBe(5_000_000)
    expect(at(0)).toBe(0)
    for (const bad of [-1, 1.5, NaN, Infinity, "1000000"]) {
      expect(() => at(bad as number)).toThrow(/maxElements is a non-negative/)
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
      "canisterId",
      "dispose",
      "encode",
      "func",
      "mutationOptions",
      "network",
      "queryClient",
      "queryKey",
      "queryOptions",
      "resendOf",
      "signIn",
      "signOut",
      "subscribe",
      "time",
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
      /built with identity.*auth: \(network\) => new AuthClient\(network\)/
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
      expiresAt: (auth.getStatus() as { expiresAtMs: number }).expiresAtMs,
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
      getStatus: () => ({ state }),
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

  it("passes a notification on only when the status, the principal or the session's end changed", () => {
    // One instant for both sign-ins, so that their sessions end together.
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now())
    const auth = createTestAuth({ seed: 1 })
    const alice = auth.getStatus()
    const client = clientOf(auth)
    const listener = vi.fn()
    client.subscribe(listener)
    const signedIn = client.authState()

    // A new sign-in as the same account notifies the auth's listeners with a
    // new status object, but the client calls as the same principal, for a
    // session that ends when the last one did.
    void auth.signIn()
    expect(auth.getStatus()).not.toBe(alice)
    expect(listener).not.toHaveBeenCalled()
    expect(client.authState()).toBe(signedIn)

    // One that ends later is a change: `expiresAt` moves.
    now.mockReturnValue(Date.now() + 1000)
    void auth.signIn()
    now.mockRestore()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(client.authState().expiresAt).toBe(signedIn.expiresAt! + 1000)
    listener.mockClear()

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

  /** A signed-out auth whose `signIn` is `signIn`. */
  const authSigningInWith = (signIn: AuthLike["signIn"]): AuthLike => ({
    getPrincipal: () => undefined,
    getStatus: () => ({ state: "signed-out" }),
    getIdentity: () => Promise.resolve(Ed25519KeyIdentity.generate()),
    subscribe: () => () => {},
    signIn,
    signOut: () => Promise.resolve(),
  })

  it("makes one sign-in of two calls with the same options in one run, as StrictMode's double effect makes them", async () => {
    const answer = deferred()
    const signIn = vi.fn((_options?: unknown) => answer.promise)
    const client = clientOf(authSigningInWith(signIn))

    // Each run of the effect builds its own options object.
    const first = client.signIn({ returnTo: "/account" })
    const second = client.signIn({ returnTo: "/account" })

    expect(second).toBe(first)
    expect(signIn).toHaveBeenCalledTimes(1)
    answer.resolve()
    await first
    client.dispose()
  })

  it("signs in again for a call in a later run, or with other options", async () => {
    const signIn = vi.fn((_options?: unknown) => new Promise<void>(() => {}))
    const client = clientOf(authSigningInWith(signIn))

    void client.signIn({ maxTimeToLive: 1n })
    void client.signIn({ maxTimeToLive: 2n })
    // Its one key is another than the last call's, which it only inherits.
    const inherited = Object.create(
      { maxTimeToLive: 2n },
      { maxTimeToIdle: { value: 1n, enumerable: true } }
    ) as object
    void client.signIn(inherited)
    void client.signIn()
    // A second click is another run: it signs in again, and the auth decides
    // which sign-in wins.
    await Promise.resolve()
    void client.signIn()

    expect(signIn.mock.calls).toEqual([
      [{ maxTimeToLive: 1n }],
      [{ maxTimeToLive: 2n }],
      [inherited],
      [undefined],
      [undefined],
    ])
    client.dispose()
  })

  it("joins each sign-in of the run, not only the last, as StrictMode runs two sign-in effects", () => {
    const signIn = vi.fn((_options?: unknown) => new Promise<void>(() => {}))
    const client = clientOf(authSigningInWith(signIn))

    // StrictMode runs the effects of a subtree, then runs them all again.
    const toAccount = client.signIn({ returnTo: "/account" })
    const toWallet = client.signIn({ returnTo: "/wallet" })

    expect(client.signIn({ returnTo: "/account" })).toBe(toAccount)
    expect(client.signIn({ returnTo: "/wallet" })).toBe(toWallet)
    expect(signIn).toHaveBeenCalledTimes(2)
    client.dispose()
  })

  it("ends the run with a promise job, which fake timers do not replace as Jest's replace queueMicrotask", async () => {
    vi.stubGlobal("queueMicrotask", () => {})
    const signIn = vi.fn((_options?: unknown) => new Promise<void>(() => {}))
    const client = clientOf(authSigningInWith(signIn))

    void client.signIn()
    await Promise.resolve()
    void client.signIn()

    expect(signIn).toHaveBeenCalledTimes(2)
    client.dispose()
  })

  it("rejects a sign-in after dispose(), even with the options of one earlier in the run", async () => {
    const signIn = vi.fn((_options?: unknown) => new Promise<void>(() => {}))
    const client = clientOf(authSigningInWith(signIn))
    void client.signIn({ returnTo: "/account" })

    client.dispose()

    await expect(client.signIn({ returnTo: "/account" })).rejects.toThrow(
      "signIn() on a disposed client"
    )
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
// query function) sets no `retry`, so the client's default decides. For a
// ReactorError it must never be TanStack's own (three retries in a browser, of
// any failure, a canister's Err included); any other error is retried as
// TanStack retries it.
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

  it("retries a ReactorError as the client's retry predicate does", () => {
    const { client } = anonymousReader()
    const retry = client.queryClient.getDefaultOptions().queries?.retry
    if (typeof retry !== "function") throw new Error("retry is a predicate")
    const refused = classifyError(
      ProtocolError.fromCode(new HttpErrorCode(503, "busy", [])),
      { ...CALL, mode: "query" }
    )
    const err = createReactorError("canister_err", { ...CALL, err: null })

    for (const page of [false, true]) {
      if (page) onPage()
      for (const error of [refused, err]) {
        for (const failures of [0, 2, 3]) {
          expect(retry(failures, error)).toBe(retryQuery(failures, error))
        }
      }
    }
  })

  // An app's own query on the client's QueryClient, such as a REST call,
  // throws errors that are not ReactorErrors: they are retried as a plain
  // QueryClient retries them (#903).
  it("tries an app's REST query again in a browser page, as TanStack does, up to 3 times", async () => {
    onPage()
    const { client } = anonymousReader()
    const flaky = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue("rest")

    await expect(
      client.queryClient.fetchQuery({
        queryKey: ["rest", "flaky"],
        queryFn: flaky,
        retryDelay: 0,
      })
    ).resolves.toBe("rest")
    expect(flaky).toHaveBeenCalledTimes(2)

    const down = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    await expect(
      client.queryClient.fetchQuery({
        queryKey: ["rest", "down"],
        queryFn: down,
        retryDelay: 0,
      })
    ).rejects.toThrow("Failed to fetch")
    expect(down).toHaveBeenCalledTimes(4)
  })

  it("never tries an app's REST query again on a server, as TanStack does not", async () => {
    const { client } = anonymousReader()
    const down = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))

    await expect(
      client.queryClient.fetchQuery({
        queryKey: ["rest", "down"],
        queryFn: down,
        retryDelay: 0,
      })
    ).rejects.toThrow("Failed to fetch")
    expect(down).toHaveBeenCalledTimes(1)
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
    // A spread copies neither stamp, so a copy is never taken for the client
    // it copies. It does copy the view seam, on purpose (#813): a provider
    // given a copy hydrates as one given the client does.
    expect(Object.getOwnPropertySymbols({ ...client })).toEqual([
      Symbol.for("ic-reactor.client.as"),
    ])
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
