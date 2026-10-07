/**
 * The agents of a client, on a fake replica: one immutable agent per
 * principal, handed out only for the principal a call was made for, and
 * built so that the client, not the agent, decides every re-send.
 *
 * `readAs` asks the client for an agent the way a read's query function does
 * (with the principal captured in its key) and sends a query through it, so
 * the replica's request log shows who each call really went out as.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { IC_ROOT_KEY, type Identity } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { createClient, internalsOf, type AuthLike } from "../src/client.js"
import { createTestAuth } from "../src/testing/test-auth.js"
import {
  ANONYMOUS,
  CALL,
  CANISTER,
  callersSeen,
  delegate,
  deferred,
  networkOf,
  onPage,
  readAs,
  replicaWithWhoami,
  withIdentity,
} from "./client-helpers.js"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A client in a browser page, on `replica`, signed in through `auth`. */
function clientOn(
  replica: ReturnType<typeof replicaWithWhoami>,
  auth: AuthLike
) {
  onPage()
  return createClient({
    network: networkOf(replica),
    fetch: replica.fetch,
    auth: () => auth,
  })
}

const agentFor = (client: ReturnType<typeof createClient>, principal: string) =>
  internalsOf(client).agentFor(principal, CALL)

const statusRequests = (replica: ReturnType<typeof replicaWithWhoami>) =>
  replica.requests.filter((request) => request.endpoint === "status").length

