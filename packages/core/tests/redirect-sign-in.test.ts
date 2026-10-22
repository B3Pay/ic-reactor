/**
 * Internet Identity's redirect sign-in (ICRC-167, `AuthClient`'s
 * `transport: "redirect"`) through the client: the real `AuthClient` and
 * `UrlTransport` of `@icp-sdk/auth` 10, a fake Internet Identity that answers
 * the request in the URL as its sign-in page would and mints from a canister
 * on a fake replica, and a page that is loaded again after each navigation,
 * keeping only what a browser keeps (`sessionStorage`, `localStorage`).
 *
 * Each load runs the sign-in route's code from the start, as a browser does:
 * the first load sends the user to Internet Identity, and the load it comes
 * back to replays the flow to its end.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthClient, LocalCredentialStorage } from "@icp-sdk/auth/client"
import type { PublicKey } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { DelegationChain, Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { createClient, type Client } from "../src/client.js"
import {
  createFakeReplica,
  type FakeCanister,
} from "../src/testing/fake-replica.js"

/** Internet Identity's canister, where the client's "local" mints. */
const II = "rdmx6-jaaaa-aaaaa-aaadq-cai"
/** The sign-in route, which is also the callback Internet Identity returns to. */
const SIGN_IN = "http://localhost:5173/sign-in"
const HOUR_MS = 3_600_000

/** A `Storage` kept across loads, as a browser keeps one per origin. */
class KeptStorage {
  readonly items = new Map<string, string>()
  get length(): number {
    return this.items.size
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.items.set(key, String(value))
  }
  removeItem(key: string): void {
    this.items.delete(key)
  }
  clear(): void {
    this.items.clear()
  }
}

/**
 * A browser tab: `load(url)` makes the page at `url` the current one, with
 * the globals `AuthClient` and the client read, and the storage the earlier
 * loads wrote. `navigations` lists every URL the page asked to leave for,
 * by `location.assign` or `location.replace`.
 */
