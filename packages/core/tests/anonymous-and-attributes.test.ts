/**
 * Verified identity attributes through one client (#917), on the fake
 * replica, in its three parts:
 *
 * - `anonymous` on a canister target: the updates it names go out as the
 *   anonymous principal, whoever is signed in and when nobody is, and no other
 *   write does;
 * - `client.requestAttributes()`: the sign-in and the request for attributes
 *   started together;
 * - `attributes` on a canister target: the calls of that canister object, and
 *   of no other, carry them as `sender_info`.
 *
 * Internet Identity itself is not in the loop: the attributes are fixed bytes,
 * and the fake canister records only who called. What a canister checks of
 * them is DFINITY's `identity-attributes` library's to test.
 */
import { Cbor } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { principal } from "@meantjs/schema"
import { MutationObserver } from "@tanstack/query-core"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createClient, type AuthLike, type CallEvent } from "../src/client.js"
import { createFakeReplica } from "../src/testing/fake-replica.js"
import { createTestAuth } from "../src/testing/test-auth.js"
import {
  ANONYMOUS,
  clientAs,
  clientWithAuth,
  serve,
} from "./canister-helpers.js"
import * as accounts from "./fixtures/accounts.js"

const ACCOUNTS = "bkyz2-fmaaa-aaaaa-qaaaq-cai"
const INTERNET_IDENTITY = "rdmx6-jaaaa-aaaaa-aaadq-cai"
const OTHER_SIGNER = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const START = "_internet_identity_sign_in_start"
const FINISH = "_internet_identity_sign_in_finish"
const NONCE = Uint8Array.from({ length: 32 }, (_, i) => i)
const bundle = () => ({
  data: Uint8Array.from([0x44, 0x49, 0x44, 0x4c]),
  signature: Uint8Array.from([1, 2, 3, 4, 5]),
})

/** An accounts canister that issues {@link NONCE} and records its callers. */
const accountsReplica = (
  finish: () =>
    | { tag: "ok" }
    | { tag: "err"; value: accounts.IdentityAttributesError } = () => ({
    tag: "ok",
  })
) => {
  const callers: Array<{ method: string; caller: string }> = []
  const replica = createFakeReplica({
    canisters: {
      [ACCOUNTS]: serve<accounts.Actor>(accounts.actor, {
        getProfile: () => null,
        _internet_identity_sign_in_start: (_, { caller }) => {
          callers.push({ method: "start", caller })
          return NONCE
        },
        _internet_identity_sign_in_finish: (_, { caller }) => {
          callers.push({ method: "finish", caller })
          return finish()
        },
      }),
    },
  })
  return { replica, callers }
}

/** A `fetch` for `replica` that keeps the content of every `call` request. */
const recording = (replica: ReturnType<typeof createFakeReplica>) => {
  const sent: Array<Record<string, unknown>> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/call")) {
      const body = new Uint8Array(
        await new Response(init?.body as BodyInit).arrayBuffer()
      )
      sent.push(
        (Cbor.decode(body) as { content: Record<string, unknown> }).content
      )
    }
    return replica.fetch(input, init)
  }
  return { sent, fetch }
}