describe("the agent of a principal", () => {
  it("sends a call as the principal it was asked for", async () => {
    const replica = replicaWithWhoami()
    const auth = createTestAuth({ seed: 1 })
    const client = clientOn(replica, auth)
    const alice = client.caller()

    await expect(readAs(client, alice)).resolves.toBe(alice)
    expect(callersSeen(replica)).toEqual([alice])
  })

  it.each([
    ["the identity it was asked for", "asked"],
    ["the identity it holds once it answers", "answered"],
  ] as const)(
    "cancels a call made as a principal that is switched away while its identity arrives (the auth hands over %s)",
    async (_label, which) => {
      const replica = replicaWithWhoami()
      const auth = createTestAuth({ seed: 1 })
      const gate = deferred()
      const client = clientOn(
        replica,
        withIdentity(auth, async () => {
          if (which === "asked") {
            const identity = await auth.getIdentity()
            await gate.promise
            return identity
          }
          await gate.promise
          return auth.getIdentity()
        })
      )
      const alice = client.caller()

      // The read captured alice; the user switches account before the
      // identity it needs has arrived.
      const read = readAs(client, alice)
      auth.switchTo(2)
      const bob = client.caller()
      gate.resolve()

      const error = await read.catch((e: unknown) => e)
      expect(error).toMatchObject({
        name: "ReactorError",
        kind: "cancelled",
        code: "caller_changed",
        mayHaveExecuted: false,
      })
      expect(callersSeen(replica)).not.toContain(alice)

      // A read made for the principal now current goes out as it.
      await expect(readAs(client, bob)).resolves.toBe(bob)
      expect(callersSeen(replica)).toEqual([bob])
    }
  )

  it("cancels a call made for anyone but the current caller, without asking the auth", async () => {
    const replica = replicaWithWhoami()
    const auth = createTestAuth({ seed: 1 })
    const getIdentity = vi.fn(() => auth.getIdentity())
    const client = clientOn(replica, withIdentity(auth, getIdentity))
    const stranger = Ed25519KeyIdentity.generate().getPrincipal().toText()

    for (const principal of [ANONYMOUS, stranger]) {
      await expect(readAs(client, principal)).rejects.toMatchObject({
        kind: "cancelled",
        code: "caller_changed",
      })
    }
    expect(getIdentity).not.toHaveBeenCalled()
    expect(callersSeen(replica)).toEqual([])
  })

  it("cancels a call when the auth hands over another principal's identity", async () => {
    const replica = replicaWithWhoami()
    const auth = createTestAuth({ seed: 1 })
    const other = Ed25519KeyIdentity.generate()
    const client = clientOn(
      replica,
      withIdentity(auth, () => Promise.resolve(other))
    )

    await expect(readAs(client, client.caller())).rejects.toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
      mayHaveExecuted: false,
    })
    expect(callersSeen(replica)).toEqual([])
  })

  it("refuses a call as unauthenticated when the auth cannot provide the identity", async () => {
    const replica = replicaWithWhoami()
    const auth = createTestAuth({ seed: 1 })
    const failure = new Error("this origin holds no credential")
    const client = clientOn(
      replica,
      withIdentity(auth, () => Promise.reject(failure))
    )

    const error = await readAs(client, client.caller()).catch((e: unknown) => e)
    expect(error).toMatchObject({
      kind: "unauthenticated",
      code: "identity_unavailable",
      mayHaveExecuted: false,
    })
    expect((error as { cause?: unknown }).cause).toBe(failure)
  })

  it("signs the anonymous principal's calls itself, without asking the auth", async () => {
    const replica = replicaWithWhoami()
    const auth = createTestAuth({ seed: 1, signedIn: false })
    const getIdentity = vi.fn(() => auth.getIdentity())
    const client = clientOn(replica, withIdentity(auth, getIdentity))

    await expect(readAs(client, ANONYMOUS)).resolves.toBe(ANONYMOUS)
    expect(getIdentity).not.toHaveBeenCalled()
  })

  it("reuses a principal's agent, and releases it once a sign-out in another tab makes it no longer current", async () => {
    const replica = replicaWithWhoami()
    const auth = createTestAuth({ seed: 1 })
    const client = clientOn(replica, auth)
    const alice = client.caller()
    const listener = vi.fn()
    client.subscribe(listener)

    const before = await agentFor(client, alice)
    await expect(agentFor(client, alice)).resolves.toBe(before)

    void auth.signOut()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(client.caller()).toBe(ANONYMOUS)
    await expect(agentFor(client, alice)).rejects.toMatchObject({
      kind: "cancelled",
    })

    // Back as the same account, with the same identity object: had alice's
    // agent been kept, it would be handed out again.
    void auth.signIn()
    const after = await agentFor(client, alice)
    expect(after).not.toBe(before)
    await expect(readAs(client, alice)).resolves.toBe(alice)
  })

  it("builds a new agent for a renewed delegation of the same principal, and never hands out the old one again", async () => {
    const replica = replicaWithWhoami()
    const root = Ed25519KeyIdentity.generate()
    const first = await delegate(root)
    const second = await delegate(root)
    let held: Identity = first
    const auth = createTestAuth({ identity: first })
    const client = clientOn(
      replica,
      withIdentity(auth, () => Promise.resolve(held))
    )
    const principal = client.caller()
    expect(principal).toBe(root.getPrincipal().toText())
    const listener = vi.fn()
    client.subscribe(listener)

    const old = await agentFor(client, principal)
    await expect(readAs(client, principal)).resolves.toBe(principal)
    const oldQuery = vi.spyOn(old, "query")
    const oldCall = vi.spyOn(old, "call")

    // An `@icp-sdk/auth` 10 AuthClient rotates its delegation without a
    // notification: only the identity object it hands out changes.
    held = second
    const renewed = await agentFor(client, principal)
    expect(renewed).not.toBe(old)
    for (let i = 0; i < 3; i += 1) {
      await expect(agentFor(client, principal)).resolves.toBe(renewed)
    }
    await expect(readAs(client, principal)).resolves.toBe(principal)

    expect(oldQuery).not.toHaveBeenCalled()
    expect(oldCall).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
  })

  it("hands the renewed agent to a call whose older identity arrives after the renewal", async () => {
    const replica = replicaWithWhoami()
    const root = Ed25519KeyIdentity.generate()
    const first = await delegate(root)
    const second = await delegate(root)
    const auth = createTestAuth({ identity: first })
    const late = deferred()
    let calls = 0
    const client = clientOn(
      replica,
      withIdentity(auth, async () => {
        calls += 1
        if (calls > 1) return second
        // The first request is answered with the delegation it was asked
        // for, but only after the renewal has been handed to a later one.
        await late.promise
        return first
      })
    )
    const principal = client.caller()

    const slow = agentFor(client, principal)
    const renewed = await agentFor(client, principal)
    late.resolve()

    await expect(slow).resolves.toBe(renewed)
    await expect(agentFor(client, principal)).resolves.toBe(renewed)
  })

  it("builds a new agent for a renewal the auth announces, without telling its own listeners", async () => {
    const replica = replicaWithWhoami()
    const root = Ed25519KeyIdentity.generate()
    const auth = createTestAuth({ identity: await delegate(root) })
    const client = clientOn(replica, auth)
    const principal = client.caller()
    const listener = vi.fn()
    client.subscribe(listener)
    const old = await agentFor(client, principal)

    auth.switchTo(await delegate(root))

    expect(listener).not.toHaveBeenCalled()
    const renewed = await agentFor(client, principal)
    expect(renewed).not.toBe(old)
    await expect(readAs(client, principal)).resolves.toBe(principal)
  })
})

