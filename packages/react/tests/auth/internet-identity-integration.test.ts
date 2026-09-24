/**
 * End-to-end Internet Identity tests against the **real** `@icp-sdk/auth`
 * AuthClient. Nothing in the auth package is mocked — only the browser
 * boundary (`window.open`) is replaced by a fake II that speaks the real
 * ICRC-29 / ICRC-34 / `ii-icrc3-attributes` wire protocol, and the network by
 * a fake replica whose certificates the real agent verifies.
 *
 * The file runs once per supported major (see `vitest.config.ts`): against
 * the `@icp-sdk/auth` devDependency (v10) and against `@icp-sdk/auth-v8`. v10
 * mints its delegation from the Internet Identity canister, so sign-in tests
 * run on a local network, where the fake replica can serve the root key the
 * minting agent trusts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { IDBFactory } from "fake-indexeddb"
import { QueryClient } from "@tanstack/react-query"
import { AuthClient } from "@icp-sdk/auth/client"
import { IDL } from "@icp-sdk/core/candid"
import {
  Ed25519KeyIdentity,
  isDelegationValid,
  type DelegationChain,
} from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "@ic-reactor/core"
import {
  AuthenticationManager,
  IdentityAttributesManager,
} from "../../src/auth/index.js"
import { detectAuthClientFlavor } from "../../src/auth/auth-client-compat.js"
import {
  installFakeIdentityProvider,
  withUserGesture,
  encodeAttributes,
  fromBase64,
  type FakeIdentityProvider,
} from "./fake-identity-provider.js"
import { installFakeReplica, type FakeReplica } from "../../src/testing.js"
import { installFakeWebLocks } from "./fake-web-locks.js"

/** Which major this run resolved `@icp-sdk/auth` to. */
const isV10 = detectAuthClientFlavor(AuthClient) === "session"

const LOCAL_HOST = "http://localhost:4943"

let provider: FakeIdentityProvider
let replica: FakeReplica

/** Names of the canister methods called on `canisterId`, in order. */
const methodsCalled = (canisterId: string) =>
  replica.requests
    .filter((request) => request.canisterId === canisterId)
    .flatMap((request) => (request.methodName ? [request.methodName] : []))
/** Every manager a test built, so the clients they made can be released. */
const managers: AuthenticationManager[] = []

function createManager(
  params: Partial<ConstructorParameters<typeof AuthenticationManager>[0]> = {},
  { network = "local" }: { network?: "local" | "mainnet" } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const clientManager = new ClientManager({
    queryClient,
    agentOptions:
      network === "local"
        ? { host: LOCAL_HOST }
        : { host: "https://icp-api.io", shouldFetchRootKey: false },
  })
  const authentication = new AuthenticationManager({
    clientManager,
    ...params,
  })
  managers.push(authentication)
  return { queryClient, clientManager, authentication }
}

beforeEach(() => {
  localStorage.clear()
  // v10 keeps its credentials in IndexedDB, and a session left there by the
  // previous test would be restored into this one.
  globalThis.indexedDB = new IDBFactory()
  provider = installFakeIdentityProvider()
  replica = installFakeReplica({
    host: LOCAL_HOST,
    canisters: { [provider.canisterId]: provider.canister },
  })
})

afterEach(() => {
  // A v10 client listens for `storage` events on the window every test shares,
  // and keeps the IndexedDB it opened in its own test. One left over reads a
  // record a later test writes against that database, and can end the later
  // test's sign-in.
  for (const { client } of managers.splice(0)) {
    ;(client as { dispose?: () => void } | undefined)?.dispose?.()
  }
  provider.restore()
  replica.restore()
})

