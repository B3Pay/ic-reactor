/**
 * The events of a session a client meets without anyone signing in or out:
 * a session that ends by the clock, a change a read notices before any
 * notification, an auth factory that throws (`new AuthClient()` reads
 * `localStorage`, which throws where site data is blocked), and one that
 * returns a Promise instead of an auth.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { principal } from "@meantjs/schema"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { createClient, type AuthLike, type Client } from "../src/client.js"
import { isReactorError } from "../src/errors.js"
import { createTestAuth } from "../src/testing/test-auth.js"
import {
  ANONYMOUS,
  SHAPES,
  clientAs,
  clientWithAuth,
  onPage,
  replicaWith,
  serve,
} from "./canister-helpers.js"
import * as shapes from "./fixtures/shapes.js"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** How long a test sign-in lasts: eight hours. */
const SESSION_MS = 8 * 60 * 60 * 1000

/** The longest delay `setTimeout` keeps. */
const MAX_TIMER_MS = 2 ** 31 - 1

const replicaOf = () =>
  replicaWith({
    [SHAPES]: serve<shapes.Actor>(shapes.actor, {
      who: (_args, { caller }) => principal(caller),
      bump: ([n]) => ({ tag: "ok", value: n + 1n }),
    }),
  })

/** An auth that says what `status` says, and notifies only when told to. */
function authSaying(status: () => ReturnType<AuthLike["getStatus"]>) {
  const identity = Ed25519KeyIdentity.generate()
  let notify = () => {}
  const auth: AuthLike = {
    getPrincipal: () =>
      status().state === "signed-in" ? identity.getPrincipal() : undefined,
    getStatus: status,
    getIdentity: () => Promise.resolve(identity),
    subscribe(listener) {
      notify = listener
      return () => {
        notify = () => {}
      }
    },
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  }
  return { auth, principal: identity.getPrincipal().toText(), notify }
}

describe("a session that ends by the clock", () => {
  it("tells the client's listeners when it ends, with no notification of the auth", () => {
    vi.useFakeTimers()
    const auth = createTestAuth({ seed: 1 })
    const alice = auth.getPrincipal()!.toText()
    const client = clientWithAuth(replicaOf(), auth)
    const listener = vi.fn()
    client.subscribe(listener)
    expect(client.authState()).toEqual({
      status: "signed-in",
      principal: alice,
      expiresAt: Date.now() + SESSION_MS,
    })

    vi.advanceTimersByTime(SESSION_MS - 1)
    expect(listener).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(client.authState()).toEqual({
      status: "expired",
      principal: ANONYMOUS,
    })
    expect(client.caller()).toBe(ANONYMOUS)
    // The auth told nobody, as `AuthClient` tells nobody.
    expect(auth.getStatus().state).toBe("expired")
    client.dispose()
  })

  it("reaches a deadline past setTimeout's longest delay in steps, telling nobody early", () => {
    vi.useFakeTimers()
    // A longer delay fires at once in a browser and in Node; fake timers keep
    // it, so the delays asked for are checked too.
    const set = vi.spyOn(globalThis, "setTimeout")
    const end = Date.now() + MAX_TIMER_MS + 1000
    const { auth } = authSaying(() =>
      Date.now() >= end
        ? { state: "expired", expiresAtMs: end }
        : { state: "signed-in", expiresAtMs: end }
    )
    onPage()
    const client = createClient({ network: "ic", auth: () => auth })
    const listener = vi.fn()
    client.subscribe(listener)
    expect(client.authState().expiresAt).toBe(end)

    vi.advanceTimersByTime(MAX_TIMER_MS)
    expect(listener).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(1000)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(client.authState().status).toBe("expired")
    expect(vi.getTimerCount()).toBe(0)
    expect(set.mock.calls.map(([, delay]) => delay)).toEqual([
      MAX_TIMER_MS,
      1000,
    ])
    client.dispose()
  })

  it("sets no timer for an end that passed while the auth still says signed in", () => {
    vi.useFakeTimers()
    const { auth, principal: signer } = authSaying(() => ({
      state: "signed-in",
      expiresAtMs: Date.now() - 1,
    }))
    onPage()
    const client = createClient({ network: "ic", auth: () => auth })
    const listener = vi.fn()
    client.subscribe(listener)

    expect(client.caller()).toBe(signer)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(SESSION_MS)
    expect(listener).not.toHaveBeenCalled()
    client.dispose()
  })

  it("moves the timer to a new session's end, and drops it on a sign-out and on dispose()", async () => {
    vi.useFakeTimers()
    const auth = createTestAuth({ seed: 1 })
    const client = clientWithAuth(replicaOf(), auth)
    const listener = vi.fn()
    client.subscribe(listener)
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(SESSION_MS / 2)
    auth.switchTo(2)
    listener.mockClear()
    // The first session's end passes, and the second one's is still ahead.
    vi.advanceTimersByTime(SESSION_MS / 2)
    expect(listener).not.toHaveBeenCalled()
    expect(client.authState().status).toBe("signed-in")
    expect(vi.getTimerCount()).toBe(1)

    await client.signOut()
    expect(vi.getTimerCount()).toBe(0)
    await client.signIn()
    expect(vi.getTimerCount()).toBe(1)
    client.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("leaves AuthState.expiresAt out unless signed in through an auth that carries one", () => {
    const auth = createTestAuth({ seed: 1, signedIn: false })
    const client = clientWithAuth(replicaOf(), auth)
    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    expect("expiresAt" in client.authState()).toBe(false)

    void auth.signIn()
    expect(client.authState().expiresAt).toBe(
      (auth.getStatus() as { expiresAtMs: number }).expiresAtMs
    )
    auth.elsewhere()
    expect("expiresAt" in client.authState()).toBe(false)
    client.dispose()

    const fixed = clientAs(replicaOf(), Ed25519KeyIdentity.generate())
    expect("expiresAt" in fixed.authState()).toBe(false)
  })
})

describe("a change a read notices first", () => {
  it("is told to the listeners once, in a microtask, from caller() and from authState()", async () => {
    let state: "signed-in" | "signed-out" = "signed-in"
    const { auth } = authSaying(() => ({ state }))
    onPage()
    const client = createClient({ network: "ic", auth: () => auth })
    const listener = vi.fn()
    client.subscribe(listener)

    // The auth changes and tells nobody.
    state = "signed-out"
    expect(client.caller()).toBe(ANONYMOUS)
    expect(client.caller()).toBe(ANONYMOUS)
    expect(listener).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)

    // Nothing changed since: no more notifications.
    client.caller()
    client.authState()
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)

    state = "signed-in"
    expect(client.authState().status).toBe("signed-in")
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(2)
    client.dispose()
  })
})

