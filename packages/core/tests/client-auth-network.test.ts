/**
 * What `createClient` hands its `auth` factory: the agent options of its own
 * agents and the identity provider to sign in with, under `@icp-sdk/auth`
 * 10's option names, so that `(network) => new AuthClient(network)` signs in
 * on the client's network. And the development warning for a network that is
 * not mainnet's and has no identity provider anyone could name, where an
 * `AuthClient` would sign in with mainnet's Internet Identity and every
 * delegation it minted would be rejected.
 *
 * The factory runs only in a browser, so every test stands on a fake page.
 * Nothing here sends a request: the factory is called on first use, which
 * `caller()` is.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthClient } from "@icp-sdk/auth/client"
import { IC_ROOT_KEY } from "@icp-sdk/core/agent"
import {
  createClient,
  type AuthLike,
  type Client,
  type ClientOptions,
} from "../src/client.js"
import { createTestAuth } from "../src/testing/test-auth.js"
import { createTestClient } from "../src/testing/index.js"
import {
  COOKIE_ROOT_KEY,
  GIVEN_ROOT_KEY,
  icEnvCookie,
  stubPage,
  stubProcessEnv,
} from "./network-helpers.js"

/** Internet Identity's canister, on mainnet and on icp-cli's local networks. */
const II = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/** A project's own Internet Identity, as `icp deploy` would give it an id. */
const PROJECT_II = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

/** Mainnet's root key, as bytes. */
const MAINNET_ROOT_KEY = Uint8Array.from(
  IC_ROOT_KEY.match(/../g)!.map((byte) => parseInt(byte, 16))
)

type AuthNetwork = Parameters<
  Extract<ClientOptions, { auth: unknown }>["auth"]
>[0]

const made: Client[] = []

