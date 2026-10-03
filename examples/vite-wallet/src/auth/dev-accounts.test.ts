// Scenario 3: the dev account, an AuthLike of the app's own, on its own.
import { describe, expect, it, vi } from "vitest"
import {
  createDevAccounts,
  DEV_ACCOUNTS_KEY,
  type AccountStorage,
} from "./dev-accounts.ts"

/** An in-memory stand-in for sessionStorage. */
function memoryStorage(): AccountStorage & {
  readonly map: Map<string, string>
} {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

/** A fixed seed per account, so principals are the same in every run. */
const seeds = () => {
  let n = 0
  return () => new Uint8Array(32).fill(++n)
}

describe("dev accounts", () => {
  it("starts signed out, with an anonymous identity", async () => {
    const accounts = createDevAccounts(memoryStorage(), seeds())
    expect(accounts.getStatus()).toEqual({ state: "signed-out" })
    expect(accounts.getPrincipal()).toBeUndefined()
    expect((await accounts.getIdentity()).getPrincipal().toText()).toBe(
      "2vxsx-fae"
    )
  })

  it("signs in as account 1, and hands the client the same identity object every time", async () => {
    const accounts = createDevAccounts(memoryStorage(), seeds())
    await accounts.signIn()
    expect(accounts.getStatus()).toEqual({ state: "signed-in" })
    const principal = accounts.getPrincipal()?.toText()
    expect(principal).toBeDefined()
    const identity = await accounts.getIdentity()
    expect(identity.getPrincipal().toText()).toBe(principal)
    // One agent per identity object: the same object until the account changes.
    expect(await accounts.getIdentity()).toBe(identity)
    expect(accounts.list()).toEqual([{ number: 1, principal }])
    expect(accounts.numberOf(principal ?? "")).toBe(1)
  })

  it("switches accounts with one notification and no signed-out state in between", async () => {
    const accounts = createDevAccounts(memoryStorage(), seeds())
    await accounts.signIn({ account: 1 })
    const first = accounts.getPrincipal()?.toText()
    const seen: string[] = []
    accounts.subscribe(() =>
      seen.push(
        `${accounts.getStatus().state}:${accounts.getPrincipal()?.toText()}`
      )
    )

    await accounts.signIn({ account: 2 })

    const second = accounts.getPrincipal()?.toText()
    expect(second).not.toBe(first)
    expect(seen).toEqual([`signed-in:${second}`])
  })

  it("keeps the keys in storage: a reload signs in as the same principals", async () => {
    const storage = memoryStorage()
    const before = createDevAccounts(storage, seeds())
    await before.signIn({ account: 1 })
    await before.signIn({ account: 2 })
    const principals = before.list().map((a) => a.principal)

    // A reload of the tab: a new object over the same sessionStorage.
    const after = createDevAccounts(storage, () => {
      throw new Error("a reload makes no new key")
    })
    expect(after.getPrincipal()?.toText()).toBe(principals[1])
    expect(after.list().map((a) => a.principal)).toEqual(principals)
    await after.signOut()
    await after.signIn()
    expect(after.getPrincipal()?.toText()).toBe(principals[1])
  })

  it("signs out without forgetting the accounts, and tells listeners once", async () => {
    const accounts = createDevAccounts(memoryStorage(), seeds())
    await accounts.signIn()
    const listener = vi.fn()
    accounts.subscribe(listener)
    await accounts.signOut()
    await accounts.signOut()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(accounts.getStatus()).toEqual({ state: "signed-out" })
    expect(accounts.list()).toHaveLength(1)
  })

  it("refuses an account number that skips one, or is not a number from 1", async () => {
    const accounts = createDevAccounts(memoryStorage(), seeds())
    await expect(accounts.signIn({ account: 3 })).rejects.toThrow(RangeError)
    await expect(accounts.signIn({ account: 0 })).rejects.toThrow(TypeError)
    expect(accounts.getStatus()).toEqual({ state: "signed-out" })
  })

  it("starts over when storage holds something else", () => {
    const storage = memoryStorage()
    storage.setItem(DEV_ACCOUNTS_KEY, '{"seeds":["not hex"],"signedIn":1}')
    const accounts = createDevAccounts(storage, seeds())
    expect(accounts.getStatus()).toEqual({ state: "signed-out" })
    expect(accounts.list()).toEqual([])
  })
})
