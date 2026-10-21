/**
 * Identity attributes the way the auth guide sends them (#914), on the fake
 * replica: the nonce through a client built with an explicit
 * `AnonymousIdentity`, since `identity: "anonymous"` refuses an update, and the
 * finish call through a client built with an `AttributesIdentity`, which
 * carries the attributes as the call's `sender_info`. The guide also reads the
 * `AuthClient` its factory built right after `client.signIn()`, which needs the
 * client to build its auth and ask it to sign in before the call returns.
 *
 * Internet Identity itself is not in the loop: the attributes are fixed bytes,
 * and the fake canister checks only who called. What a canister checks of
 * them is DFINITY's `identity-attributes` library's to test.
 */
import { AnonymousIdentity, Cbor } from "@icp-sdk/core/agent"
import { AttributesIdentity, Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createClient } from "../src/client.js"
import { createFakeReplica } from "../src/testing/fake-replica.js"
import { createTestAuth } from "../src/testing/test-auth.js"
import { ANONYMOUS, clientAs, onPage, serve } from "./canister-helpers.js"
import * as accounts from "./fixtures/accounts.js"

const ACCOUNTS = "bkyz2-fmaaa-aaaaa-qaaaq-cai"
const INTERNET_IDENTITY = "rdmx6-jaaaa-aaaaa-aaadq-cai"
const NONCE = Uint8Array.from({ length: 32 }, (_, i) => i)
const BUNDLE = {
  data: Uint8Array.from([0x44, 0x49, 0x44, 0x4c]),
  signature: Uint8Array.from([1, 2, 3, 4, 5]),
}

/** An accounts canister that issues {@link NONCE} and records its callers. */
const accountsReplica = (
  finish: accounts.Actor["_internet_identity_sign_in_finish"] extends () => Promise<
    infer R
  >
    ? () => R
    : never = () => ({ tag: "ok" })
) => {
  const callers: Array<{ method: string; caller: string }> = []
  const replica = createFakeReplica({
    canisters: {
      [ACCOUNTS]: serve<accounts.Actor>(accounts.actor, {
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("identity attributes, as the auth guide sends them", () => {
  it("mints the nonce through a client built with an explicit AnonymousIdentity, which identity: anonymous refuses", async () => {
    const { replica, callers } = accountsReplica()
    const readOnly = clientAs(replica, "anonymous")
    await expect(
      readOnly
        .canister<accounts.Actor>(accounts.actor, { id: ACCOUNTS })
        ._internet_identity_sign_in_start()
    ).rejects.toMatchObject({
      kind: "unauthenticated",
      code: "anonymous_write",
    })
    expect(callers).toEqual([])
    readOnly.dispose()

    const anonymous = clientAs(replica, new AnonymousIdentity())
    const nonce = await anonymous
      .canister<accounts.Actor>(accounts.actor, { id: ACCOUNTS })
      ._internet_identity_sign_in_start()
    // `requestAttributes` takes `() => Promise<Uint8Array>`: the blob comes
    // back as one, not as an array of numbers.
    expect(nonce).toBeInstanceOf(Uint8Array)
    expect([...nonce]).toEqual([...NONCE])
    expect(callers).toEqual([{ method: "start", caller: ANONYMOUS }])
    anonymous.dispose()
  })

  it("sends an AttributesIdentity's attributes as the call's sender_info, signed by the identity it wraps", async () => {
    const { replica, callers } = accountsReplica()
    const inner = Ed25519KeyIdentity.generate()
    const sent: Array<Record<string, unknown>> = []
    const client = createClient({
      network: { host: replica.host, rootKey: replica.rootKey },
      fetch: async (input, init) => {
        if (String(input).endsWith("/call")) {
          const body = new Uint8Array(
            await new Response(init?.body as BodyInit).arrayBuffer()
          )
          const envelope = Cbor.decode(body) as {
            content: Record<string, unknown>
          }
          sent.push(envelope.content)
        }
        return replica.fetch(input, init)
      },
      identity: new AttributesIdentity({
        inner,
        attributes: BUNDLE,
        signer: { canisterId: Principal.fromText(INTERNET_IDENTITY) },
      }),
    })
    expect(client.authState()).toMatchObject({
      status: "signed-in",
      principal: inner.getPrincipal().toText(),
    })

    const viaClient = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
    })
    await viaClient._internet_identity_sign_in_finish()

    // The replica checked the signature over the content, sender_info
    // included, and saw the wrapped identity as the caller.
    expect(callers).toEqual([
      { method: "finish", caller: inner.getPrincipal().toText() },
    ])
    expect(replica.requests.filter((r) => r.refused)).toEqual([])
    expect(sent).toHaveLength(1)
    const info = sent[0]?.sender_info as Record<string, Uint8Array> | undefined
    expect(info).toBeDefined()
    expect([...(info?.signer ?? [])]).toEqual([
      ...Principal.fromText(INTERNET_IDENTITY).toUint8Array(),
    ])
    expect([...(info?.info ?? [])]).toEqual([...BUNDLE.data])
    expect([...(info?.sig ?? [])]).toEqual([...BUNDLE.signature])
    client.dispose()
  })

  it("resolves accepted attributes, rejects refused ones as a canister_err that names the library's error, and a trap as rejected", async () => {
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
      // The library traps on a signer it does not trust.
      if (answer === "trap") throw new Error("untrusted attribute signer")
      return answer
    })
    const client = clientAs(
      replica,
      new AttributesIdentity({
        inner: Ed25519KeyIdentity.generate(),
        attributes: BUNDLE,
        signer: { canisterId: Principal.fromText(INTERNET_IDENTITY) },
      })
    )
    const viaClient = client.canister<accounts.Actor>(accounts.actor, {
      id: ACCOUNTS,
    })
    // `variant { ok; err }`, as a Motoko `Result` is spelled: ok resolves.
    await expect(viaClient._internet_identity_sign_in_finish()).resolves.toBe(
      null
    )
    await expect(
      viaClient._internet_identity_sign_in_finish()
    ).rejects.toMatchObject({
      kind: "canister_err",
      err: { tag: "Stale", value: { ageNs: 400_000_000_000n } },
    })
    await expect(
      viaClient._internet_identity_sign_in_finish()
    ).rejects.toMatchObject({ kind: "rejected", rejectCode: 5 })
    client.dispose()
  })

  it("builds its auth and asks it to sign in before signIn() returns, so the guide reads the AuthClient right after", async () => {
    onPage()
    const { replica } = accountsReplica()
    const auth = createTestAuth({ seed: 1 })
    void auth.signOut()
    const events: string[] = []
    const client = createClient({
      network: { host: replica.host, rootKey: replica.rootKey },
      fetch: replica.fetch,
      auth: () => {
        events.push("factory")
        return {
          ...auth,
          signIn: (options?: unknown) => {
            events.push("signIn")
            return auth.signIn(options as number | undefined)
          },
        }
      },
    })
    expect(events).toEqual([])

    const signedIn = client.signIn()
    expect(events).toEqual(["factory", "signIn"])
    await signedIn
    expect(client.authState().status).toBe("signed-in")
    client.dispose()
  })
})