describe("Internet Identity sign-in (real AuthClient)", () => {
  it("signs in through the II popup and puts the delegated identity on the agent", async () => {
    const { authentication, clientManager } = createManager()
    await authentication.prepareClient()

    await withUserGesture(() => authentication.login())

    expect(provider.openCount).toBe(1)
    expect(provider.signInRequestCount).toBe(1)

    const { identity, isAuthenticated, isAuthenticating, error } =
      authentication.authState
    expect(error).toBeUndefined()
    expect(isAuthenticating).toBe(false)
    expect(isAuthenticated).toBe(true)
    expect(identity).not.toBeNull()

    // The agent must carry the delegated principal, not the anonymous one.
    const principal = identity!.getPrincipal()
    expect(principal.isAnonymous()).toBe(false)
    expect((await clientManager.getUserPrincipal()).toText()).toBe(
      principal.toText()
    )
    expect(principal.toText()).toBe(
      provider.rootIdentity.getPrincipal().toText()
    )
  })

  it("opens the popup synchronously so the browser gesture chain survives", async () => {
    // `PostMessageTransport` rejects when `establishChannel` runs outside a
    // click. A regression that awaits before `signIn()` fails here.
    const { authentication } = createManager()
    await authentication.prepareClient()

    await expect(
      withUserGesture(() => authentication.login())
    ).resolves.toBeUndefined()
  })

  it("forwards maxTimeToLive to the identity provider", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()

    const maxTimeToLive = 3_600_000_000_000n
    await withUserGesture(() => authentication.login({ maxTimeToLive }))

    const request = isV10
      ? provider.sessionRequests[0]
      : provider.delegationRequests[0]
    expect(request.maxTimeToLive).toBe(maxTimeToLive.toString())
  })

  it.runIf(!isV10)("forwards targets to the identity provider", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()

    await withUserGesture(() =>
      authentication.login({
        targets: [Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai")],
      })
    )

    expect(provider.delegationRequests[0].targets).toEqual([
      "rrkah-fqaaa-aaaaa-aaaaq-cai",
    ])
  })

  it.runIf(isV10)(
    "forwards maxTimeToIdle to the identity provider",
    async () => {
      const { authentication } = createManager()
      await authentication.prepareClient()

      const maxTimeToIdle = 600_000_000_000n
      await withUserGesture(() => authentication.login({ maxTimeToIdle }))

      expect(provider.sessionRequests[0].maxTimeToIdle).toBe(
        maxTimeToIdle.toString()
      )
    }
  )

  it.runIf(isV10)(
    "mints the app delegation from the Internet Identity canister as the session",
    async () => {
      const { authentication } = createManager()
      await authentication.prepareClient()

      await withUserGesture(() => authentication.login())

      expect(methodsCalled(provider.canisterId)).toEqual(
        expect.arrayContaining(["app_prepare_delegation", "app_get_delegation"])
      )
      // Signed as the session the popup issued, not as the account or as
      // nobody: the canister would refuse either.
      const mint = replica.requests.find(
        (request) => request.methodName === "app_prepare_delegation"
      )
      expect(mint?.caller).toBeDefined()
      expect(mint?.caller).not.toBe(Principal.anonymous().toText())
      expect(mint?.caller).not.toBe(
        provider.rootIdentity.getPrincipal().toText()
      )
    }
  )

  it("runs onSuccess after a completed sign-in", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()

    const calls: string[] = []
    await withUserGesture(() =>
      authentication.login({
        onSuccess: () => {
          calls.push("success")
        },
        onError: () => {
          calls.push("error")
        },
      })
    )

    expect(calls).toEqual(["success"])
  })

  it("restores the session on a fresh manager without reopening the popup", async () => {
    const first = createManager()
    await first.authentication.prepareClient()
    await withUserGesture(() => first.authentication.login())
    expect(provider.openCount).toBe(1)

    // A new page load: new ClientManager + AuthenticationManager, same storage.
    const second = createManager()
    const identity = await second.authentication.authenticate()

    expect(provider.openCount).toBe(1)
    expect(identity).toBeDefined()
    expect(identity!.getPrincipal().isAnonymous()).toBe(false)
    expect(second.authentication.authState.isAuthenticated).toBe(true)
    expect((await second.clientManager.getUserPrincipal()).toText()).toBe(
      first.authentication.authState.identity!.getPrincipal().toText()
    )
  })

  it("does not sign with a session that lapsed before a manager was built over its client", async () => {
    // A client kept at module scope outlives the manager built for one mounted
    // tree. Once its session has lapsed, it no longer vouches for it, but it
    // still hands out the lapsed identity. A manager built over it then put
    // that identity on the agent, under `isAuthenticated: false`.
    const first = createManager()
    await first.authentication.prepareClient()
    await withUserGesture(() => first.authentication.login())
    const client = first.authentication.client!

    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      // Past the provider's 8 h session.
      vi.setSystemTime(Date.now() + 9 * 60 * 60 * 1000)
      expect(await client.isAuthenticated()).toBe(false)

      const next = createManager({ authClient: client })
      await vi.waitFor(() =>
        expect(next.authentication.authState.identity).not.toBeNull()
      )

      expect(next.authentication.authState.isAuthenticated).toBe(false)
      expect((await next.clientManager.getUserPrincipal()).isAnonymous()).toBe(
        true
      )
      expect(
        next.authentication.authState.identity!.getPrincipal().isAnonymous()
      ).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it.runIf(isV10)(
    "keeps a v10 session whose app delegation expired while nothing used it",
    async () => {
      // v10 renews the short-lived app delegation it signs with only after
      // something has used it, and otherwise mints a new one at the next call.
      // The delegation a live session holds can be past its expiry, so only
      // the client's answer says whether the session is over.
      const { authentication, clientManager } = createManager()
      await authentication.prepareClient()
      await withUserGesture(() => authentication.login())
      const identity = authentication.authState.identity!
      const user = identity.getPrincipal().toText()

      vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true })
      try {
        // Past the 30 min app delegation, inside the 8 h session.
        vi.setSystemTime(Date.now() + 31 * 60 * 1000)
        const held = (
          identity as unknown as { getDelegation(): DelegationChain }
        ).getDelegation()
        expect(isDelegationValid(held)).toBe(false)

        await authentication.authenticate()

        expect(authentication.authState.isAuthenticated).toBe(true)
        // The next call mints a new app delegation and goes out as the user.
        const mints = () =>
          methodsCalled(provider.canisterId).filter(
            (method) => method === "app_prepare_delegation"
          ).length
        const minted = mints()
        await clientManager.agent.query(provider.canisterId, {
          methodName: "http_request",
          arg: new Uint8Array(IDL.encode([], [])),
        })
        expect(mints()).toBe(minted + 1)
        const calls = replica.requests.filter(
          (request) => request.methodName === "http_request"
        )
        expect(calls[calls.length - 1]?.caller).toBe(user)
      } finally {
        vi.useRealTimers()
      }
    }
  )

  it("logs out, clears the session and resets the agent to anonymous", async () => {
    const { authentication, clientManager } = createManager()
    await authentication.prepareClient()
    await withUserGesture(() => authentication.login())
    expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(false)

    await authentication.logout()

    expect(authentication.authState.isAuthenticated).toBe(false)
    expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(true)

    // The stored session must be gone: a fresh manager stays anonymous.
    const next = createManager()
    const identity = await next.authentication.authenticate()
    expect(identity?.getPrincipal().isAnonymous()).toBe(true)
    expect(next.authentication.authState.isAuthenticated).toBe(false)
  })

  it.runIf(isV10)(
    "revokes the session at the Internet Identity canister on logout",
    async () => {
      const { authentication } = createManager()
      await authentication.prepareClient()
      await withUserGesture(() => authentication.login())
      const session = replica.requests.find(
        (request) => request.methodName === "app_prepare_delegation"
      )?.caller

      await authentication.logout()

      expect(provider.revokedSessions).toEqual([session])
    }
  )

  it.runIf(isV10)(
    "signs out here even when revoking the session at the canister fails",
    async () => {
      // v10 wipes the device and drops to an anonymous identity before it
      // rethrows a revoke the canister refused. IC Reactor has to follow it
      // rather than keep signing as the account the user just left (#478).
      const { authentication, clientManager } = createManager()
      await authentication.prepareClient()
      await withUserGesture(() => authentication.login())
      provider.setRevokeError("stable memory is full")

      await expect(authentication.logout()).rejects.toThrow(
        "stable memory is full"
      )

      expect(authentication.authState.isAuthenticated).toBe(false)
      expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(true)
      expect(authentication.authState.error?.message).toContain(
        "stable memory is full"
      )
      // The device holds nothing any more: a fresh manager stays anonymous.
      const next = createManager()
      const identity = await next.authentication.authenticate()
      expect(identity?.getPrincipal().isAnonymous()).toBe(true)
    }
  )

  it("reports sign-in failures through authState and onError", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()

    // Popup blocked.
    provider.restore()
    const blocked = () => null as unknown as Window
    const original = window.open
    window.open = blocked as unknown as typeof window.open

    const errors: Array<string | undefined> = []
    await expect(
      withUserGesture(() =>
        authentication.login({ onError: (e) => void errors.push(e) })
      )
    ).rejects.toThrow()

    window.open = original
    expect(authentication.authState.isAuthenticating).toBe(false)
    expect(authentication.authState.isAuthenticated).toBe(false)
    expect(authentication.authState.error).toBeInstanceOf(Error)
    expect(errors).toHaveLength(1)
  })
})