const senderInfoOf = (content: Record<string, unknown> | undefined) =>
  content?.sender_info as Record<string, Uint8Array> | undefined

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("anonymous: the updates anyone may send", () => {
  it("sends a named update as the anonymous principal for a signed-in caller, and every other write as the caller", async () => {
    const { replica, callers } = accountsReplica()
    const identity = Ed25519KeyIdentity.generate()
    const client = clientAs(replica, identity)
    const canister = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      anonymous: [START],
    })

    const nonce = await canister[START]()
    expect([...nonce]).toEqual([...NONCE])
    await canister[FINISH]()

    expect(callers).toEqual([
      { method: "start", caller: ANONYMOUS },
      { method: "finish", caller: identity.getPrincipal().toText() },
    ])
    expect(replica.requests.filter((r) => r.refused)).toEqual([])
    client.dispose()
  })

  it("sends a named update while nobody is signed in, and still refuses the writes nobody named", async () => {
    const { replica, callers } = accountsReplica()
    for (const client of [
      clientAs(replica, "anonymous"),
      (() => {
        const auth = createTestAuth({ seed: 1 })
        void auth.signOut()
        return clientWithAuth(replica, auth)
      })(),
    ]) {
      callers.length = 0
      const canister = client.canister<accounts.Actor>(accounts.actor, {
        id: ACCOUNTS,
        anonymous: [START],
      })
      await expect(canister[START]()).resolves.toBeInstanceOf(Uint8Array)
      await expect(canister[FINISH]()).rejects.toMatchObject({
        kind: "unauthenticated",
        code: "anonymous_write",
        mayHaveExecuted: false,
      })
      // The canister object made without the option refuses both.
      const plain = client.canister<accounts.Actor>(accounts.actor, {
        id: ACCOUNTS,
      })
      await expect(plain[START]()).rejects.toMatchObject({
        kind: "unauthenticated",
      })
      expect(callers).toEqual([{ method: "start", caller: ANONYMOUS }])
      client.dispose()
    }
  })

  it("sends it as nobody through an auth that is signed in, and when the person signs in while it waits", async () => {
    const { replica, callers } = accountsReplica()
    const auth = createTestAuth({ seed: 1 })
    const client = clientWithAuth(replica, auth)
    expect(client.authState().status).toBe("signed-in")
    const canister = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      anonymous: [START],
    })

    await canister[START]()
    // A switch of account between the call and its send cancels a call made
    // as the caller (`caller_changed`); a call made as nobody has none.
    const pending = canister[START]()
    void auth.signIn(2)
    await pending

    expect(callers).toEqual([
      { method: "start", caller: ANONYMOUS },
      { method: "start", caller: ANONYMOUS },
    ])
    client.dispose()
  })

  it("sends a mutation of a named update as nobody, and tells onCall so", async () => {
    const { replica, callers } = accountsReplica()
    const client = clientAs(replica, Ed25519KeyIdentity.generate())
    const events: CallEvent[] = []
    client.onCall((event) => {
      events.push(event)
    })
    const canister = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      anonymous: [START],
    })

    const observer = new MutationObserver(
      client.queryClient,
      client.mutationOptions(canister, START)
    )
    const nonce = await observer.mutate()

    expect([...nonce]).toEqual([...NONCE])
    expect(callers).toEqual([{ method: "start", caller: ANONYMOUS }])
    expect(events[0]).toMatchObject({
      phase: "start",
      via: "mutation",
      method: START,
      caller: ANONYMOUS,
    })
    client.dispose()
  })

  it("sends it from a view of a caller who is no longer current, whose other writes are refused", async () => {
    const { replica, callers } = accountsReplica()
    const auth = createTestAuth({ seed: 1 })
    const client = clientWithAuth(replica, auth)
    const shown = client.caller()
    // The view a render of `shown` holds, as `@ic-reactor/react` asks for it.
    const view = (
      client as unknown as Record<symbol, (principal: string) => typeof client>
    )[Symbol.for("ic-reactor.client.as")]!.call(client, shown)
    const canister = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      anonymous: [START],
    })
    const start = new MutationObserver(
      client.queryClient,
      view.mutationOptions(canister, START)
    )
    const finish = new MutationObserver(
      client.queryClient,
      view.mutationOptions(canister, FINISH)
    )

    await auth.signIn(2)
    expect(client.caller()).not.toBe(shown)

    await expect(finish.mutate()).rejects.toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
    })
    await expect(start.mutate()).resolves.toBeInstanceOf(Uint8Array)
    expect(callers).toEqual([{ method: "start", caller: ANONYMOUS }])
    client.dispose()
  })

  it("cancels a named update on a disposed client, as it does every call", async () => {
    const { replica, callers } = accountsReplica()
    const client = clientAs(replica, Ed25519KeyIdentity.generate())
    const canister = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      anonymous: [START],
    })
    client.dispose()

    await expect(canister[START]()).rejects.toMatchObject({
      kind: "cancelled",
      code: "client_disposed",
    })
    expect(callers).toEqual([])
  })

  it("gives one canister object for the same names in any order, and another without them", () => {
    const { replica } = accountsReplica()
    const client = clientAs(replica, "anonymous")
    const make = (anonymous?: readonly string[]) =>
      client.canister<accounts.Actor>(accounts.actor, {
        id: ACCOUNTS,
        anonymous,
      })

    expect(make([START, FINISH])).toBe(make([FINISH, START, START]))
    expect(make([START])).not.toBe(make([START, FINISH]))
    expect(make([START])).not.toBe(make())
    // Naming none is naming nothing.
    expect(make([])).toBe(make())
    client.dispose()
  })

  it("refuses a name that is no method, a read, and anything that is not a list of names", () => {
    const { replica } = accountsReplica()
    const client = clientAs(replica, "anonymous")
    const make = (anonymous: unknown) =>
      client.canister<accounts.Actor>(accounts.actor, {
        id: ACCOUNTS,
        anonymous,
      } as never)

    expect(() => make(["sign_in"])).toThrow(
      /anonymous names "sign_in", which is no method of the service/
    )
    expect(() => make(["getProfile"])).toThrow(
      /anonymous names getProfile, a query;/
    )
    expect(() => make(START)).toThrow(/anonymous is a list of method names/)
    expect(() => make([1])).toThrow(/anonymous is a list of method names/)
    client.dispose()
  })
})