function browserTab() {
  const sessionStorage = new KeptStorage()
  const localStorage = new KeptStorage()
  const navigations: string[] = []

  function load(url: string) {
    const at = new URL(url)
    const location = {
      origin: at.origin,
      protocol: at.protocol,
      host: at.host,
      hostname: at.hostname,
      port: at.port,
      pathname: at.pathname,
      search: at.search,
      hash: at.hash,
      href: at.href,
      assign: (to: string) => void navigations.push(to),
      replace: (to: string) => void navigations.push(to),
    }
    const history = {
      replaceState(_state: unknown, _unused: string, to: string) {
        const next = new URL(to, location.href)
        location.pathname = next.pathname
        location.search = next.search
        location.hash = next.hash
        location.href = next.href
      },
    }
    const events = { addEventListener() {}, removeEventListener() {} }
    vi.stubGlobal("window", { location, history, ...events })
    vi.stubGlobal("location", location)
    vi.stubGlobal("history", history)
    vi.stubGlobal("sessionStorage", sessionStorage)
    vi.stubGlobal("localStorage", localStorage)
    vi.stubGlobal("document", {
      cookie: "",
      visibilityState: "visible",
      ...events,
    })
    vi.stubGlobal("addEventListener", () => {})
    vi.stubGlobal("removeEventListener", () => {})
    return location
  }

  return { load, navigations }
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64")
const fromBase64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"))
/** A public key known only by its DER bytes, which is all a delegation needs. */
const keyOf = (der: Uint8Array) =>
  ({ toDer: () => der }) as unknown as PublicKey

interface JsonRpcRequest {
  readonly id: string
  readonly method: string
  readonly params: { readonly sessionPublicKey: string }
}

/**
 * Internet Identity, as the client meets it: a sign-in page that answers the
 * requests in the URL it is sent to, and a canister that mints app
 * delegations. Its keys are Ed25519 ones, which the fake replica can check:
 * the real one signs with canister signatures.
 */
function fakeInternetIdentity() {
  /** The user's key for this app: the principal the app's calls come from. */
  const user = Ed25519KeyIdentity.generate()
  /** The key the session delegation starts from. */
  const session = Ed25519KeyIdentity.generate()
  /** The requests each visit to the sign-in page carried, in order. */
  const visits: JsonRpcRequest[][] = []
  /** How many times a session was ended at the canister. */
  let revoked = 0

  const AppSessionError = IDL.Variant({
    NoSuchSession: IDL.Null,
    NoSuchDelegation: IDL.Null,
    InternalCanisterError: IDL.Text,
  })
  const Prepared = IDL.Record({
    user_key: IDL.Vec(IDL.Nat8),
    expiration: IDL.Nat64,
  })
  const Signed = IDL.Record({
    delegation: IDL.Record({
      pubkey: IDL.Vec(IDL.Nat8),
      expiration: IDL.Nat64,
      targets: IDL.Opt(IDL.Vec(IDL.Principal)),
      permissions: IDL.Opt(IDL.Text),
    }),
    signature: IDL.Vec(IDL.Nat8),
  })
  const Ask = IDL.Record({
    session_key: IDL.Vec(IDL.Nat8),
    expiration: IDL.Nat64,
  })
  // Whole milliseconds, so the delegation `DelegationChain.create` signs for a
  // `Date` carries exactly the expiration `app_prepare_delegation` returned.
  const expiration = BigInt(Date.now() + HOUR_MS) * 1_000_000n

  const canister: FakeCanister = {
    update: (method) => {
      if (method === "app_revoke_session") {
        revoked++
        return new Uint8Array(
          IDL.encode(
            [IDL.Variant({ Ok: IDL.Null, Err: AppSessionError })],
            [{ Ok: null }]
          )
        )
      }
      expect(method).toBe("app_prepare_delegation")
      const reply = { user_key: user.getPublicKey().toDer(), expiration }
      return new Uint8Array(
        IDL.encode(
          [IDL.Variant({ Ok: Prepared, Err: AppSessionError })],
          [{ Ok: reply }]
        )
      )
    },
    query: async (method, arg) => {
      expect(method).toBe("app_get_delegation")
      const [ask] = IDL.decode([Ask], arg) as unknown as [
        { session_key: Uint8Array; expiration: bigint },
      ]
      const chain = await DelegationChain.create(
        user,
        keyOf(new Uint8Array(ask.session_key)),
        new Date(Number(ask.expiration / 1_000_000n))
      )
      const [{ delegation, signature }] = chain.delegations
      const reply = {
        delegation: {
          pubkey: new Uint8Array(delegation.pubkey),
          expiration: delegation.expiration,
          targets: [],
          permissions: [],
        },
        signature: new Uint8Array(signature),
      }
      return new Uint8Array(
        IDL.encode(
          [IDL.Variant({ Ok: Signed, Err: AppSessionError })],
          [{ Ok: reply }]
        )
      )
    },
  }

  /**
   * Visits the sign-in page at `url` and comes back: answers each
   * `ii_session_delegation` request in its fragment with a session delegation
   * to the key it names, and returns the callback URL carrying the answers,
   * as ICRC-167 returns them.
   */
  async function signInAt(url: string): Promise<string> {
    const fragment = new URLSearchParams(new URL(url).hash.slice(1))
    const message = JSON.parse(fragment.get("message") ?? "null") as
      JsonRpcRequest | JsonRpcRequest[]
    const requests = Array.isArray(message) ? message : [message]
    visits.push(requests)
    const responses = await Promise.all(
      requests.map(async (request) => {
        expect(request.method).toBe("ii_session_delegation")
        const chain = await DelegationChain.create(
          session,
          keyOf(fromBase64(request.params.sessionPublicKey)),
          new Date(Date.now() + HOUR_MS),
          { targets: [Principal.fromText(II)] }
        )
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            publicKey: toBase64(session.getPublicKey().toDer()),
            signerDelegation: chain.delegations.map((signed) => ({
              delegation: {
                pubkey: toBase64(new Uint8Array(signed.delegation.pubkey)),
                expiration: signed.delegation.expiration.toString(),
                targets: signed.delegation.targets?.map((id) => id.toText()),
              },
              signature: toBase64(new Uint8Array(signed.signature)),
            })),
          },
        }
      })
    )
    const back = new URL(fragment.get("callback") ?? "")
    back.hash = new URLSearchParams({
      message: JSON.stringify(
        responses.length === 1 ? responses[0] : responses
      ),
      state: fragment.get("state") ?? "",
    }).toString()
    return back.href
  }

  return { user, canister, signInAt, visits, revoked: () => revoked }
}

const made: Client[] = []

afterEach(() => {
  for (const client of made.splice(0)) client.dispose()
  vi.unstubAllGlobals()
})

/**
 * A tab, an Internet Identity, and the fake replica its canister runs on, in
 * `globalThis.fetch`: the client builds its agents with the global `fetch`.
 */