describe("a session another tab ended and signed in to again (real AuthClient)", () => {
  // Every tab of an origin shares `localStorage`, IndexedDB and one Web Locks
  // manager, so a second manager over the same storage stands for a second
  // tab. Once the session ends in tab B, a v8 tab A's manager still reports it
  // until something makes it look again, such as a later `useAuth()` consumer
  // mounting. A v10 tab A's manager follows its client, which hears of the
  // change, but a check in tab A can still come first. Looking again has to
  // end the session in tab A only: the user may have signed in again in tab B
  // by then.

  let restoreWebLocks: () => void

  beforeEach(() => {
    // jsdom has no `navigator.locks`, and without it v10 takes no lock at all.
    restoreWebLocks = installFakeWebLocks()
  })

  afterEach(() => {
    restoreWebLocks()
  })

  function readLocalStorage() {
    const entries = new Map<string, string>()
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key !== null) entries.set(key, localStorage.getItem(key)!)
    }
    return entries
  }

  /**
   * Raises in tab A the `storage` events a browser raises there for what tab B
   * changed since `before`. jsdom has one window and raises none.
   */
  function deliverStorageEvents(before: Map<string, string>) {
    const after = readLocalStorage()
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const oldValue = before.get(key) ?? null
      const newValue = after.get(key) ?? null
      if (oldValue === newValue) continue
      window.dispatchEvent(
        new StorageEvent("storage", { key, oldValue, newValue })
      )
    }
  }

  /** Tabs A and B on one session, signed in to in tab A. */
  async function signInInBothTabs() {
    const tabA = createManager()
    await tabA.authentication.prepareClient()
    await withUserGesture(() => tabA.authentication.login())
    const tabB = createManager()
    await tabB.authentication.prepareClient()
    await tabB.authentication.authenticate()
    expect(tabB.authentication.authState.isAuthenticated).toBe(true)
    return { tabA, tabB }
  }

  /**
   * Tabs A and B on one session, which the user then signs out of in tab B.
   * Tab A's client hears of it and stops vouching for the session. A v8 tab
   * A's manager is not told, and still reports the user signed in; a v10 one
   * reads its client again, but has not yet when this returns.
   */
  async function signOutInTabB() {
    const { tabA, tabB } = await signInInBothTabs()

    const before = readLocalStorage()
    await tabB.authentication.logout()
    deliverStorageEvents(before)

    expect(await tabA.authentication.client!.isAuthenticated()).toBe(false)
    if (!isV10) {
      expect(tabA.authentication.authState.isAuthenticated).toBe(true)
    }
    return { tabA, tabB }
  }

  /** Whether a tab opened now finds a session to restore. */
  async function newTabIsSignedIn() {
    const tab = createManager()
    await tab.authentication.authenticate()
    return tab.authentication.authState.isAuthenticated
  }

  async function expectSignedOut({
    authentication,
    clientManager,
  }: ReturnType<typeof createManager>) {
    expect(authentication.authState.isAuthenticated).toBe(false)
    expect(
      authentication.authState.identity?.getPrincipal().isAnonymous() ?? true
    ).toBe(true)
    expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(true)
  }

  it("does not end a sign-in tab B has in progress", async () => {
    // Tab A looks at its session while the user is still in the identity
    // provider signing in again in tab B. With v10, the sign-out tab A then ran
    // took the sign-in lock from tab B's ceremony, which failed with
    // SupersededError once the user had finished in the identity provider.
    const { tabA, tabB } = await signOutInTabB()
    const release = provider.holdSignIn()
    const before = readLocalStorage()
    const signingIn = withUserGesture(() => tabB.authentication.login())
    await vi.waitFor(() => expect(provider.signInRequestCount).toBe(2))

    await tabA.authentication.authenticate()

    expect(tabA.authentication.authState.isAuthenticated).toBe(false)
    expect((await tabA.clientManager.getUserPrincipal()).isAnonymous()).toBe(
      true
    )
    release()
    await expect(signingIn).resolves.toBeUndefined()
    deliverStorageEvents(before)
    expect(tabB.authentication.authState.isAuthenticated).toBe(true)
    expect(await newTabIsSignedIn()).toBe(true)
  })

  it("does not end a sign-in tab B finished before tab A heard of it", async () => {
    // A `storage` event reaches the other tabs asynchronously, so a check in
    // tab A can run after tab B's sign-in and before tab A hears of it. With
    // v10, the sign-out tab A then ran revoked tab B's new session at the
    // canister and removed it from the store both tabs share.
    const { tabA, tabB } = await signOutInTabB()
    const before = readLocalStorage()
    await withUserGesture(() => tabB.authentication.login())
    const revoked = provider.revokedSessions.length

    // A v10 tab A may have followed the sign-out already, and then this check
    // is a restore, which v10 refuses while the record names a sign-in tab A's
    // client has not restored yet. Either way it must not end tab B's.
    await tabA.authentication.authenticate().catch(() => undefined)
    deliverStorageEvents(before)

    expect(provider.revokedSessions).toHaveLength(revoked)
    expect(tabB.authentication.authState.isAuthenticated).toBe(true)
    expect(await newTabIsSignedIn()).toBe(true)
    if (isV10) {
      // Once it hears of the sign-in, tab A follows tab B into it.
      await vi.waitFor(() =>
        expect(tabA.authentication.authState.isAuthenticated).toBe(true)
      )
      expect(tabA.authentication.authState.error).toBeUndefined()
    }
  })

  describe.runIf(isV10)("tab A following its client (v10)", () => {
    // Tab A's manager used to learn of the session only through its own
    // calls. After a sign-out in tab B it kept signing as the account the user
    // had left, and after a sign-in there as another account it kept the old
    // account. Once the old account's app delegation lapsed, its refused mint
    // made tab A's client remove the record every tab reads, signing the new
    // account out of every tab (#754).

    /** A query from tab A's agent, answered with who the replica saw. */
    async function callerOfQueryFrom({
      clientManager,
    }: ReturnType<typeof createManager>) {
      await clientManager.agent.query(provider.canisterId, {
        methodName: "http_request",
        arg: new Uint8Array(IDL.encode([], [])),
      })
      const calls = replica.requests.filter(
        (request) => request.methodName === "http_request"
      )
      return calls[calls.length - 1]?.caller
    }

    /** The user signs out in tab B, then signs in there as account 2. */
    async function switchAccountInTabB() {
      const { tabA, tabB } = await signInInBothTabs()
      const account1 = provider.rootIdentity.getPrincipal().toText()
      let before = readLocalStorage()
      await tabB.authentication.logout()
      deliverStorageEvents(before)
      await vi.waitFor(() =>
        expect(tabA.authentication.authState.isAuthenticated).toBe(false)
      )

      provider.switchAccount(Ed25519KeyIdentity.generate())
      const account2 = provider.rootIdentity.getPrincipal().toText()
      before = readLocalStorage()
      await withUserGesture(() => tabB.authentication.login())
      deliverStorageEvents(before)
      return { tabA, tabB, account1, account2 }
    }

    it("signs tab A out when the user signs out in tab B, with no call in tab A", async () => {
      const { tabA, tabB } = await signInInBothTabs()
      const before = readLocalStorage()
      await tabB.authentication.logout()
      deliverStorageEvents(before)

      await vi.waitFor(() =>
        expect(tabA.authentication.authState.isAuthenticated).toBe(false)
      )
      await expectSignedOut(tabA)
      expect(await callerOfQueryFrom(tabA)).toBe(Principal.anonymous().toText())
    })

    it("adopts the account tab B signs in as next", async () => {
      const { tabA, account2 } = await switchAccountInTabB()

      await vi.waitFor(() =>
        expect(
          tabA.authentication.authState.identity?.getPrincipal().toText()
        ).toBe(account2)
      )
      expect(tabA.authentication.authState.isAuthenticated).toBe(true)
      expect((await tabA.clientManager.getUserPrincipal()).toText()).toBe(
        account2
      )
      expect(await callerOfQueryFrom(tabA)).toBe(account2)
    })

    it("keeps tab B's new session once tab A's old app delegation has lapsed", async () => {
      const { tabA, account2 } = await switchAccountInTabB()
      await vi.waitFor(() =>
        expect(
          tabA.authentication.authState.identity?.getPrincipal().toText()
        ).toBe(account2)
      )

      vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true })
      try {
        // Past the 30 min app delegation each tab holds, inside the session.
        vi.setSystemTime(Date.now() + 30 * 60 * 1000 + 5_000)

        expect(await callerOfQueryFrom(tabA)).toBe(account2)
        expect(await newTabIsSignedIn()).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it("stops following a client it let go of", async () => {
      const { tabA, tabB } = await signInInBothTabs()
      tabA.authentication.dispose()

      const before = readLocalStorage()
      await tabB.authentication.logout()
      deliverStorageEvents(before)
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Nothing reads the disposed client, so the manager reports what it
      // last knew.
      expect(tabA.authentication.authState.isAuthenticated).toBe(true)
    })
  })

  describe.runIf(!isV10)("after the session lapsed in every tab (v8)", () => {
    // v8's `isAuthenticated()` reads the delegation expiry v8 keeps in the
    // `localStorage` every tab shares. `getIdentity()` returns the identity the
    // client restored or signed in with, and v8 never reads storage again once
    // it has loaded. So once the session has lapsed and the user signs in again
    // in tab B, tab A's client says it is signed in again while it still hands
    // out the delegation that lapsed, which the replica refuses.

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    /**
     * Tabs A and B on one session, which lapses in both. The user then signs
     * in again in tab B. Tab A's manager is not told, and still reports the
     * session that lapsed.
     */
    async function lapseThenSignInInTabB() {
      const tabA = createManager()
      await tabA.authentication.prepareClient()
      await withUserGesture(() => tabA.authentication.login())
      const tabB = createManager()
      await tabB.authentication.prepareClient()
      await tabB.authentication.authenticate()
      expect(tabB.authentication.authState.isAuthenticated).toBe(true)

      // Past the provider's 8 h session.
      vi.setSystemTime(Date.now() + 9 * 60 * 60 * 1000)
      const before = readLocalStorage()
      await withUserGesture(() => tabB.authentication.login())
      deliverStorageEvents(before)

      expect(await tabA.authentication.client!.isAuthenticated()).toBe(true)
      expect(tabA.authentication.authState.isAuthenticated).toBe(true)
      return { tabA, tabB }
    }

    it("signs tab A out and leaves tab B's session alone", async () => {
      const { tabA, tabB } = await lapseThenSignInInTabB()

      await tabA.authentication.authenticate()

      await expectSignedOut(tabA)
      // A later check, such as another `useAuth()` consumer mounting, reads
      // the lapsed identity back from the client, which vouches for it again.
      await tabA.authentication.authenticate()
      await expectSignedOut(tabA)
      // v8's `signOut()` deletes the session every tab shares. Tab B still
      // holds its session, and a tab opened now restores it.
      await tabB.authentication.authenticate()
      expect(tabB.authentication.authState.isAuthenticated).toBe(true)
      expect(await newTabIsSignedIn()).toBe(true)
    })

    it("does not sign with the lapsed delegation in a manager built over tab A's client", async () => {
      // A client kept at module scope outlives the manager built for one
      // mounted tree, and a manager built over it takes the client's state.
      const { tabA } = await lapseThenSignInInTabB()

      const next = createManager({ authClient: tabA.authentication.client! })
      await vi.waitFor(() =>
        expect(next.authentication.authState.identity).not.toBeNull()
      )

      await expectSignedOut(next)
    })

    it("does not bring the lapsed delegation back when tab A's next sign-in fails", async () => {
      // When a sign-in fails, `login()` keeps the session the client already
      // holds, if the client vouches for it.
      const { tabA } = await lapseThenSignInInTabB()
      await tabA.authentication.authenticate()
      provider.setSignInError({ code: 3000, message: "User rejected" })

      await expect(
        withUserGesture(() => tabA.authentication.login())
      ).rejects.toThrow("User rejected")

      await expectSignedOut(tabA)
    })

    it("does not keep the lapsed delegation through an attribute request", async () => {
      // A request that does not sign in reads the identity the client holds,
      // and commits it when the client vouches for it.
      const { tabA } = await lapseThenSignInInTabB()
      const attributes = new IdentityAttributesManager(tabA.authentication)

      await withUserGesture(() =>
        attributes.request({
          keys: ["email"],
          nonce: new Uint8Array(32),
          signIn: false,
        })
      )

      await expectSignedOut(tabA)
    })
  })

  describe.runIf(!isV10)("in a tab whose client holds no session (v8)", () => {
    // v8's `isAuthenticated()` reads the delegation expiry every tab shares.
    // `getIdentity()` returns the identity this tab's client holds, which v8
    // sets only when it loads, signs in or signs out. A tab that loaded signed
    // out, or signed out, holds the anonymous identity. Once the user signs in
    // in tab B, tab A's client says it is signed in while it goes on handing
    // out the anonymous identity.

    /**
     * Tab A holds no session, because it loaded signed out or, with
     * `signOutFirst`, signed in and out. The user then signs in in tab B.
     */
    async function signInInTabBOnly({ signOutFirst = false } = {}) {
      const tabA = createManager()
      await tabA.authentication.prepareClient()
      if (signOutFirst) {
        await withUserGesture(() => tabA.authentication.login())
        await tabA.authentication.logout()
      }
      await tabA.authentication.authenticate()
      await expectSignedOut(tabA)
      const tabB = createManager()
      await tabB.authentication.prepareClient()
      const before = readLocalStorage()
      await withUserGesture(() => tabB.authentication.login())
      deliverStorageEvents(before)

      const client = tabA.authentication.client!
      expect(await client.isAuthenticated()).toBe(true)
      expect((await client.getIdentity()).getPrincipal().isAnonymous()).toBe(
        true
      )
      return { tabA, tabB }
    }

    it("still reports signed out in a tab that loaded signed out, until it signs in", async () => {
      const { tabA } = await signInInTabBOnly()

      await tabA.authentication.authenticate()

      await expectSignedOut(tabA)
      // Signing in there still opens the identity provider and signs in.
      const opened = provider.openCount
      await withUserGesture(() => tabA.authentication.login())
      expect(provider.openCount).toBe(opened + 1)
      const user = provider.rootIdentity.getPrincipal().toText()
      expect(tabA.authentication.authState.isAuthenticated).toBe(true)
      expect(
        tabA.authentication.authState.identity?.getPrincipal().toText()
      ).toBe(user)
      expect((await tabA.clientManager.getUserPrincipal()).toText()).toBe(user)
    })

    it("still reports signed out in a tab that signed out", async () => {
      const { tabA } = await signInInTabBOnly({ signOutFirst: true })

      await tabA.authentication.authenticate()

      await expectSignedOut(tabA)
    })

    it("does not report a manager built over tab A's client signed in", async () => {
      const { tabA } = await signInInTabBOnly()

      const next = createManager({ authClient: tabA.authentication.client! })
      await vi.waitFor(() =>
        expect(next.authentication.authState.identity).not.toBeNull()
      )

      await expectSignedOut(next)
    })

    it("fails tab A's sign-in when the user rejects it", async () => {
      // When a sign-in fails, `login()` keeps the session the client already
      // holds, if the client vouches for it. Tab A's client holds none.
      const { tabA } = await signInInTabBOnly()
      provider.setSignInError({ code: 3000, message: "User rejected" })

      await expect(
        withUserGesture(() => tabA.authentication.login())
      ).rejects.toThrow("User rejected")

      await expectSignedOut(tabA)
    })

    it("does not report tab A signed in after an attribute request", async () => {
      // A request that does not sign in reads the identity the client holds,
      // and commits it with what the client says about it.
      const { tabA } = await signInInTabBOnly()
      const attributes = new IdentityAttributesManager(tabA.authentication)

      await withUserGesture(() =>
        attributes.request({
          keys: ["email"],
          nonce: new Uint8Array(32),
          signIn: false,
        })
      )

      await expectSignedOut(tabA)
    })
  })
})