afterEach(() => {
  for (const client of made.splice(0)) client.dispose()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** Mutes `console.warn`, and returns the spy. */
const muteWarnings = () =>
  vi.spyOn(console, "warn").mockImplementation(() => {})

/**
 * Builds a client on `network` with a factory that records its argument,
 * makes it build its auth, and returns what the factory was given.
 */
function handedTo(
  network: ClientOptions["network"],
  extra: { allowEnvConfig?: boolean } = {}
): AuthNetwork {
  const factory = vi.fn((_network: AuthNetwork): AuthLike => createTestAuth())
  const client = createClient({ network, auth: factory, ...extra })
  made.push(client)
  client.caller()
  expect(factory).toHaveBeenCalledTimes(1)
  return factory.mock.calls[0]![0]
}

/** The `ic_env` cookie the Vite plugin writes for icp-cli's built-in Internet Identity. */
const cookieWithProvider = (
  provider = "http://id.ai.localhost:8001/authorize",
  extra: Record<string, string> = {}
) => icEnvCookie({ ...extra, INTERNET_IDENTITY_PROVIDER: provider })

/**
 * The provider `@icp-sdk/auth` 10's `AuthClient` constructor signs in with:
 * `options.identityProvider`, read as it reads it, or mainnet's.
 */
const providerOf = (options: AuthNetwork) =>
  options.identityProvider ?? {
    authorizeUrl: "https://id.ai/authorize",
    canisterId: II,
  }

/** A factory that reads its options as `new AuthClient(network)` does. */
function readsLikeAuthClient(options: AuthNetwork): AuthLike {
  void providerOf(options)
  return createTestAuth()
}

describe("the network an auth factory is handed", () => {
  it("is mainnet's for \"ic\", with no identity provider (AuthClient's defaults)", () => {
    stubPage("https://app.example.com")
    const warn = muteWarnings()

    expect(handedTo("ic")).toEqual({
      agentOptions: { host: "https://icp-api.io", shouldFetchRootKey: false },
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('names icp-cli\'s built-in Internet Identity on port 8000 for "local", as the Vite plugin does', () => {
    stubPage("https://app.example.com")

    expect(handedTo("local")).toEqual({
      agentOptions: { host: "http://127.0.0.1:8000", shouldFetchRootKey: true },
      identityProvider: {
        authorizeUrl: "http://id.ai.localhost:8000/authorize",
        canisterId: II,
      },
    })
  })

  it("names the built-in Internet Identity on a local host's own port, with the root key it was given", () => {
    stubPage("https://app.example.com")

    // A gateway on a port other than icp-cli's default (gateway.port).
    expect(
      handedTo({ host: "http://localhost:8080", rootKey: GIVEN_ROOT_KEY })
    ).toEqual({
      agentOptions: {
        host: "http://localhost:8080",
        rootKey: GIVEN_ROOT_KEY,
        shouldFetchRootKey: false,
      },
      identityProvider: {
        authorizeUrl: "http://id.ai.localhost:8080/authorize",
        canisterId: II,
      },
    })
  })

  it("names no identity provider for a host that is not local and has its own root key", () => {
    stubPage("https://app.example.com")
    muteWarnings()

    expect(
      handedTo({ host: "https://testnet.example.com", rootKey: GIVEN_ROOT_KEY })
    ).toEqual({
      agentOptions: {
        host: "https://testnet.example.com",
        rootKey: GIVEN_ROOT_KEY,
        shouldFetchRootKey: false,
      },
    })
  })

  it("takes the trusted cookie's provider for \"env\" on a local page, with the cookie's root key", () => {
    stubPage("http://localhost:5173", { cookie: cookieWithProvider() })

    expect(handedTo("env")).toEqual({
      agentOptions: {
        host: "http://localhost:5173",
        rootKey: COOKIE_ROOT_KEY,
        shouldFetchRootKey: false,
      },
      identityProvider: {
        authorizeUrl: "http://id.ai.localhost:8001/authorize",
        canisterId: II,
      },
    })
  })

  it("takes the cookie's internet_identity canister with its provider when it names both", () => {
    stubPage("http://localhost:5173", {
      cookie: cookieWithProvider("http://id.ai.localhost:8001/authorize", {
        "PUBLIC_CANISTER_ID:internet_identity": PROJECT_II,
      }),
    })

    expect(handedTo("env").identityProvider).toEqual({
      authorizeUrl: "http://id.ai.localhost:8001/authorize",
      canisterId: PROJECT_II,
    })
  })

  it("prefers the cookie's provider to the built-in one for a local host", () => {
    stubPage("http://localhost:5173", { cookie: cookieWithProvider() })

    expect(handedTo("local").identityProvider).toEqual({
      authorizeUrl: "http://id.ai.localhost:8001/authorize",
      canisterId: II,
    })
  })

  it("does not read a provider from a cookie it does not trust", () => {
    stubPage("http://localhost:5173", { cookie: cookieWithProvider() })
    muteWarnings()

    expect(
      handedTo("env", { allowEnvConfig: false }).identityProvider
    ).toBeUndefined()
  })

  it('takes the cookie\'s provider for "ic" when allowEnvConfig: true trusts the cookie', () => {
    stubPage("https://app.example.com", {
      cookie: cookieWithProvider("https://id.example.com/authorize"),
    })

    expect(handedTo("ic", { allowEnvConfig: true }).identityProvider).toEqual({
      authorizeUrl: "https://id.example.com/authorize",
      canisterId: II,
    })
  })

  it("ignores a cookie's INTERNET_IDENTITY_PROVIDER that is not an http(s) URL", () => {
    stubPage("http://localhost:5173", {
      cookie: cookieWithProvider("javascript:alert(1)"),
    })
    muteWarnings()

    expect(handedTo("env").identityProvider).toBeUndefined()
  })

  it("names Internet Identity's own id when the cookie's internet_identity is not principal text", () => {
    stubPage("http://localhost:5173", {
      cookie: cookieWithProvider("http://id.ai.localhost:8001/authorize", {
        "PUBLIC_CANISTER_ID:internet_identity": "not-a-principal",
      }),
    })

    expect(handedTo("env").identityProvider).toEqual({
      authorizeUrl: "http://id.ai.localhost:8001/authorize",
      canisterId: II,
    })
  })

  it("names the built-in Internet Identity on the local host's scheme, with no port where it has none", () => {
    stubPage("https://app.example.com")

    expect(
      handedTo({ host: "https://foo.localhost", rootKey: GIVEN_ROOT_KEY })
        .identityProvider
    ).toEqual({
      authorizeUrl: "https://id.ai.localhost/authorize",
      canisterId: II,
    })
  })

  it('omits the provider for "env" on a mainnet page, whose agent checks against mainnet\'s key', () => {
    stubPage("https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io")

    expect(handedTo("env")).toEqual({
      agentOptions: {
        host: "https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io",
        shouldFetchRootKey: false,
      },
    })
  })

  it('omits the provider for "env" on an ordinary web host, which falls back to mainnet', () => {
    stubPage("https://app.example.com", { cookie: "" })
    stubProcessEnv()

    expect(handedTo("env")).toEqual({
      agentOptions: { host: "https://icp-api.io", shouldFetchRootKey: false },
    })
  })
})

describe("a factory that takes no argument", () => {
  it("still builds the auth the client calls as", async () => {
    stubPage("https://app.example.com")
    const auth = createTestAuth({ seed: 1, signedIn: false })
    const client = createClient({ network: "local", auth: () => auth })
    made.push(client)

    expect(client.authState().status).toBe("anonymous")
    await client.signIn()

    expect(client.caller()).toBe(auth.getPrincipal()!.toText())
    expect(client.authState().status).toBe("signed-in")
  })
})

describe("the warning for a network with no identity provider", () => {
  /**
   * Builds a client whose factory reads `network.identityProvider` as
   * `new AuthClient(network)` does, makes it build its auth, and returns the
   * warnings.
   */
  function warningsFor(
    network: ClientOptions["network"],
    extra: { allowEnvConfig?: boolean } = {}
  ): string[] {
    const warn = muteWarnings()
    const client = createClient({
      network,
      auth: readsLikeAuthClient,
      ...extra,
    })
    made.push(client)
    client.caller()
    return warn.mock.calls.map((call) => String(call[0]))
  }

  const OVERRIDE =
    "(network) => new AuthClient({ ...network, identityProvider: { authorizeUrl, canisterId } })"

  it("is given for a project that deploys its own internet_identity, which the cookie names without a URL", () => {
    stubPage("http://localhost:5173", {
      cookie: icEnvCookie({
        "PUBLIC_CANISTER_ID:internet_identity": PROJECT_II,
      }),
    })

    const warnings = warningsFor("env")

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("sign-in cannot work on this network")
    expect(warnings[0]).toContain(`internet_identity canister (${PROJECT_II})`)
    expect(warnings[0]).toContain(OVERRIDE)
  })

  it('is given for "env" on a local page whose cookie names no provider', () => {
    stubPage("http://localhost:5173")

    const warnings = warningsFor("env")

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("names no INTERNET_IDENTITY_PROVIDER")
    expect(warnings[0]).toContain(OVERRIDE)
  })

  it('is given for "env" on a local page with no cookie at all', () => {
    stubPage("http://localhost:5173", { cookie: "" })

    const warnings = warningsFor("env")

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("names no INTERNET_IDENTITY_PROVIDER")
  })

  it('blames allowEnvConfig: false, not the cookie, for "env" on a local page whose cookie it does not read', () => {
    stubPage("http://localhost:5173", { cookie: cookieWithProvider() })

    const warnings = warningsFor("env", { allowEnvConfig: false })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("allowEnvConfig: false")
    expect(warnings[0]).not.toContain("names no INTERNET_IDENTITY_PROVIDER")
    expect(warnings[0]).toContain(OVERRIDE)
  })

  it("is given for a replica with a root key of its own, given or fetched", () => {
    stubPage("https://app.example.com")
    const given = warningsFor({
      host: "https://testnet.example.com",
      rootKey: GIVEN_ROOT_KEY,
    })
    vi.restoreAllMocks()
    const fetched = warningsFor({
      host: "https://testnet.example.com",
      fetchRootKey: true,
    })

    for (const warnings of [given, fetched]) {
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain("root key is not mainnet's")
      expect(warnings[0]).toContain(OVERRIDE)
    }
  })

  it('is never given for "ic", nor for mainnet "env", even with a cookie that carries mainnet\'s key', () => {
    stubPage("https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io", {
      cookie: icEnvCookie(
        { "PUBLIC_CANISTER_ID:internet_identity": PROJECT_II },
        MAINNET_ROOT_KEY
      ),
    })

    expect(warningsFor("ic")).toEqual([])
    expect(warningsFor("env")).toEqual([])
    expect(warningsFor("env", { allowEnvConfig: true })).toEqual([])
    expect(
      warningsFor({ host: "https://icp-api.io", rootKey: MAINNET_ROOT_KEY })
    ).toEqual([])
  })

  it("is not given where a provider was named", () => {
    stubPage("http://localhost:5173", { cookie: cookieWithProvider() })

    expect(warningsFor("env")).toEqual([])
    expect(warningsFor("local")).toEqual([])
  })

  it("is given once per client, even when its factory throws and runs again", () => {
    stubPage("http://localhost:5173", { cookie: "" })
    const warn = muteWarnings()
    let calls = 0
    const client = createClient({
      network: "env",
      auth: (network) => {
        calls++
        void network.identityProvider
        if (calls === 1) throw new Error("not yet")
        void network.identityProvider
        return createTestAuth()
      },
    })
    made.push(client)

    expect(() => client.caller()).toThrow("not yet")
    client.caller()
    client.authState()

    expect(calls).toBe(2)
    expect(warn).toHaveBeenCalledTimes(1)

    const other = createClient({ network: "env", auth: readsLikeAuthClient })
    made.push(other)
    other.caller()

    expect(warn).toHaveBeenCalledTimes(2)
  })

  it("is not given in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    stubPage("http://localhost:5173", { cookie: "" })

    expect(warningsFor("env")).toEqual([])
  })

  it("is not given by a test client, whose auth ignores the network", async () => {
    const warn = muteWarnings()
    const { client, auth } = createTestClient({ network: "ic" })
    made.push(client)

    await client.signIn()

    expect(client.caller()).toBe(auth.getPrincipal()!.toText())
    expect(warn).not.toHaveBeenCalled()
  })
})

describe("when the warning comes", () => {
  /** A local page with no cookie: "env" there names no identity provider. */
  const gapPage = () => stubPage("http://localhost:5173", { cookie: "" })

  /** The local page's own provider, as an app that knows it would name it. */
  const OWN_PROVIDER = {
    authorizeUrl: "http://id.ai.localhost:8000/authorize",
    canisterId: PROJECT_II,
  }

  /** Builds a client on "env" with `auth`, makes it build its auth, and returns the warnings. */
  function warningsOf(auth: (network: AuthNetwork) => AuthLike): string[] {
    const warn = muteWarnings()
    const client = createClient({ network: "env", auth })
    made.push(client)
    client.caller()
    return warn.mock.calls.map((call) => String(call[0]))
  }

  /**
   * {@link gapPage}, with what the real `AuthClient`'s defaults need of a page
   * and the fake page lacks: `localStorage`, and event listeners on the page
   * and its document.
   */
  const stubAuthClientPage = () => {
    gapPage()
    vi.stubGlobal("document", {
      cookie: "",
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    const items = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    })
    vi.stubGlobal("addEventListener", () => {})
    vi.stubGlobal("removeEventListener", () => {})
    // An IndexedDB whose open never settles: the session restore the
    // constructor starts waits forever, and these tests never ask for it.
    class PendingRequest {
      addEventListener() {}
      removeEventListener() {}
    }
    vi.stubGlobal("IDBRequest", PendingRequest)
    vi.stubGlobal("indexedDB", { open: () => new PendingRequest() })
  }

  it("is given when the factory reads network.identityProvider as AuthClient's constructor does", () => {
    gapPage()

    const warnings = warningsOf(readsLikeAuthClient)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("sign-in cannot work on this network")
  })

  it("is given by a real AuthClient built with new AuthClient(network)", () => {
    stubAuthClientPage()

    const warnings = warningsOf((network) => new AuthClient(network))

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("sign-in cannot work on this network")
  })

  it("is given to a factory that destructures identityProvider", () => {
    gapPage()

    const warnings = warningsOf(({ agentOptions, identityProvider }) => {
      void agentOptions
      void identityProvider
      return createTestAuth()
    })

    expect(warnings).toHaveLength(1)
  })

  it("is not given to a factory that names its own provider by spreading network, which gets that provider", () => {
    gapPage()
    let provider: unknown

    const warnings = warningsOf((network) => {
      provider = providerOf({ ...network, identityProvider: OWN_PROVIDER })
      return createTestAuth()
    })

    expect(warnings).toEqual([])
    expect(provider).toEqual(OWN_PROVIDER)
  })

  it("is not given to a real AuthClient built from the override", () => {
    stubAuthClientPage()

    const warnings = warningsOf(
      (network) =>
        new AuthClient({
          ...network,
          identityProvider: OWN_PROVIDER,
        })
    )

    expect(warnings).toEqual([])
  })

  it("is not given to a factory that ignores network, for an auth that is not Internet Identity", () => {
    gapPage()

    expect(warningsOf(() => createTestAuth())).toEqual([])
    expect(warningsOf((_network) => createTestAuth())).toEqual([])
  })

  it("is not given to a spread that adds other options and names no provider, which must name one", () => {
    stubAuthClientPage()

    const warnings = warningsOf(
      (network) =>
        new AuthClient({
          ...network,
          disableBrowserActivity: true,
        })
    )

    expect(warnings).toEqual([])
  })

  it("leaves identityProvider out of Object.keys and JSON where none was named", () => {
    gapPage()
    const warn = muteWarnings()

    const network = handedTo("env")

    expect(Object.keys(network)).toEqual(["agentOptions"])
    expect(Object.keys(JSON.parse(JSON.stringify(network)))).toEqual([
      "agentOptions",
    ])
    expect(warn).not.toHaveBeenCalled()
  })
})

describe("the fetch an auth factory is handed", () => {
  it("is the client's fetch, called as a plain function, when one was given", async () => {
    stubPage("https://app.example.com")
    const receivers: unknown[] = []
    const response = new Response("ok")
    const userFetch = vi.fn(function (this: unknown) {
      receivers.push(this)
      return Promise.resolve(response)
    }) as unknown as typeof fetch
    let handed: AuthNetwork | undefined
    const client = createClient({
      network: "ic",
      fetch: userFetch,
      auth: (network) => {
        handed = network
        return createTestAuth()
      },
    })
    made.push(client)
    client.caller()

    const agentOptions = handed!.agentOptions
    expect(typeof agentOptions.fetch).toBe("function")
    expect(await agentOptions.fetch!("https://icp-api.io/api/v2/status")).toBe(
      response
    )
    expect(userFetch).toHaveBeenCalledWith(
      "https://icp-api.io/api/v2/status",
      undefined
    )
    expect(receivers).toEqual([undefined])
  })

  it("is the client's fetch where no identity provider could be named", async () => {
    // "env" on a local page with no cookie: the handed object is built apart.
    stubPage("http://localhost:5173", { cookie: "" })
    const response = new Response("ok")
    const userFetch = vi.fn(() => Promise.resolve(response))
    let handed: AuthNetwork | undefined
    const client = createClient({
      network: "env",
      fetch: userFetch as unknown as typeof fetch,
      auth: (network) => {
        handed = network
        return createTestAuth()
      },
    })
    made.push(client)
    client.caller()

    const agentOptions = handed!.agentOptions
    expect(typeof agentOptions.fetch).toBe("function")
    expect(
      await agentOptions.fetch!("http://localhost:5173/api/v2/status")
    ).toBe(response)
    expect(userFetch).toHaveBeenCalledWith(
      "http://localhost:5173/api/v2/status",
      undefined
    )
  })

  it("is absent when the client was given none", () => {
    stubPage("https://app.example.com")

    expect("fetch" in handedTo("ic").agentOptions).toBe(false)
    expect("fetch" in handedTo("local").agentOptions).toBe(false)
  })
})
