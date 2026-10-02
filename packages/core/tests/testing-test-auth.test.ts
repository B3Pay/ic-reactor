/**
 * `createTestAuth` from `@ic-reactor/core/testing`: a sign-in a test
 * controls, shaped like `@icp-sdk/auth` 10's `AuthClient`.
 *
 * What a client built over it relies on is that it is synchronous and
 * consistent: `getStatus()` and `getPrincipal()` are read by a page while it
 * renders, so they cannot be allowed to disagree, and a change must reach a
 * listener exactly once, or a page renders for an account twice or never.
 */
import { describe, it, expect, vi } from "vitest"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import type { Principal } from "@icp-sdk/core/principal"
import {
  createTestAuth,
  type TestAuth,
  type TestAuthStatus,
} from "../src/testing/index.js"

/** Seed 1's principal: it must be the same one in every run, on every machine. */
const SEED_1 = "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
const SEED_2 = "xledz-fktfc-4ywwn-gai5u-ieqce-5x4qc-7lpel-o4ubn-ucngz-7lrzo-5ae"

/** What `getStatus()` and `getPrincipal()` are allowed to say together. */
function expectConsistent(auth: TestAuth) {
  const status = auth.getStatus()
  const principal = auth.getPrincipal()
  if (status.state === "signed-in") {
    expect(principal?.toText()).toBe(status.principal.toText())
  } else {
    expect(principal).toBeUndefined()
  }
}

const principalOf = (status: TestAuthStatus) =>
  status.state === "signed-out" ? undefined : status.principal.toText()

describe("a test auth's sign-in state", () => {
  it("starts signed in as seed 1 by default", () => {
    const auth = createTestAuth()

    expect(auth.getStatus()).toMatchObject({ state: "signed-in" })
    expect(auth.getPrincipal()?.toText()).toBe(SEED_1)
  })

  it("starts signed out when told to, and signs in as the identity it was given", async () => {
    const identity = Ed25519KeyIdentity.generate()
    const auth = createTestAuth({ identity, signedIn: false })

    expect(auth.getStatus()).toEqual({ state: "signed-out" })
    expect(auth.getPrincipal()).toBeUndefined()

    await auth.signIn()

    expect(auth.getPrincipal()?.toText()).toBe(identity.getPrincipal().toText())
    expect(await auth.getIdentity()).toBe(identity)
  })

  it("says who is signed in, and until when, in the form AuthClient does", () => {
    const before = Date.now()
    const status = createTestAuth({ seed: 2 }).getStatus()

    expect(status.state).toBe("signed-in")
    if (status.state !== "signed-in") return
    expect(status.expiresAtMs).toBeGreaterThan(before)
    expect(typeof status.principal.toText()).toBe("string")
  })

  it("agrees between getStatus() and getPrincipal() in every state", async () => {
    const auth = createTestAuth()
    const seen: string[] = []
    const walk = (step: string) => {
      expectConsistent(auth)
      seen.push(`${step}:${auth.getStatus().state}`)
    }

    walk("start")
    auth.expire()
    walk("expire")
    auth.elsewhere()
    walk("elsewhere")
    await auth.signIn(3)
    walk("signIn")
    auth.switchTo(4)
    walk("switchTo")
    await auth.signOut()
    walk("signOut")
    auth.expire()
    walk("expire again")

    expect(seen).toEqual([
      "start:signed-in",
      "expire:expired",
      "elsewhere:signed-in-elsewhere",
      "signIn:signed-in",
      "switchTo:signed-in",
      "signOut:signed-out",
      "expire again:expired",
    ])
  })

  it("agrees inside a listener, which runs after the change", () => {
    const auth = createTestAuth({ seed: 1 })
    const observed: Array<[string, string | undefined]> = []
    auth.subscribe(() => {
      expectConsistent(auth)
      observed.push([auth.getStatus().state, auth.getPrincipal()?.toText()])
    })

    auth.switchTo(2)
    auth.expire()

    expect(observed).toEqual([
      ["signed-in", SEED_2],
      ["expired", undefined],
    ])
  })

  it("returns the same status object until something changes", async () => {
    // A page reads it through `useSyncExternalStore`, which compares by
    // identity.
    const auth = createTestAuth()
    const first = auth.getStatus()

    expect(auth.getStatus()).toBe(first)
    await auth.signOut()
    expect(auth.getStatus()).not.toBe(first)
    expect(auth.getStatus()).toBe(auth.getStatus())
  })
})