describe("identity provider resolution", () => {
  // These only check which URL the popup opens at. The fake refuses the
  // sign-in once it is open: on mainnet a v10 client would go on to mint from
  // mainnet's canister, which no fake can certify for.
  beforeEach(() => {
    provider.setSignInError({ code: 3000, message: "User rejected" })
  })

  it("uses the production II provider on mainnet", async () => {
    const { authentication } = createManager({}, { network: "mainnet" })
    await authentication.prepareClient()
    await expect(withUserGesture(() => authentication.login())).rejects.toThrow(
      "User rejected"
    )

    expect(provider.openedUrls[0]).toBe("https://id.ai/authorize")
  })

  it("uses the local II canister's provider on a local network", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()
    await expect(withUserGesture(() => authentication.login())).rejects.toThrow(
      "User rejected"
    )

    expect(provider.openedUrls[0]).toBe(
      `http://${provider.canisterId}.localhost:4943/authorize`
    )
  })

  it("explains a local II with no sign-in page for the installed major", async () => {
    // The build the v8 advice names serves /authorize but predates the calls a
    // v10 sign-in makes, so a v10 app needs the frontend served separately.
    provider.setSignInPageServed(false)
    const { authentication } = createManager()

    await expect(authentication.prepareClient()).rejects.toThrow(
      isV10
        ? "needs an Internet Identity frontend served separately"
        : "Install internet_identity_dev.wasm from release-2026-03-16"
    )
    expect(provider.openCount).toBe(0)
  })

  it("honours an explicit identityProvider", async () => {
    const { authentication } = createManager(
      {
        identityProvider: "https://identity.internetcomputer.org/authorize",
        // v10 names a provider by its URL and the canister that mints for it,
        // and refuses a URL on its own. v8 ignores this.
        internetIdentityId: provider.canisterId,
      },
      { network: "mainnet" }
    )
    await authentication.prepareClient()
    await expect(withUserGesture(() => authentication.login())).rejects.toThrow(
      "User rejected"
    )

    expect(provider.openedUrls[0]).toBe(
      "https://identity.internetcomputer.org/authorize"
    )
  })

  it("adds the openid search param for one-click providers", async () => {
    const { authentication } = createManager({}, { network: "mainnet" })
    await authentication.prepareClient({ openIdProvider: "google" })
    await expect(
      withUserGesture(() => authentication.login({ openIdProvider: "google" }))
    ).rejects.toThrow("User rejected")

    expect(provider.openedUrls[0]).toContain(
      "openid=https%3A%2F%2Faccounts.google.com"
    )
  })
})