function setUp() {
  const ii = fakeInternetIdentity()
  const replica = createFakeReplica({ canisters: { [II]: ii.canister } })
  vi.stubGlobal("fetch", replica.fetch)
  return { ii, tab: browserTab() }
}

/** The sign-in route's client, as its module builds it on each load. */
function signInRouteClient(): Client {
  const client = createClient({
    network: "local",
    auth: (network) =>
      new AuthClient({
        ...network,
        transport: "redirect",
        // Node has no IndexedDB; a redirect needs a store that outlives the
        // page, and this one is `localStorage`.
        credentialStorage: new LocalCredentialStorage(),
        disableBrowserActivity: true,
      }),
  })
  made.push(client)
  return client
}

/**
 * Loads the sign-in route, runs `signIn` there, and waits until the page
 * leaves for Internet Identity. In a browser the page unloads then and the
 * promises never settle; here they reject when the test disposes the client.
 */
async function leaveForInternetIdentity(
  tab: ReturnType<typeof browserTab>,
  signIn: (client: Client) => Array<Promise<void>>
): Promise<string> {
  tab.load(SIGN_IN)
  const client = signInRouteClient()
  for (const started of signIn(client)) void started.catch(() => {})
  await vi.waitFor(() => expect(tab.navigations).toHaveLength(1))
  return tab.navigations[0]
}

describe("a redirect sign-in through the client", () => {
  it("completes with client.signIn() on the load Internet Identity returns to", async () => {
    const { ii, tab } = setUp()

    const ceremony = await leaveForInternetIdentity(tab, (client) => [
      client.signIn(),
    ])
    expect(ceremony).toMatch(/^http:\/\/id\.ai\.localhost:8000\/authorize#/)
    const sent = new URLSearchParams(new URL(ceremony).hash.slice(1))
    expect(sent.get("callback")).toBe(SIGN_IN)

    const page = tab.load(await ii.signInAt(ceremony))
    const client = signInRouteClient()
    await client.signIn()

    expect(client.authState()).toMatchObject({
      status: "signed-in",
      principal: ii.user.getPrincipal().toText(),
    })
    expect(ii.visits).toHaveLength(1)
    expect(tab.navigations).toHaveLength(1)
    // The answer, a delegation, is taken out of the address bar.
    expect(page.hash).toBe("")
  })

  it("is one ceremony when signIn() runs twice on each load, as StrictMode runs an effect", async () => {
    const { ii, tab } = setUp()
    // Each run of the effect builds its own options object.
    const twice = (client: Client) => [
      client.signIn({ returnTo: "/account" }),
      client.signIn({ returnTo: "/account" }),
    ]

    const ceremony = await leaveForInternetIdentity(tab, twice)

    tab.load(await ii.signInAt(ceremony))
    const client = signInRouteClient()
    await Promise.all(twice(client))

    expect(ii.visits).toHaveLength(1)
    expect(ii.visits[0]).toHaveLength(1)
    expect(client.authState()).toMatchObject({
      status: "signed-in",
      principal: ii.user.getPrincipal().toText(),
    })
    expect(tab.navigations.slice(1)).toEqual(["http://localhost:5173/account"])
  })

  it("keeps the answer when a render reads the auth state before signIn() runs", async () => {
    const { ii, tab } = setUp()
    const ceremony = await leaveForInternetIdentity(tab, (client) => [
      client.signIn(),
    ])

    tab.load(await ii.signInAt(ceremony))
    const client = signInRouteClient()
    // A render reads the state, which builds the auth, before effects run.
    expect(client.authState()).toMatchObject({ status: "anonymous" })
    await client.signIn()

    expect(client.authState()).toMatchObject({ status: "signed-in" })
    expect(ii.visits).toHaveLength(1)
  })

  it("signs out with a returnTo after a redirect sign-in", async () => {
    const { ii, tab } = setUp()
    const ceremony = await leaveForInternetIdentity(tab, (client) => [
      client.signIn(),
    ])
    tab.load(await ii.signInAt(ceremony))
    const client = signInRouteClient()
    await client.signIn()

    await client.signOut({ returnTo: "/" })

    expect(client.authState()).toMatchObject({ status: "anonymous" })
    expect(ii.revoked()).toBe(1)
    expect(tab.navigations.slice(1)).toEqual(["http://localhost:5173/"])
  })
})