describe("a test auth's seeds", () => {
  it("map to the same principal in every run", () => {
    expect(createTestAuth({ seed: 1 }).getPrincipal()?.toText()).toBe(SEED_1)
    expect(createTestAuth({ seed: 1 }).getPrincipal()?.toText()).toBe(SEED_1)
    expect(createTestAuth({ seed: 2 }).getPrincipal()?.toText()).toBe(SEED_2)
  })

  it("map each seed to a principal of its own", () => {
    const principals = [0, 1, 2, 3, 1000, 2 ** 40].map((seed) =>
      createTestAuth({ seed }).getPrincipal()?.toText()
    )

    expect(new Set(principals).size).toBe(principals.length)
  })

  it("make the identity of Ed25519KeyIdentity.generate(), signing for that principal", async () => {
    const auth = createTestAuth({ seed: 5 })
    const identity = await auth.getIdentity()

    expect(identity).toBeInstanceOf(Ed25519KeyIdentity)
    expect(identity.getPrincipal().toText()).toBe(auth.getPrincipal()?.toText())
  })

  it("mean the same thing to signIn() and switchTo() as to the options", async () => {
    const auth = createTestAuth({ seed: 7, signedIn: false })
    const seven = createTestAuth({ seed: 7 }).getPrincipal()?.toText()

    await auth.signIn(7)
    expect(auth.getPrincipal()?.toText()).toBe(seven)
    auth.switchTo(8)
    auth.switchTo(7)
    expect(auth.getPrincipal()?.toText()).toBe(seven)
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "refuse the seed %s",
    (seed) => {
      expect(() => createTestAuth({ seed })).toThrow(RangeError)
      expect(() => createTestAuth().switchTo(seed)).toThrow(RangeError)
    }
  )

  it("refuse both an identity and a seed, as they name who signs in twice", () => {
    expect(() =>
      createTestAuth({
        identity: Ed25519KeyIdentity.generate(),
        // The types refuse this; a caller in JavaScript is told at run time.
        seed: 1,
      } as never)
    ).toThrow(TypeError)
  })
})

describe("a test auth's notifications", () => {
  it("tells a listener exactly once when it switches from one account to another", () => {
    const auth = createTestAuth({ seed: 1 })
    const listener = vi.fn()
    auth.subscribe(listener)
    const before = auth.getPrincipal()?.toText()

    auth.switchTo(2)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(auth.getPrincipal()?.toText()).not.toBe(before)
  })

  it("never shows a listener the signed-out state in between", () => {
    const auth = createTestAuth({ seed: 1 })
    const states: string[] = []
    auth.subscribe(() => states.push(auth.getStatus().state))

    auth.switchTo(2)

    expect(states).toEqual(["signed-in"])
  })

  it("tells a listener once for each change, with no argument", async () => {
    const auth = createTestAuth({ seed: 1 })
    const listener = vi.fn()
    auth.subscribe(listener)

    await auth.signIn(2)
    expect(listener).toHaveBeenCalledTimes(1)
    await auth.signOut()
    expect(listener).toHaveBeenCalledTimes(2)
    await auth.signIn()
    expect(listener).toHaveBeenCalledTimes(3)
    auth.expire()
    expect(listener).toHaveBeenCalledTimes(4)
    auth.elsewhere()
    expect(listener).toHaveBeenCalledTimes(5)
    expect(listener.mock.calls.every((call) => call.length === 0)).toBe(true)
  })

  it("tells nobody when nothing changes", async () => {
    const auth = createTestAuth({ seed: 1, signedIn: false })
    const listener = vi.fn()
    auth.subscribe(listener)

    await auth.signOut()
    expect(listener).not.toHaveBeenCalled()

    auth.expire()
    auth.expire()
    auth.elsewhere()
    auth.elsewhere()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("tells every listener, and stops telling one that unsubscribed", () => {
    const auth = createTestAuth()
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = auth.subscribe(first)
    auth.subscribe(second)

    auth.switchTo(2)
    stopFirst()
    auth.switchTo(3)
    stopFirst()

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
  })

  it("lets a listener unsubscribe itself while it is being told", () => {
    const auth = createTestAuth()
    const later = vi.fn()
    const stop = auth.subscribe(() => stop())
    auth.subscribe(later)

    auth.switchTo(2)
    auth.switchTo(3)

    expect(later).toHaveBeenCalledTimes(2)
    expect(auth.listenerCount).toBe(1)
  })

  it("has changed its status before it tells anyone, so a listener never reads the old one", () => {
    const auth = createTestAuth({ seed: 1 })
    let seen: string | undefined
    auth.subscribe(() => {
      seen = auth.getPrincipal()?.toText()
    })

    auth.switchTo(2)

    expect(seen).toBe(SEED_2)
  })
})

describe("a test auth's states", () => {
  it("reaches expired, naming the account whose session ended", () => {
    const auth = createTestAuth({ seed: 1 })

    auth.expire()

    const status = auth.getStatus()
    expect(status.state).toBe("expired")
    expect(principalOf(status)).toBe(SEED_1)
    if (status.state === "expired") {
      expect(status.expiresAtMs).toBeLessThanOrEqual(Date.now())
    }
    expect(auth.getPrincipal()).toBeUndefined()
  })

  it("reaches signed-in-elsewhere, naming the account and holding no credential for it", async () => {
    const auth = createTestAuth({ seed: 1 })

    auth.elsewhere()

    const status = auth.getStatus()
    expect(status.state).toBe("signed-in-elsewhere")
    expect(principalOf(status)).toBe(SEED_1)
    expect(auth.getPrincipal()).toBeUndefined()
    expect((await auth.getIdentity()).getPrincipal().isAnonymous()).toBe(true)
  })

  it("expires and goes elsewhere for the account it last signed in as, even when signed out", async () => {
    const auth = createTestAuth({ seed: 1 })
    await auth.signOut()

    auth.expire()
    expect(principalOf(auth.getStatus())).toBe(SEED_1)
    await auth.signOut()
    auth.elsewhere()
    expect(principalOf(auth.getStatus())).toBe(SEED_1)
  })

  it("signs in again as the same account after any of them", async () => {
    const auth = createTestAuth({ seed: 1 })

    auth.expire()
    await auth.signIn()
    expect(auth.getPrincipal()?.toText()).toBe(SEED_1)
    auth.elsewhere()
    await auth.signIn()
    expect(auth.getPrincipal()?.toText()).toBe(SEED_1)
  })

  it("remembers the account it switched to for the next signIn()", async () => {
    const auth = createTestAuth({ seed: 1 })

    auth.switchTo(2)
    await auth.signOut()
    await auth.signIn()

    expect(auth.getPrincipal()?.toText()).toBe(SEED_2)
  })

  it("returns the identity it signed in, from signIn() and switchTo()", async () => {
    const identity = Ed25519KeyIdentity.generate()
    const auth = createTestAuth()

    expect(await auth.signIn(identity)).toBe(identity)
    expect(await auth.getIdentity()).toBe(identity)
    const other = Ed25519KeyIdentity.generate()
    expect(auth.switchTo(other)).toBe(other)
    expect(await auth.getIdentity()).toBe(other)
  })
})

describe("a test auth's identity", () => {
  it("is AnonymousIdentity unless someone is signed in, as AuthClient's is", async () => {
    const auth = createTestAuth({ seed: 1, signedIn: false })
    expect(await auth.getIdentity()).toBeInstanceOf(AnonymousIdentity)

    await auth.signIn()
    expect(await auth.getIdentity()).not.toBeInstanceOf(AnonymousIdentity)

    auth.expire()
    expect(await auth.getIdentity()).toBeInstanceOf(AnonymousIdentity)
    await auth.signOut()
    expect(await auth.getIdentity()).toBeInstanceOf(AnonymousIdentity)
  })

  it("signs for the principal getPrincipal() reports", async () => {
    const auth = createTestAuth({ seed: 9 })

    expect((await auth.getIdentity()).getPrincipal().toText()).toBe(
      (auth.getPrincipal() as Principal).toText()
    )
  })
})

describe("disposing a test auth", () => {
  it("releases every listener and tells nobody after", () => {
    const auth = createTestAuth()
    const listener = vi.fn()
    auth.subscribe(listener)
    expect(auth.listenerCount).toBe(1)

    auth.dispose()
    auth.switchTo(2)
    const late = vi.fn()
    const stop = auth.subscribe(late)
    auth.switchTo(3)
    stop()

    expect(auth.disposed).toBe(true)
    expect(auth.listenerCount).toBe(0)
    expect(listener).not.toHaveBeenCalled()
    expect(late).not.toHaveBeenCalled()
  })

  it("can be disposed twice", () => {
    const auth = createTestAuth()

    auth.dispose()

    expect(() => auth.dispose()).not.toThrow()
    expect(auth.disposed).toBe(true)
  })
})