describe("an auth factory that throws", () => {
  const blocked = () =>
    new DOMException("The operation is insecure.", "SecurityError")

  function failing(): {
    client: Client
    factory: ReturnType<typeof vi.fn>
    cause: DOMException
    replica: ReturnType<typeof replicaOf>
  } {
    const cause = blocked()
    const factory = vi.fn(() => {
      throw cause
    })
    const replica = replicaOf()
    onPage()
    const client = createClient({
      network: { host: replica.host, rootKey: replica.rootKey },
      fetch: replica.fetch,
      auth: factory,
    })
    return { client, factory, cause, replica }
  }

  it("runs the client anonymous, calls the factory once, and says so once in development", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { client, factory, cause } = failing()

    expect(client.caller()).toBe(ANONYMOUS)
    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    client.subscribe(() => {})
    client.queryOptions(
      client.canister<shapes.Actor>(shapes.actor, { id: SHAPES }),
      "who"
    )
    client.caller()

    expect(factory).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]).toEqual([
      expect.stringMatching(/the auth factory threw/),
      cause,
    ])
    await expect(client.signIn()).rejects.toBe(cause)
    await expect(client.signOut()).rejects.toBe(cause)
    expect(factory).toHaveBeenCalledTimes(1)
    client.dispose()
  })

  it("still answers a public read, and refuses a write as unauthenticated", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { client } = failing()
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })

    await expect(canister.who()).resolves.toBe(ANONYMOUS)
    await expect(
      client.queryClient.fetchQuery(client.queryOptions(canister, "who"))
    ).resolves.toBe(ANONYMOUS)
    const write = await canister.bump(1n).then(
      () => undefined,
      (e: unknown) => e
    )
    expect(isReactorError(write)).toBe(true)
    expect(write).toMatchObject({ kind: "unauthenticated" })
    client.dispose()
  })

  it("logs nothing in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { client } = failing()

    expect(client.caller()).toBe(ANONYMOUS)
    expect(error).not.toHaveBeenCalled()
    client.dispose()
  })
})

describe("an auth factory that returns a Promise", () => {
  // An `async` factory, or `() => AuthClient.create()` of `@icp-sdk/auth` 5
  // and earlier: the factory returns a Promise, not an auth (#972).
  function promising(): { client: Client; factory: ReturnType<typeof vi.fn> } {
    const factory = vi.fn(() => Promise.resolve(createTestAuth({ seed: 1 })))
    onPage()
    const client = createClient({ network: "ic", auth: factory as never })
    return { client, factory }
  }

  it("is called once: the client calls anonymously and says why once in development", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { client, factory } = promising()

    expect(client.caller()).toBe(ANONYMOUS)
    expect(client.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    client.subscribe(() => {})
    client.caller()

    expect(factory).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]).toEqual([
      expect.stringMatching(/the auth factory threw/),
      expect.any(TypeError),
    ])
    client.dispose()
  })

  it("rejects signIn() and signOut() with what the result lacks, and is not called again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { client, factory } = promising()

    await expect(client.signIn()).rejects.toThrow(
      /the auth factory returned something that is not an AuthLike: it has no getPrincipal\(\), getStatus\(\)/
    )
    await expect(client.signOut()).rejects.toBeInstanceOf(TypeError)
    expect(client.caller()).toBe(ANONYMOUS)
    expect(factory).toHaveBeenCalledTimes(1)
    client.dispose()
  })
})