describe("the root key", () => {
  it("is fetched from a local replica once per agent, before that agent's first request", async () => {
    // 'local' is the fake replica's default host, http://127.0.0.1:8000.
    const replica = replicaWithWhoami()
    const auth = createTestAuth({ seed: 1 })
    onPage()
    const client = createClient({
      network: "local",
      fetch: replica.fetch,
      auth: () => auth,
    })
    const alice = client.caller()

    await agentFor(client, alice)
    expect(statusRequests(replica)).toBe(0)

    await readAs(client, alice)
    await readAs(client, alice)
    expect(statusRequests(replica)).toBe(1)
    expect(replica.requests[0]?.endpoint).toBe("status")

    auth.switchTo(2)
    const bob = client.caller()
    await expect(readAs(client, bob)).resolves.toBe(bob)
    expect(statusRequests(replica)).toBe(2)
  })

  it("is never fetched when it is given", async () => {
    const replica = replicaWithWhoami()
    const client = createClient({
      network: { host: replica.host, rootKey: replica.rootKey },
      fetch: replica.fetch,
      identity: "anonymous",
    })

    await readAs(client, ANONYMOUS)
    await readAs(client, ANONYMOUS)

    expect(statusRequests(replica)).toBe(0)
  })

  it('is never fetched for "ic": the agent holds the mainnet key it ships with', async () => {
    const replica = replicaWithWhoami("https://icp-api.io")
    const client = createClient({
      network: "ic",
      fetch: replica.fetch,
      identity: "anonymous",
    })

    const agent = await agentFor(client, ANONYMOUS)
    const hex = Array.from(agent.rootKey ?? [], (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
    expect(hex).toBe(IC_ROOT_KEY)
    // The fake's certificates do not verify against mainnet's key, so the
    // read fails; what matters is that no key was asked for.
    await readAs(client, ANONYMOUS).catch(() => {})
    expect(replica.requests.some((r) => r.endpoint === "query")).toBe(true)
    expect(statusRequests(replica)).toBe(0)
  })
})

describe("re-sending", () => {
  it("is never done by the agent itself, for a read or for a write", async () => {
    const replica = replicaWithWhoami()
    const client = createClient({
      network: networkOf(replica),
      fetch: replica.fetch,
      identity: "anonymous",
    })
    const sent = (endpoint: string) =>
      replica.requests.filter((request) => request.endpoint === endpoint).length

    replica.refuseNext(429)
    const refused = await readAs(client, ANONYMOUS).catch((e: unknown) => e)
    expect(refused).toMatchObject({
      code: { name: "HttpErrorCode", status: 429 },
    })
    expect(sent("query")).toBe(1)

    replica.refuseNext(503)
    const agent = await agentFor(client, ANONYMOUS)
    await expect(
      agent.update(CANISTER, {
        methodName: "whoami",
        arg: new Uint8Array(IDL.encode([], [])),
      })
    ).rejects.toMatchObject({ code: { name: "HttpErrorCode", status: 503 } })
    expect(sent("call")).toBe(1)
  })
})

describe("the fetch option", () => {
  it("is what every agent sends with, called as a plain function", async () => {
    const replica = replicaWithWhoami()
    const receivers: unknown[] = []
    const fetch = function (
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit
    ) {
      receivers.push(this)
      return replica.fetch(input, init)
    }
    const client = createClient({
      network: networkOf(replica),
      fetch,
      identity: "anonymous",
    })

    await readAs(client, ANONYMOUS)

    expect(receivers.length).toBeGreaterThan(0)
    // A browser's own `fetch` throws "Illegal invocation" when it is called
    // as a method of something other than `window`.
    expect(receivers.every((receiver) => receiver === undefined)).toBe(true)
  })
})
