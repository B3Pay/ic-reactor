import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { ClientManager } from "@ic-reactor/core"
import type { Identity } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import { AuthenticationManager } from "../../src/auth/index.js"
import type { AuthState } from "../../src/auth/types.js"

/**
 * An `AuthenticationManager` follows a v10 client's session record, which
 * every tab of the origin shares, so that a sign-out or a sign-in in another
 * tab reaches it without a call in this one (#754). The real client is
 * exercised in internet-identity-integration.test.ts; these pin the rules
 * with a client whose record the test changes by hand.
 */

const ANONYMOUS = "2vxsx-fae"
const ALICE = "aaaaa-aa"
const BOB = "ryjl3-tyaaa-aaaaa-aaaba-cai"

/** One identity per principal, as a client hands out the one it holds. */
const identities = new Map<string, Identity>()
const identityOf = (text: string) => {
  let held = identities.get(text)
  if (!held) {
    const principal = Principal.fromText(text)
    held = { getPrincipal: () => principal } as Identity
    identities.set(text, held)
  }
  return held
}

/**
 * A client shaped like `@icp-sdk/auth` v10's: `getStatus`, `getPrincipal` and
 * `subscribe`. `changeRecord` stands for another tab writing the record.
 */
function sessionClient(signedInAs?: string) {
  const listeners = new Set<() => void>()
  const client = {
    account: signedInAs,
    /** Makes `getIdentity()` refuse, as v10 does for a record it cannot act on. */
    refuseIdentity: false,
    getIdentity: vi.fn(async () => {
      if (client.refuseIdentity) {
        throw new Error("A sign-in exists for this domain, but ...")
      }
      return identityOf(client.account ?? ANONYMOUS)
    }),
    isAuthenticated: vi.fn(() => client.account !== undefined),
    getPrincipal: vi.fn(() =>
      client.account === undefined
        ? undefined
        : Principal.fromText(client.account)
    ),
    getStatus: vi.fn(() => ({
      state: client.account === undefined ? "signed-out" : "signed-in",
    })),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }),
    signIn: vi.fn(),
    signOut: vi.fn(),
    requestAttributes: vi.fn(),
    dispose: vi.fn(),
    listeners,
    changeRecord(account: string | undefined) {
      client.account = account
      for (const listener of [...listeners]) listener()
    },
  }
  return client
}

/** Lets the follow, which only waits on promises, run to the end. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function setup(client: ReturnType<typeof sessionClient>) {
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: "https://icp-api.io" },
  })
  const authentication = new AuthenticationManager({
    clientManager,
    authClient: client as never,
  })
  // The constructor reads the client once.
  await flush()
  const published: AuthState[] = []
  authentication.subscribeAuthState((state) => published.push(state))
  const agentPrincipal = () =>
    clientManager.identity?.getPrincipal().toText() ?? ANONYMOUS
  return { clientManager, authentication, published, agentPrincipal }
}

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("AuthenticationManager following a v10 client", () => {
  it("signs out when another tab signs out", async () => {
    const client = sessionClient(ALICE)
    const { authentication, agentPrincipal } = await setup(client)
    expect(authentication.authState.isAuthenticated).toBe(true)
    expect(agentPrincipal()).toBe(ALICE)

    client.changeRecord(undefined)
    await flush()

    expect(authentication.authState.isAuthenticated).toBe(false)
    expect(authentication.authState.identity?.getPrincipal().toText()).toBe(
      ANONYMOUS
    )
    expect(agentPrincipal()).toBe(ANONYMOUS)
  })

  it("adopts the account another tab signs in as", async () => {
    const client = sessionClient(ALICE)
    const { authentication, agentPrincipal } = await setup(client)

    client.changeRecord(BOB)
    await flush()

    expect(authentication.authState.isAuthenticated).toBe(true)
    expect(authentication.authState.identity?.getPrincipal().toText()).toBe(BOB)
    expect(agentPrincipal()).toBe(BOB)
  })

  it("clears an error recorded for the session it replaces", async () => {
    const client = sessionClient(ALICE)
    const { authentication } = await setup(client)
    authentication.setAuthenticationError(new Error("refresh failed"))

    client.changeRecord(BOB)
    await flush()

    expect(authentication.authState.error).toBeUndefined()
  })

  it("publishes nothing when the client still holds the same session", async () => {
    const client = sessionClient(ALICE)
    const { published, clientManager } = await setup(client)
    const updateAgent = vi.spyOn(clientManager, "updateAgent")

    client.changeRecord(ALICE)
    await flush()

    expect(published).toEqual([])
    expect(updateAgent).not.toHaveBeenCalled()
  })

  it("reads the client again once an operation of its own has ended", async () => {
    // An attribute request (or a sign-in, or a sign-out) in flight publishes
    // what the client holds when it ends, and a read in the middle of it would
    // publish over it. The change is read once it is over instead.
    const client = sessionClient(ALICE)
    const { authentication, agentPrincipal } = await setup(client)
    authentication.setAuthenticating()

    client.changeRecord(undefined)
    await flush()
    expect(authentication.authState.isAuthenticated).toBe(true)

    authentication.settleAuthenticating()
    await flush()
    expect(authentication.authState.isAuthenticated).toBe(false)
    expect(agentPrincipal()).toBe(ANONYMOUS)
  })

  it("publishes only the newest of two reads", async () => {
    // Two changes in a row: the first read answers after the second began,
    // with the record the second has replaced.
    const client = sessionClient(ALICE)
    const { authentication } = await setup(client)
    let answerFirst!: () => void
    client.getIdentity.mockImplementationOnce(
      () =>
        new Promise<Identity>((resolve) => {
          answerFirst = () => resolve(identityOf(ANONYMOUS))
        })
    )

    client.changeRecord(undefined)
    await Promise.resolve()
    client.changeRecord(BOB)
    await flush()
    answerFirst()
    await flush()

    expect(authentication.authState.identity?.getPrincipal().toText()).toBe(BOB)
    expect(authentication.authState.isAuthenticated).toBe(true)
  })

  it("keeps the session while a client that cannot answer still names its account", async () => {
    const client = sessionClient(ALICE)
    const { authentication, agentPrincipal } = await setup(client)
    client.refuseIdentity = true

    client.changeRecord(ALICE)
    await flush()

    expect(authentication.authState.isAuthenticated).toBe(true)
    expect(agentPrincipal()).toBe(ALICE)
  })

  it("signs out when a client that cannot answer names another account", async () => {
    // Restoring the account another tab signed in as failed. The old one must
    // not go on signing calls.
    const client = sessionClient(ALICE)
    const { authentication, agentPrincipal } = await setup(client)
    client.refuseIdentity = true

    client.changeRecord(BOB)
    await flush()

    expect(authentication.authState.isAuthenticated).toBe(false)
    expect(agentPrincipal()).toBe(ANONYMOUS)
  })

  it("stops following a client handed to it once disposed, and never disposes it", async () => {
    const client = sessionClient(ALICE)
    const { authentication } = await setup(client)
    expect(client.listeners.size).toBe(1)

    authentication.dispose()

    expect(client.listeners.size).toBe(0)
    expect(client.dispose).not.toHaveBeenCalled()
  })

  it("does not subscribe to a v8 client", async () => {
    // v8 has no cross-tab notification and never revokes a session.
    const client = sessionClient(ALICE)
    const { getStatus: _getStatus, ...v8Shaped } = client
    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
    new AuthenticationManager({ clientManager, authClient: v8Shaped as never })

    expect(client.subscribe).not.toHaveBeenCalled()
  })
})