describe("attributes: sender_info for the canister that checks it", () => {
  it("carries the attributes on the calls of that canister object, signed by the caller, and on no other call", async () => {
    const { replica, callers } = accountsReplica()
    const { sent, fetch } = recording(replica)
    const identity = Ed25519KeyIdentity.generate()
    const client = createClient({
      network: { host: replica.host, rootKey: replica.rootKey },
      fetch,
      identity,
    })
    const attributes = { ...bundle(), signer: INTERNET_IDENTITY }
    const proving = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      attributes,
    })
    // What is sent is what the canister object was made with.
    attributes.data.fill(0)
    attributes.signature.fill(0)

    await proving[FINISH]()
    const plain = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
    })
    await plain[FINISH]()

    // The replica checked each signature over the content, sender_info
    // included, and saw the identity as the caller both times.
    const caller = identity.getPrincipal().toText()
    expect(callers).toEqual([
      { method: "finish", caller },
      { method: "finish", caller },
    ])
    expect(replica.requests.filter((r) => r.refused)).toEqual([])
    expect(sent).toHaveLength(2)
    const info = senderInfoOf(sent[0])
    expect([...(info?.signer ?? [])]).toEqual([
      ...Principal.fromText(INTERNET_IDENTITY).toUint8Array(),
    ])
    expect([...(info?.info ?? [])]).toEqual([...bundle().data])
    expect([...(info?.sig ?? [])]).toEqual([...bundle().signature])
    expect(senderInfoOf(sent[1])).toBeUndefined()
    client.dispose()
  })

  it("takes the signer from the network's identity provider, and refuses where nothing names one", async () => {
    const { replica } = accountsReplica()
    // A replica with its own root key on a host that is not local: nothing
    // says who signs people in there.
    const unnamed = createClient({
      network: {
        host: "https://replica.example.com",
        rootKey: replica.rootKey,
      },
      identity: Ed25519KeyIdentity.generate(),
    })
    expect(() =>
      unnamed.canister<accounts.Actor>(accounts.actor, {
        id: ACCOUNTS,
        attributes: bundle(),
      })
    ).toThrow(
      /this network names no identity provider; pass attributes\.signer/
    )
    unnamed.dispose()

    const mainnet = createClient({
      network: "ic",
      identity: Ed25519KeyIdentity.generate(),
    })
    expect(() =>
      mainnet.canister<accounts.Actor>(accounts.actor, {
        id: ACCOUNTS,
        attributes: bundle(),
      })
    ).not.toThrow()
    mainnet.dispose()

    // A local replica: icp-cli's built-in Internet Identity, whose id is
    // mainnet's.
    const { sent, fetch } = recording(replica)
    const local = createClient({
      network: { host: replica.host, rootKey: replica.rootKey },
      fetch,
      identity: Ed25519KeyIdentity.generate(),
    })
    const withSigner = local.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      attributes: bundle(),
    })
    await withSigner[FINISH]()
    expect([...(senderInfoOf(sent[0])?.signer ?? [])]).toEqual([
      ...Principal.fromText(INTERNET_IDENTITY).toUint8Array(),
    ])
    local.dispose()
  })

  it("signs with the signer it is given", async () => {
    const { replica } = accountsReplica()
    const { sent, fetch } = recording(replica)
    const client = createClient({
      network: { host: replica.host, rootKey: replica.rootKey },
      fetch,
      identity: Ed25519KeyIdentity.generate(),
    })

    const onLocal = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      attributes: { ...bundle(), signer: OTHER_SIGNER },
    })

    await onLocal[FINISH]()

    expect([...(senderInfoOf(sent[0])?.signer ?? [])]).toEqual([
      ...Principal.fromText(OTHER_SIGNER).toUint8Array(),
    ])
    client.dispose()
  })

  it("gives one canister object for one attributes object, and another for another", () => {
    const { replica } = accountsReplica()
    const client = clientAs(replica, Ed25519KeyIdentity.generate())
    const first = { ...bundle(), signer: INTERNET_IDENTITY }
    const make = (attributes: typeof first) =>
      client.canister<accounts.Actor>(accounts.actor, {
        id: ACCOUNTS,
        attributes,
      })

    expect(make(first)).toBe(make(first))
    expect(make(first)).not.toBe(make({ ...first }))
    expect(make(first)).not.toBe(
      client.canister<accounts.Actor>(accounts.actor, { id: ACCOUNTS })
    )
    client.dispose()
  })

  it("resolves accepted attributes, rejects refused ones as a canister_err, and a trap as rejected", async () => {
    const answers: Array<
      | { tag: "ok" }
      | { tag: "err"; value: accounts.IdentityAttributesError }
      | "trap"
    > = [
      { tag: "ok" },
      {
        tag: "err",
        value: { tag: "Stale", value: { ageNs: 400_000_000_000n } },
      },
      "trap",
    ]
    const { replica } = accountsReplica(() => {
      const answer = answers.shift() ?? { tag: "ok" }
      if (answer === "trap") throw new Error("untrusted attribute signer")
      return answer
    })
    const client = clientAs(replica, Ed25519KeyIdentity.generate())
    const proving = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      attributes: { ...bundle(), signer: INTERNET_IDENTITY },
    })

    await expect(proving[FINISH]()).resolves.toBe(null)
    await expect(proving[FINISH]()).rejects.toMatchObject({
      kind: "canister_err",
      err: { tag: "Stale", value: { ageNs: 400_000_000_000n } },
    })
    await expect(proving[FINISH]()).rejects.toMatchObject({
      kind: "rejected",
      rejectCode: 5,
    })
    client.dispose()
  })

  it("sends a mutation with them, and has the reads of the canister asked again", async () => {
    const { replica } = accountsReplica()
    const { sent, fetch } = recording(replica)
    const identity = Ed25519KeyIdentity.generate()
    const client = createClient({
      network: { host: replica.host, rootKey: replica.rootKey },
      fetch,
      identity,
    })
    const plain = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
    })
    const read = client.queryOptions(
      plain,
      "getProfile",
      principal(identity.getPrincipal().toText())
    )
    await client.queryClient.fetchQuery(read)
    expect(client.queryClient.getQueryState(read.queryKey)?.isInvalidated).toBe(
      false
    )

    const proving = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      attributes: { ...bundle(), signer: INTERNET_IDENTITY },
    })
    await new MutationObserver(
      client.queryClient,
      client.mutationOptions(proving, FINISH)
    ).mutate()

    expect(senderInfoOf(sent[0])).toBeDefined()
    expect(client.queryClient.getQueryState(read.queryKey)?.isInvalidated).toBe(
      true
    )
    client.dispose()
  })

  it("refuses a read built from it, whose key would be that of the read made without", () => {
    const { replica } = accountsReplica()
    const client = clientAs(replica, Ed25519KeyIdentity.generate())
    const proving = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      attributes: { ...bundle(), signer: INTERNET_IDENTITY },
    })

    expect(() =>
      client.queryOptions(proving, "getProfile", principal("aaaaa-aa"))
    ).toThrow(/carries attributes, which a read's key does not/)
    // Its keys are the canister's, for an invalidation by hand.
    expect(client.queryKey(proving)).toEqual(
      client.queryKey(
        client.canister<accounts.Actor>(accounts.actor, { id: ACCOUNTS })
      )
    )
    client.dispose()
  })

  it("refuses attributes that are not bytes, a signer that is no principal, and attributes with anonymous", () => {
    const { replica } = accountsReplica()
    const client = clientAs(replica, Ed25519KeyIdentity.generate())
    const make = (target: object) =>
      client.canister<accounts.Actor>(accounts.actor, {
        id: ACCOUNTS,
        ...target,
      } as never)

    expect(() => make({ attributes: { data: [1], signature: [2] } })).toThrow(
      /attributes is \{ data, signature \} as bytes/
    )
    expect(() => make({ attributes: "verified_email" })).toThrow(
      /attributes is \{ data, signature \} as bytes/
    )
    expect(() =>
      make({ attributes: { ...bundle(), signer: "internet-identity" } })
    ).toThrow(/attributes\.signer is principal text/)
    expect(() =>
      make({
        attributes: { ...bundle(), signer: INTERNET_IDENTITY },
        anonymous: [START],
      })
    ).toThrow(/give one of anonymous and attributes/)
    client.dispose()
  })
})

