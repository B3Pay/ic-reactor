/**
 * Network resolution: which host a client connects to, and whose root key its
 * certificates are verified against.
 *
 * The rule under test: a given `rootKey` is used and never fetched; otherwise
 * the root key is fetched only from a local replica (`localhost`,
 * `*.localhost`, all of 127.0.0.0/8, `::1`) or when `fetchRootKey: true` is
 * written out. A replica behind a Codespaces, Gitpod or custom domain is not
 * local, so a key is never taken from it by default.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AnonymousIdentity,
  Cbor,
  HttpAgent,
  IC_ROOT_KEY,
} from "@icp-sdk/core/agent"
import {
  agentOptionsFor,
  resolveNetwork,
  type Network,
  type ResolvedNetwork,
} from "../src/network.js"
import {
  COOKIE_ROOT_KEY,
  GIVEN_ROOT_KEY,
  REPLICA_ROOT_KEY,
  hex,
  icEnvCookie,
  sameBytes,
  stubNoWindow,
  stubPage,
  stubProcessEnv,
} from "./network-helpers.js"

const LOCAL_REPLICA = "http://127.0.0.1:4943"
const CODESPACE = "https://fluffy-space-5173.app.github.dev"
const GITPOD = "https://5173-user-repo-abc123.ws-us118.gitpod.io"
const CUSTOM_DOMAIN = "https://testnet.example.com"
const MAINNET = "https://icp-api.io"
const CANISTER = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

beforeEach(() => {
  // A developer's shell must not change a result.
  stubProcessEnv()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("the network table", () => {
  it('"ic" is mainnet, with the root key the agent ships with and nothing fetched', () => {
    const net = resolveNetwork("ic")

    // No `rootKey` property at all: the agent holds mainnet's own.
    expect(net).toStrictEqual({
      keySegment: "ic",
      host: MAINNET,
      fetchRootKey: false,
      trustsEnv: false,
    })
    expect(agentOptionsFor(net)).toStrictEqual({
      host: MAINNET,
      shouldFetchRootKey: false,
    })
  })

  it('"local" is a replica on 127.0.0.1:4943, whose root key is fetched', () => {
    const net = resolveNetwork("local")

    expect(net).toStrictEqual({
      keySegment: "local",
      host: LOCAL_REPLICA,
      fetchRootKey: true,
      trustsEnv: false,
    })
    expect(agentOptionsFor(net)).toStrictEqual({
      host: LOCAL_REPLICA,
      shouldFetchRootKey: true,
    })
  })

  describe("a custom network with a root key", () => {
    it.each([
      ["a local host", LOCAL_REPLICA],
      ["a Codespaces host", CODESPACE],
      ["a custom domain", CUSTOM_DOMAIN],
      ["a mainnet host", MAINNET],
    ])("uses it as given and never fetches, on %s", (_, host) => {
      const net = resolveNetwork({ host, rootKey: GIVEN_ROOT_KEY })

      expect(net.rootKey).toBe(GIVEN_ROOT_KEY)
      expect(net.fetchRootKey).toBe(false)
      expect(agentOptionsFor(net)).toStrictEqual({
        host,
        rootKey: GIVEN_ROOT_KEY,
        shouldFetchRootKey: false,
      })
    })

    it("keeps the given key even where fetchRootKey: true is written out", () => {
      // The two say different things; the key the caller handed over is the one
      // to verify with, so nothing is fetched to replace it.
      for (const host of [LOCAL_REPLICA, CODESPACE]) {
        const net = resolveNetwork({
          host,
          rootKey: GIVEN_ROOT_KEY,
          fetchRootKey: true,
        })

        expect(net.rootKey).toBe(GIVEN_ROOT_KEY)
        expect(net.fetchRootKey).toBe(false)
        expect(agentOptionsFor(net).shouldFetchRootKey).toBe(false)
      }
    })
  })

  describe("a custom network without a root key, on a local host", () => {
    it.each([
      ["localhost", "http://localhost:4943"],
      ["127.0.0.1", "http://127.0.0.1:4943"],
      // All of 127.0.0.0/8 is loopback: a replica bound to .2 is as local as .1.
      ["127.0.0.2", "http://127.0.0.2:4943"],
      ["127.255.255.254", "http://127.255.255.254:4943"],
      ["[::1]", "http://[::1]:4943"],
      ["[::1] written out in full", "http://[0:0:0:0:0:0:0:1]:4943"],
      ["a *.localhost subdomain", "http://app.localhost:4943"],
      [
        "a locally deployed canister's domain",
        `http://${CANISTER}.localhost:4943`,
      ],
    ])("fetches the replica's root key from %s", (_, host) => {
      const net = resolveNetwork({ host })

      expect(net.rootKey).toBeUndefined()
      expect(net.fetchRootKey).toBe(true)
      expect(agentOptionsFor(net).shouldFetchRootKey).toBe(true)
    })
  })

  describe("a custom network without a root key, on a host that is not local", () => {
    it.each([
      ["a Codespaces host", "https://foo-4943.app.github.dev"],
      ["a Codespaces host on the older domain", "https://foo-4943.github.dev"],
      ["a Gitpod host", GITPOD],
      ["a custom domain", CUSTOM_DOMAIN],
      ["mainnet's API", MAINNET],
      ["mainnet's legacy domain", "https://ic0.app"],
      ["a mainnet canister's domain", `https://${CANISTER}.icp0.io`],
      // Only 127.0.0.0/8 is loopback, not every address that looks like it.
      ["128.0.0.1, just outside 127/8", "http://128.0.0.1:4943"],
      ["10.127.0.1", "http://10.127.0.1:4943"],
      ["a LAN address", "http://192.168.1.10:4943"],
      ["a name that merely ends in localhost", "http://notlocalhost:4943"],
      ["localhost as a prefix", "http://localhost.example.com:4943"],
      ["127.0.0.1 as a prefix", "http://127.0.0.1.example.com:4943"],
      ["localhost in the userinfo", "http://localhost@evil.example.com"],
      ["another IPv6 address", "http://[::2]:4943"],
    ])("does not fetch a root key from %s", (_, host) => {
      const net = resolveNetwork({ host })

      expect(net.rootKey).toBeUndefined()
      expect(net.fetchRootKey).toBe(false)
      expect(agentOptionsFor(net).shouldFetchRootKey).toBe(false)
    })

    it("fetches the key only when fetchRootKey: true is written out", () => {
      for (const host of [CODESPACE, GITPOD, CUSTOM_DOMAIN]) {
        const net = resolveNetwork({ host, fetchRootKey: true })

        expect(net.rootKey).toBeUndefined()
        expect(net.fetchRootKey).toBe(true)
        expect(agentOptionsFor(net).shouldFetchRootKey).toBe(true)
      }
    })
  })

  it("honours fetchRootKey: false on a local host", () => {
    // An explicit setting wins over the host's default.
    expect(
      resolveNetwork({ host: LOCAL_REPLICA, fetchRootKey: false }).fetchRootKey
    ).toBe(false)
  })

  describe("the key segment", () => {
    it("is the name when one is given, else the host exactly as written", () => {
      expect(resolveNetwork({ host: CUSTOM_DOMAIN }).keySegment).toBe(
        CUSTOM_DOMAIN
      )
      expect(
        resolveNetwork({ host: `${CUSTOM_DOMAIN}/`, name: "testnet" })
          .keySegment
      ).toBe("testnet")
      expect(
        resolveNetwork({ host: LOCAL_REPLICA, name: "staging" }).keySegment
      ).toBe("staging")
    })

    it("does not change the host", () => {
      expect(resolveNetwork({ host: CUSTOM_DOMAIN, name: "x" }).host).toBe(
        CUSTOM_DOMAIN
      )
    })
  })
})

describe("a host written without a scheme", () => {
  it("is read against the page's protocol, as the agent reads it", () => {
    stubPage("http://localhost:5173")

    expect(resolveNetwork({ host: "127.0.0.1:4943" }).fetchRootKey).toBe(true)
    expect(resolveNetwork({ host: "app.localhost:4943" }).fetchRootKey).toBe(
      true
    )
    expect(resolveNetwork({ host: "127.0.0.2:4943" }).fetchRootKey).toBe(true)
    expect(resolveNetwork({ host: "[::1]:4943" }).fetchRootKey).toBe(true)
  })

  it("is not local when it is a Codespaces, Gitpod or custom domain", () => {
    stubPage("http://localhost:5173")

    expect(
      resolveNetwork({ host: "foo-4943.app.github.dev" }).fetchRootKey
    ).toBe(false)
    expect(
      resolveNetwork({ host: "5173-x.ws-us118.gitpod.io" }).fetchRootKey
    ).toBe(false)
    expect(resolveNetwork({ host: "testnet.example.com" }).fetchRootKey).toBe(
      false
    )
  })

  it("is read against an https page's protocol too", () => {
    stubPage("https://app.example.com")

    expect(resolveNetwork({ host: "127.0.0.1:4943" }).fetchRootKey).toBe(true)
    expect(resolveNetwork({ host: "testnet.example.com" }).fetchRootKey).toBe(
      false
    )
  })

  it("has no hostname where the agent finds none: localhost:4943 reads as a scheme", () => {
    // The agent's scheme test is copied as is, so `localhost:` is a scheme and
    // the host has no hostname. Not being read as local is the safe side.
    stubPage("http://localhost:5173")
    expect(resolveNetwork({ host: "localhost:4943" }).fetchRootKey).toBe(false)

    vi.unstubAllGlobals()
    expect(resolveNetwork({ host: "localhost:4943" }).fetchRootKey).toBe(false)
  })

  it("is not local where there is no page to read it against", () => {
    // The agent cannot read a scheme-less host without a page either.
    expect(resolveNetwork({ host: "127.0.0.1:4943" }).fetchRootKey).toBe(false)
  })

  it("reads a page whose window has no location, as in React Native, as having none", () => {
    vi.stubGlobal("window", {})

    expect(resolveNetwork({ host: "127.0.0.1:4943" }).fetchRootKey).toBe(false)
    expect(resolveNetwork({ host: LOCAL_REPLICA }).fetchRootKey).toBe(true)
  })
})

describe("an unusable network", () => {
  it.each([
    ["an unknown name", "mainnet"],
    ["an object with no host", {}],
    ["a host that is not a string", { host: 4943 }],
    ["null", null],
    ["undefined", undefined],
  ])("is refused with a TypeError that names it: %s", (_, network) => {
    expect(() => resolveNetwork(network as unknown as Network)).toThrow(
      TypeError
    )
    expect(() => resolveNetwork(network as unknown as Network)).toThrow(
      /unknown network/
    )
  })

  it("quotes the name it was given", () => {
    expect(() => resolveNetwork("mainnet" as never)).toThrow(
      /unknown network "mainnet"/
    )
  })
})

describe('"env" in a browser', () => {
  describe("on a local page", () => {
    it.each([
      ["a dev server", "http://localhost:5173"],
      ["a loopback replica", "http://127.0.0.1:4943"],
      ["another loopback address", "http://127.0.0.2:4943"],
      ["an IPv6 loopback replica", "http://[::1]:5173"],
      ["a *.localhost page", "http://app.localhost:4943"],
      [
        "a locally deployed asset canister",
        `http://${CANISTER}.localhost:4943`,
      ],
    ])(
      "routes through the page's origin and trusts the cookie, on %s",
      (_, origin) => {
        stubPage(origin)

        const net = resolveNetwork("env")

        expect(net.host).toBe(origin)
        expect(net.keySegment).toBe(origin)
        expect(net.trustsEnv).toBe(true)
        // The cookie's key is the replica's, so it is used and nothing is fetched.
        expect(sameBytes(net.rootKey, COOKIE_ROOT_KEY)).toBe(true)
        expect(net.fetchRootKey).toBe(false)
      }
    )

    it("fetches the replica's root key when the cookie carries none", () => {
      stubPage("http://localhost:5173", { cookie: "" })

      const net = resolveNetwork("env")

      expect(net.trustsEnv).toBe(true)
      expect(net.rootKey).toBeUndefined()
      expect(net.fetchRootKey).toBe(true)
    })

    it("fetches it when the cookie has no root key, which the cookie reader refuses", () => {
      stubPage("http://localhost:5173", {
        cookie: icEnvCookie({ "PUBLIC_CANISTER_ID:backend": CANISTER }, null),
      })

      const net = resolveNetwork("env")

      expect(net.rootKey).toBeUndefined()
      expect(net.fetchRootKey).toBe(true)
    })

    it("does not take a cookie root key of the wrong length", () => {
      stubPage("http://localhost:5173", {
        cookie: icEnvCookie({}, new Uint8Array(32).fill(7)),
      })

      const net = resolveNetwork("env")

      expect(net.rootKey).toBeUndefined()
      expect(net.fetchRootKey).toBe(true)
    })

    it("does not read the cookie when the caller opts out", () => {
      const page = stubPage("http://localhost:5173")

      const net = resolveNetwork("env", { allowEnvConfig: false })

      expect(net.trustsEnv).toBe(false)
      expect(net.rootKey).toBeUndefined()
      expect(net.fetchRootKey).toBe(true)
      expect(page.cookieReads()).toBe(0)
    })
  })

  describe("on a mainnet boundary page", () => {
    it.each([
      ["a canister's icp0.io domain", `https://${CANISTER}.icp0.io`],
      ["a canister's ic0.app domain", `https://${CANISTER}.ic0.app`],
      ["icp0.io itself", "https://icp0.io"],
      ["the API domain", MAINNET],
    ])(
      "routes through its origin, with no cookie read and no fetch, on %s",
      (_, origin) => {
        const page = stubPage(origin)

        const net = resolveNetwork("env")

        expect(net.host).toBe(origin)
        expect(net.keySegment).toBe(origin)
        expect(net.trustsEnv).toBe(false)
        expect(net.rootKey).toBeUndefined()
        expect(net.fetchRootKey).toBe(false)
        // Not read at all, rather than read and ignored.
        expect(page.cookieReads()).toBe(0)
      }
    )

    it("does not take the cookie's key even when the cookie is well formed", () => {
      // The same cookie a dev server would set: on a real domain it proves
      // nothing, because any sibling subdomain can write it.
      stubPage(`https://${CANISTER}.icp0.io`)

      expect(resolveNetwork("env").rootKey).toBeUndefined()
    })
  })

  describe("on a Codespaces or Gitpod page", () => {
    it.each([
      ["Codespaces", CODESPACE],
      ["Gitpod", GITPOD],
    ])(
      "routes through its own origin on %s, as it routes a local page",
      (_, origin) => {
        stubPage(origin)

        const net = resolveNetwork("env")

        // A page that forwards a local dev server used to fall back to mainnet,
        // so a dev app in a codespace sent its local canister ids there.
        expect(net.host).toBe(origin)
        expect(net.keySegment).toBe(origin)
      }
    )

    it.each([
      ["Codespaces", CODESPACE],
      ["Gitpod", GITPOD],
    ])("does not trust the cookie or fetch a root key on %s", (_, origin) => {
      // Every workspace is a subdomain of the same parent, which is not a
      // public suffix, so a page in a stranger's workspace can set `ic_env` for
      // yours. v3 fetched the key from these hosts; v4 does not, and the app
      // passes `rootKey` or writes `fetchRootKey: true` in a custom network.
      const page = stubPage(origin)

      const net = resolveNetwork("env")

      expect(net.trustsEnv).toBe(false)
      expect(net.rootKey).toBeUndefined()
      expect(net.fetchRootKey).toBe(false)
      expect(page.cookieReads()).toBe(0)
    })

    it("trusts the cookie, and takes its key, with allowEnvConfig: true", () => {
      stubPage(CODESPACE)

      const net = resolveNetwork("env", { allowEnvConfig: true })

      expect(net.host).toBe(CODESPACE)
      expect(net.trustsEnv).toBe(true)
      expect(sameBytes(net.rootKey, COOKIE_ROOT_KEY)).toBe(true)
      expect(net.fetchRootKey).toBe(false)
    })
  })

  describe("on an ordinary web host", () => {
    it.each([
      ["a custom domain", "https://app.example.com"],
      ["a hosting platform", "https://my-dapp.vercel.app"],
    ])(
      "does not route through the page, which cannot proxy /api: %s",
      (_, origin) => {
        const page = stubPage(origin)

        const net = resolveNetwork("env")

        expect(net.host).toBe(MAINNET)
        expect(net.keySegment).toBe(MAINNET)
        expect(net.trustsEnv).toBe(false)
        expect(net.rootKey).toBeUndefined()
        expect(net.fetchRootKey).toBe(false)
        expect(page.cookieReads()).toBe(0)
      }
    )

    it("falls back as a server does, to the local replica when the process says local", () => {
      stubPage("https://app.example.com")
      stubProcessEnv({ ICP_NETWORK: "local" })

      const net = resolveNetwork("env")

      expect(net.host).toBe(LOCAL_REPLICA)
      // The page decides who can write the cookie, and this page is not local.
      expect(net.trustsEnv).toBe(false)
      expect(net.rootKey).toBeUndefined()
      expect(net.fetchRootKey).toBe(true)
    })

    it("takes the cookie only on the caller's say-so, and then its key too", () => {
      // What the opt-in means: the whole cookie, root key included, is trusted.
      // The page is not routed through, so the host is the fallback.
      stubPage("https://app.example.com")

      const net = resolveNetwork("env", { allowEnvConfig: true })

      expect(net.host).toBe(MAINNET)
      expect(net.trustsEnv).toBe(true)
      expect(sameBytes(net.rootKey, COOKIE_ROOT_KEY)).toBe(true)
    })
  })

  describe("on a page with no usable origin", () => {
    it.each([
      [
        "an opaque origin, as on a file:// page",
        { origin: "null", protocol: "file:" },
      ],
      ["no location at all, as in React Native", undefined],
    ])("falls back rather than throws, on %s", (_, location) => {
      vi.stubGlobal("window", location ? { location } : {})

      const net = resolveNetwork("env")

      expect(net.host).toBe(MAINNET)
      expect(net.trustsEnv).toBe(false)
    })
  })

  it("trusts the cookie's pair of sides, not either alone", () => {
    // A local page pointed at a custom replica, and a custom page pointed at a
    // loopback replica, are each refused: the page decides who can write the
    // cookie, and the agent host decides whom the key is believed for.
    stubPage("http://localhost:5173")
    expect(resolveNetwork({ host: CUSTOM_DOMAIN }).trustsEnv).toBe(false)
    expect(resolveNetwork({ host: LOCAL_REPLICA }).trustsEnv).toBe(true)

    stubPage("https://app.example.com")
    expect(resolveNetwork({ host: LOCAL_REPLICA }).trustsEnv).toBe(false)
  })
})

describe('"env" in a web worker', () => {
  it("routes like its page but has no cookie to read", () => {
    const worker = stubNoWindow({ workerOrigin: "http://localhost:5173" })

    const net = resolveNetwork("env", { allowEnvConfig: true })

    expect(net.host).toBe("http://localhost:5173")
    expect(net.trustsEnv).toBe(false)
    expect(net.rootKey).toBeUndefined()
    // A local replica with no key to hand: asked for it.
    expect(net.fetchRootKey).toBe(true)
    expect(worker.cookieReads()).toBe(0)
  })
})

describe('"env" on a server', () => {
  it("is mainnet when nothing says otherwise", () => {
    const net = resolveNetwork("env")

    expect(net).toStrictEqual({
      keySegment: MAINNET,
      host: MAINNET,
      fetchRootKey: false,
      trustsEnv: false,
    })
  })

  it.each([
    ["ICP_NETWORK", { ICP_NETWORK: "local" }],
    ["DFX_NETWORK", { DFX_NETWORK: "local" }],
  ] as const)("is the local replica when %s is local", (_, env) => {
    stubProcessEnv(env)

    const net = resolveNetwork("env")

    expect(net.host).toBe(LOCAL_REPLICA)
    expect(net.keySegment).toBe(LOCAL_REPLICA)
    expect(net.fetchRootKey).toBe(true)
  })

  it("lets ICP_NETWORK override DFX_NETWORK", () => {
    stubProcessEnv({ ICP_NETWORK: "ic", DFX_NETWORK: "local" })
    expect(resolveNetwork("env").host).toBe(MAINNET)

    stubProcessEnv({ ICP_NETWORK: "local", DFX_NETWORK: "ic" })
    expect(resolveNetwork("env").host).toBe(LOCAL_REPLICA)
  })

  it("takes ICP_HOST, then IC_HOST, for a local network", () => {
    stubProcessEnv({
      ICP_NETWORK: "local",
      ICP_HOST: "http://127.0.0.1:8000",
      IC_HOST: "http://127.0.0.1:9000",
    })
    expect(resolveNetwork("env").host).toBe("http://127.0.0.1:8000")

    stubProcessEnv({ ICP_NETWORK: "local", IC_HOST: "http://127.0.0.1:9000" })
    expect(resolveNetwork("env").host).toBe("http://127.0.0.1:9000")

    // An empty variable is unset.
    stubProcessEnv({ ICP_NETWORK: "local", ICP_HOST: "", IC_HOST: "" })
    expect(resolveNetwork("env").host).toBe(LOCAL_REPLICA)
  })

  it("ignores ICP_HOST and IC_HOST when the network is not local", () => {
    stubProcessEnv({ ICP_HOST: "http://127.0.0.1:8000" })
    expect(resolveNetwork("env").host).toBe(MAINNET)

    stubProcessEnv({ ICP_NETWORK: "ic", IC_HOST: "http://127.0.0.1:9000" })
    expect(resolveNetwork("env").host).toBe(MAINNET)
  })

  it("does not fetch a root key from a host from the environment that is not local", () => {
    // A replica in another container is not local: the caller writes a custom
    // network with its key, or with `fetchRootKey: true`.
    stubProcessEnv({ ICP_NETWORK: "local", ICP_HOST: "http://replica:4943" })

    const net = resolveNetwork("env")

    expect(net.host).toBe("http://replica:4943")
    expect(net.fetchRootKey).toBe(false)
  })

  it("never trusts the cookie, whatever the caller says, and never reads one", () => {
    // There is no page, so there is no cookie to believe; a `document` that
    // happens to exist is not one.
    const server = stubNoWindow()
    stubProcessEnv({ ICP_NETWORK: "local" })

    for (const network of [
      "env",
      "ic",
      "local",
      { host: LOCAL_REPLICA },
    ] as const) {
      const net = resolveNetwork(network, { allowEnvConfig: true })

      expect(net.trustsEnv).toBe(false)
      expect(net.rootKey).toBeUndefined()
    }
    expect(server.cookieReads()).toBe(0)
  })
})

describe("the cookie's key reaches only the network that asked for it", () => {
  it.each([
    ["ic", "ic" as Network],
    ["local", "local" as Network],
    ["a custom local host", { host: LOCAL_REPLICA } as Network],
  ])("is not taken by %s, even on a trusted page", (_, network) => {
    // The cookie is trusted here: only "env" is the network the page describes.
    stubPage("http://localhost:5173")

    const net = resolveNetwork(network, { allowEnvConfig: true })

    expect(net.rootKey).toBeUndefined()
  })
})

describe("the root key an agent really uses", () => {
  const QUERY_PATH = /\/query$/

  /**
   * A fake replica that only reports its root key: every other request is
   * answered with an error, which is all it takes to prove the agent got past
   * its root-key step and sent the call.
   */
  const fakeReplica = () => {
    const paths: string[] = []
    const fetch = (input: Parameters<typeof globalThis.fetch>[0]) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      paths.push(url.pathname)
      return Promise.resolve(
        url.pathname === "/api/v2/status"
          ? new Response(Cbor.encode({ root_key: REPLICA_ROOT_KEY }), {
              status: 200,
              headers: { "content-type": "application/cbor" },
            })
          : new Response("not a replica", { status: 400 })
      )
    }
    return { paths, fetch }
  }

  /** Builds the agent from the resolved network and makes it send a query. */
  const drive = async (net: ResolvedNetwork) => {
    // Resolving may have needed a fake page; the agent runs without one.
    vi.unstubAllGlobals()
    const replica = fakeReplica()
    const agent = HttpAgent.createSync({
      ...agentOptionsFor(net),
      fetch: replica.fetch,
      identity: new AnonymousIdentity(),
      retryTimes: 0,
      verifyQuerySignatures: false,
    })
    await agent
      .query(CANISTER, { methodName: "ping", arg: new Uint8Array() })
      .catch(() => undefined)
    return {
      agentKey: agent.rootKey,
      statusRequests: replica.paths.filter((p) => p === "/api/v2/status")
        .length,
      sentTheCall: replica.paths.some((p) => QUERY_PATH.test(p)),
      optionsFetch: agentOptionsFor(net).shouldFetchRootKey,
    }
  }

  const mainnetKey = (key: Uint8Array | null) =>
    key !== null && hex(key) === IC_ROOT_KEY

  describe("never requests the root key when one is given", () => {
    it.each([
      ["a local host", { host: LOCAL_REPLICA, rootKey: GIVEN_ROOT_KEY }],
      [
        "a local host, with fetchRootKey: true written out",
        { host: LOCAL_REPLICA, rootKey: GIVEN_ROOT_KEY, fetchRootKey: true },
      ],
      [
        "a Codespaces host, with fetchRootKey: true written out",
        { host: CODESPACE, rootKey: GIVEN_ROOT_KEY, fetchRootKey: true },
      ],
      ["a custom domain", { host: CUSTOM_DOMAIN, rootKey: GIVEN_ROOT_KEY }],
    ] as const)("%s", async (_, network) => {
      const used = await drive(resolveNetwork(network))

      expect(used.sentTheCall).toBe(true)
      expect(used.statusRequests).toBe(0)
      expect(used.optionsFetch).toBe(false)
      expect(sameBytes(used.agentKey, GIVEN_ROOT_KEY)).toBe(true)
    })
  })

  describe("never requests the root key from a host that is not local, and keeps mainnet's", () => {
    it.each([
      ["mainnet", "ic" as Network],
      ["a Codespaces host", { host: CODESPACE } as Network],
      ["a Gitpod host", { host: GITPOD } as Network],
      ["a custom domain", { host: CUSTOM_DOMAIN } as Network],
      [
        "a local host, with fetchRootKey: false written out",
        { host: LOCAL_REPLICA, fetchRootKey: false } as Network,
      ],
    ])("%s", async (_, network) => {
      const used = await drive(resolveNetwork(network))

      expect(used.sentTheCall).toBe(true)
      expect(used.statusRequests).toBe(0)
      expect(used.optionsFetch).toBe(false)
      // Not a replica's key: replies from it will not verify, which fails closed.
      expect(mainnetKey(used.agentKey)).toBe(true)
    })
  })

  describe("requests the root key once, and uses it, from a local replica", () => {
    it.each([
      ["local", "local" as Network],
      ["localhost", { host: "http://localhost:4943" } as Network],
      ["127.0.0.1", { host: "http://127.0.0.1:4943" } as Network],
      ["127.0.0.2", { host: "http://127.0.0.2:4943" } as Network],
      ["[::1]", { host: "http://[::1]:4943" } as Network],
      ["app.localhost", { host: "http://app.localhost:4943" } as Network],
    ])("%s", async (_, network) => {
      const used = await drive(resolveNetwork(network))

      expect(used.sentTheCall).toBe(true)
      expect(used.statusRequests).toBe(1)
      expect(sameBytes(used.agentKey, REPLICA_ROOT_KEY)).toBe(true)
    })
  })

  describe("requests it from a host that is not local only when written out", () => {
    it.each([
      ["a Codespaces host", CODESPACE],
      ["a Gitpod host", GITPOD],
      ["a custom domain", CUSTOM_DOMAIN],
    ])("%s", async (_, host) => {
      const used = await drive(resolveNetwork({ host, fetchRootKey: true }))

      expect(used.sentTheCall).toBe(true)
      expect(used.statusRequests).toBe(1)
      expect(sameBytes(used.agentKey, REPLICA_ROOT_KEY)).toBe(true)
    })
  })

  describe('"env"', () => {
    it("uses the cookie's key on a local page, and requests nothing", async () => {
      stubPage("http://localhost:5173")

      const used = await drive(resolveNetwork("env"))

      expect(used.statusRequests).toBe(0)
      expect(sameBytes(used.agentKey, COOKIE_ROOT_KEY)).toBe(true)
    })

    it("asks a local replica for its key when the page has no cookie", async () => {
      stubPage("http://localhost:5173", { cookie: "" })

      const used = await drive(resolveNetwork("env"))

      expect(used.statusRequests).toBe(1)
      expect(sameBytes(used.agentKey, REPLICA_ROOT_KEY)).toBe(true)
    })

    it("requests nothing on a Codespaces page, which v3 asked for a key", async () => {
      stubPage(CODESPACE)

      const used = await drive(resolveNetwork("env"))

      expect(used.statusRequests).toBe(0)
      expect(mainnetKey(used.agentKey)).toBe(true)
    })

    it("requests nothing on a mainnet page, and ignores the cookie there", async () => {
      stubPage(`https://${CANISTER}.icp0.io`)

      const used = await drive(resolveNetwork("env"))

      expect(used.statusRequests).toBe(0)
      expect(mainnetKey(used.agentKey)).toBe(true)
    })

    it("asks the local replica a server's environment names", async () => {
      stubProcessEnv({ ICP_NETWORK: "local" })

      const used = await drive(resolveNetwork("env"))

      expect(used.statusRequests).toBe(1)
      expect(sameBytes(used.agentKey, REPLICA_ROOT_KEY)).toBe(true)
    })
  })
})