describe("identity attributes (real AuthClient)", () => {
  it("requests attributes and decodes them alongside sign-in", async () => {
    const { authentication } = createManager()
    const attributes = new IdentityAttributesManager(authentication)
    await authentication.prepareClient()

    const nonce = new Uint8Array(32).fill(7)
    const result = await withUserGesture(() =>
      attributes.request({
        keys: [
          "openid:https://accounts.google.com:email",
          "openid:https://accounts.google.com:name",
        ],
        nonce,
      })
    )

    // Sign-in and the attribute request share one popup.
    expect(provider.openCount).toBe(1)
    expect(provider.attributesRequests).toHaveLength(1)
    expect(fromBase64(provider.attributesRequests[0].nonce)).toEqual(nonce)

    expect(result.decodedAttributes).toEqual({
      email: "user@example.com",
      name: "Test User",
    })
    expect(result.principal).toBe(provider.rootIdentity.getPrincipal().toText())
    expect(result.signedAttributes.signature).toEqual(
      new Uint8Array([1, 2, 3, 4])
    )
    expect(authentication.authState.isAuthenticated).toBe(true)
  })

  it("scopes keys for requestOpenId", async () => {
    const { authentication } = createManager()
    const attributes = new IdentityAttributesManager(authentication)
    await authentication.prepareClient()

    provider.setAttributesResponse({
      data: encodeAttributes([
        ["openid:https://accounts.google.com:email", "scoped@example.com"],
      ]),
      signature: new Uint8Array([9]),
    })

    const result = await withUserGesture(() =>
      attributes.requestOpenId({
        nonce: new Uint8Array(32).fill(3),
        openIdProvider: "google",
        keys: ["email"],
      })
    )

    expect(provider.attributesRequests[0].keys).toEqual([
      "openid:https://accounts.google.com:email",
    ])
    expect(result.decodedAttributes.email).toBe("scoped@example.com")
  })

  it("opens the II window before an async nonce resolves", async () => {
    const { authentication } = createManager()
    const attributes = new IdentityAttributesManager(authentication)
    await authentication.prepareClient()

    // A nonce fetched from a canister: awaiting it before calling
    // requestAttributes would end the user gesture and the transport would
    // refuse to open the window.
    let releaseNonce: (value: Uint8Array) => void = () => {}
    const nonce = new Promise<Uint8Array>((resolve) => {
      releaseNonce = resolve
    })

    const pending = withUserGesture(() =>
      attributes.request({
        keys: ["openid:https://accounts.google.com:email"],
        nonce: () => nonce,
      })
    )

    // The popup is already up while the nonce is still in flight.
    await Promise.resolve()
    expect(provider.openCount).toBe(1)

    releaseNonce(new Uint8Array(32).fill(5))
    const result = await pending

    expect(fromBase64(provider.attributesRequests[0].nonce)).toEqual(
      new Uint8Array(32).fill(5)
    )
    expect(result.decodedAttributes.email).toBe("user@example.com")
  })

  describe("a sign-out while the attribute request is still pending", () => {
    // Signing out ends neither half of a pending request: the attribute side
    // goes on and resolves. The identity it captured belongs to the session
    // the user just left, and committing it put their delegation back on the
    // agent while the app showed them signed out.

    /** A nonce the test releases, so the request stays pending until then. */
    function heldNonce() {
      let release: () => void = () => {}
      const nonce = new Promise<Uint8Array>((resolve) => {
        release = () => resolve(new Uint8Array(32).fill(4))
      })
      return { nonce: () => nonce, release }
    }

    async function expectSignedOut(
      authentication: AuthenticationManager,
      clientManager: ClientManager
    ) {
      expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(true)
      expect(authentication.authState.isAuthenticated).toBe(false)
      expect(
        authentication.authState.identity?.getPrincipal().isAnonymous() ?? true
      ).toBe(true)
      expect(authentication.authState.isAuthenticating).toBe(false)
    }

    it("keeps the agent anonymous for a request made while signed in", async () => {
      const { authentication, clientManager } = createManager()
      const attributes = new IdentityAttributesManager(authentication)
      await authentication.prepareClient()
      await withUserGesture(() => authentication.login())
      const { nonce, release } = heldNonce()

      const pending = withUserGesture(() =>
        attributes.request({ keys: ["email"], nonce, signIn: false })
      )
      await authentication.logout()
      await expectSignedOut(authentication, clientManager)

      release()
      await pending

      await expectSignedOut(authentication, clientManager)
    })

    it("keeps the agent anonymous when the request's own sign-in had finished", async () => {
      const { authentication, clientManager } = createManager()
      const attributes = new IdentityAttributesManager(authentication)
      await authentication.prepareClient()
      const { nonce, release } = heldNonce()

      const pending = withUserGesture(() =>
        attributes.request({ keys: ["email"], nonce })
      )
      await vi.waitFor(async () => {
        expect(await authentication.client!.isAuthenticated()).toBe(true)
      })
      await authentication.logout()

      release()
      await pending

      await expectSignedOut(authentication, clientManager)
    })

    /**
     * Signs out in another tab: a manager of its own restores the session from
     * the storage both tabs share and logs out. A browser then raises `storage`
     * in every other tab of the origin; jsdom has one window and raises none,
     * so this tab is sent what changed.
     */
    async function signOutInAnotherTab() {
      const before = readLocalStorage()
      const otherTab = createManager()
      await otherTab.authentication.authenticate()
      expect(otherTab.authentication.authState.isAuthenticated).toBe(true)
      await otherTab.authentication.logout()
      const after = readLocalStorage()

      for (const key of new Set([...before.keys(), ...after.keys()])) {
        const oldValue = before.get(key) ?? null
        const newValue = after.get(key) ?? null
        if (oldValue === newValue) continue
        window.dispatchEvent(
          new StorageEvent("storage", { key, oldValue, newValue })
        )
      }
    }

    function readLocalStorage() {
      const entries = new Map<string, string>()
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)
        if (key !== null) entries.set(key, localStorage.getItem(key)!)
      }
      return entries
    }

    it("signs this tab out too when the sign-out happens in another tab", async () => {
      // Nothing tells the manager: the client in this tab stops vouching for
      // the session while still handing out its identity, and the request is
      // the first thing to find out.
      const { authentication, clientManager } = createManager()
      const attributes = new IdentityAttributesManager(authentication)
      await authentication.prepareClient()
      await withUserGesture(() => authentication.login())
      const { nonce, release } = heldNonce()

      const pending = withUserGesture(() =>
        attributes.request({ keys: ["email"], nonce, signIn: false })
      )
      await signOutInAnotherTab()
      expect(await authentication.client!.isAuthenticated()).toBe(false)

      release()
      await pending

      await expectSignedOut(authentication, clientManager)
    })
  })

  it("surfaces identity-provider errors", async () => {
    const { authentication } = createManager()
    const attributes = new IdentityAttributesManager(authentication)
    await authentication.prepareClient()

    provider.setAttributesError({ code: 3000, message: "User rejected" })

    await expect(
      withUserGesture(() =>
        attributes.request({ keys: ["email"], nonce: new Uint8Array(32) })
      )
    ).rejects.toThrow("User rejected")

    expect(authentication.authState.error?.message).toContain("User rejected")
    expect(authentication.authState.isAuthenticating).toBe(false)
  })
})

describe("fake identity provider", () => {
  // After a sign-in the signer's heartbeat has a 2 s disconnect timeout
  // pending, and its callback removes the heartbeat's listener from `window`.
  // One still pending when a test file ends fires after vitest has removed the
  // jsdom globals and fails the run with "removeEventListener is not a
  // function" (seen in CI at the peer floors). restore() has to stop it.
  it("stops the signer's heartbeat timers when restored", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()
    await withUserGesture(() => authentication.login())

    provider.restore()
    const removeListener = vi.spyOn(window, "removeEventListener")
    try {
      await new Promise((resolve) => setTimeout(resolve, 2_500))
      expect(removeListener).not.toHaveBeenCalledWith(
        "message",
        expect.any(Function)
      )
    } finally {
      removeListener.mockRestore()
    }
  })
})