describe("client.requestAttributes()", () => {
  /** A test auth that also answers `requestAttributes`, and records the order of what it is asked. */
  const attributingAuth = (
    answer: (nonce: Uint8Array) => unknown = () => bundle()
  ) => {
    const auth = createTestAuth({ seed: 1 })
    void auth.signOut()
    const events: string[] = []
    const asked: Array<{ keys: string[]; nonce: Uint8Array }> = []
    const like: AuthLike = {
      ...auth,
      signIn: (options?: unknown) => {
        events.push("signIn")
        return auth.signIn(options as number | undefined)
      },
      requestAttributes: async ({ keys, nonce }) => {
        events.push("requestAttributes")
        const bytes = await nonce()
        asked.push({ keys, nonce: bytes })
        return answer(bytes) as { data: Uint8Array; signature: Uint8Array }
      },
    }
    return { like, events, asked }
  }

  it("starts the sign-in and the request in one synchronous run, with the canister's nonce, and the finish call verifies as the person", async () => {
    const { replica, callers } = accountsReplica()
    const { like, events, asked } = attributingAuth()
    const client = clientWithAuth(replica, like)
    const canister = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      anonymous: [START],
    })

    const requested = client.requestAttributes({
      keys: ["verified_email"],
      nonce: () => canister[START](),
    })
    // Before anything was awaited: one window for both.
    expect(events).toEqual(["signIn", "requestAttributes"])
    const attributes = await requested

    expect(Object.isFrozen(attributes)).toBe(true)
    expect([...attributes.data]).toEqual([...bundle().data])
    expect([...attributes.signature]).toEqual([...bundle().signature])
    expect(asked).toHaveLength(1)
    expect(asked[0]?.keys).toEqual(["verified_email"])
    expect([...(asked[0]?.nonce ?? [])]).toEqual([...NONCE])
    expect(client.authState().status).toBe("signed-in")

    const proving = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
      attributes: { ...attributes, signer: INTERNET_IDENTITY },
    })

    await proving[FINISH]()
    expect(callers).toEqual([
      { method: "start", caller: ANONYMOUS },
      { method: "finish", caller: client.caller() },
    ])
    expect(client.caller()).not.toBe(ANONYMOUS)
    client.dispose()
  })

  it("asks for the attributes alone with signIn: false, for a person signed in already", async () => {
    const { replica } = accountsReplica()
    const { like, events } = attributingAuth()
    const client = clientWithAuth(replica, like)
    await client.signIn()
    const who = client.caller()
    events.length = 0

    const attributes = await client.requestAttributes({
      keys: ["verified_email"],
      nonce: () => Promise.resolve(NONCE),
      signIn: false,
    })

    expect(events).toEqual(["requestAttributes"])
    expect([...attributes.data]).toEqual([...bundle().data])
    expect(client.caller()).toBe(who)
    client.dispose()
  })

  it("rejects with the sign-in's error when it fails, and with the request's when only that fails", async () => {
    const { replica } = accountsReplica()
    const closed = new Error("the window was closed")
    const refusedByProvider = new Error("the provider refused the attributes")

    const first = attributingAuth(() => {
      throw refusedByProvider
    })
    const failing: AuthLike = {
      ...first.like,
      signIn: () => Promise.reject(closed),
    }
    const client = clientWithAuth(replica, failing)
    const nonce = () => Promise.resolve(NONCE)
    await expect(
      client.requestAttributes({ keys: ["email"], nonce })
    ).rejects.toBe(closed)
    client.dispose()

    const second = attributingAuth(() => {
      throw refusedByProvider
    })
    const other = clientWithAuth(replica, second.like)
    await expect(
      other.requestAttributes({ keys: ["email"], nonce })
    ).rejects.toBe(refusedByProvider)
    // The sign-in itself went through.
    expect(other.authState().status).toBe("signed-in")
    other.dispose()
  })

  it("rejects with a TypeError for an auth without requestAttributes, a client built with identity, and a request that names no keys", async () => {
    const { replica } = accountsReplica()
    const nonce = () => Promise.resolve(NONCE)

    const plain = createTestAuth({ seed: 1 })
    const withoutIt = clientWithAuth(replica, plain as AuthLike)
    await expect(
      withoutIt.requestAttributes({ keys: ["email"], nonce })
    ).rejects.toThrow(/this client's auth has no requestAttributes\(\)/)
    withoutIt.dispose()

    const fixed = clientAs(replica, Ed25519KeyIdentity.generate())
    await expect(
      fixed.requestAttributes({ keys: ["email"], nonce })
    ).rejects.toThrow(/needs a client built with auth/)
    fixed.dispose()

    const { like, events } = attributingAuth()
    const client = clientWithAuth(replica, like)
    await expect(client.requestAttributes({ keys: [], nonce })).rejects.toThrow(
      /takes \{ keys, nonce \}/
    )
    await expect(
      client.requestAttributes({ keys: ["email"] } as never)
    ).rejects.toThrow(/takes \{ keys, nonce \}/)
    // Nothing was asked of the auth for a request that was refused.
    expect(events).toEqual([])
    client.dispose()
  })

  it("rejects with a TypeError when the auth resolves with something that is not signed attributes", async () => {
    const { replica } = accountsReplica()
    const { like } = attributingAuth(() => ({ data: "DIDL" }))
    const client = clientWithAuth(replica, like)

    await expect(
      client.requestAttributes({
        keys: ["email"],
        nonce: () => Promise.resolve(NONCE),
      })
    ).rejects.toThrow(/not \{ data, signature \} as bytes/)
    client.dispose()
  })
})
