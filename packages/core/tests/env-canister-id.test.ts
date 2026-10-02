/**
 * Which pages may take a canister id (and a root key) from the `ic_env` cookie.
 *
 * The cookie carries the root key, and the `PUBLIC_CANISTER_ID:<name>` entries
 * a `{ name }` target resolves through, and it is not origin-isolated: any
 * sibling subdomain of the registrable domain can write it. A substituted
 * canister id is something certificate verification cannot catch, because the
 * attacker names a real canister whose responses verify against the real root
 * key. So the cookie is read only in a browser, and only where it is as
 * trustworthy as the replica: both the agent host and the page are local, or
 * the caller wrote `allowEnvConfig: true`.
 *
 * `resolveCanisterId` never throws for a `{ name }` target and never sends
 * anything; a failure says which of three problems it was, because they have
 * three different fixes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  resolveCanisterId,
  resolveNetwork,
  type Network,
  type NetworkOptions,
  type ResolvedNetwork,
} from "../src/network.js"
import {
  COOKIE_CANISTER_ID,
  COOKIE_ROOT_KEY,
  icEnvCookie,
  sameBytes,
  stubNoWindow,
  stubPage,
  stubProcessEnv,
} from "./network-helpers.js"

/** An id passed in configuration, which the cookie must never override. */
const EXPLICIT_CANISTER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai"
const LOCAL_REPLICA = "http://127.0.0.1:4943"
const LOCAL_PAGE = "http://localhost:5173"
const CUSTOM_PAGE = "https://app.example.com"
const CODESPACE = "https://fluffy-space-5173.app.github.dev"
const GITPOD = "https://5173-user-repo-abc123.ws-us118.gitpod.io"

beforeEach(() => {
  stubProcessEnv()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** Resolves `{ name: "backend" }` on `network`, from a page at `page`. */
const resolveBackend = (
  network: Network,
  page: string,
  options?: NetworkOptions & { cookie?: string }
) => {
  const fake = stubPage(page, options?.cookie ? { cookie: options.cookie } : {})
  const net = resolveNetwork(network, options)
  return { result: resolveCanisterId({ name: "backend" }, net), net, fake }
}

const refusal = (result: ReturnType<typeof resolveCanisterId>) => {
  if (result.ok) throw new Error(`resolved ${result.id}, expected a refusal`)
  return result
}

describe("an { id } target", () => {
  const net = (): ResolvedNetwork => resolveNetwork("ic")

  it.each([
    ["a canister id", EXPLICIT_CANISTER_ID],
    ["the management canister", "aaaaa-aa"],
    ["a principal that is not a canister", "2vxsx-fae"],
  ])("is accepted as given: %s", (_, id) => {
    expect(resolveCanisterId({ id }, net())).toStrictEqual({ ok: true, id })
  })

  it.each([
    ["the empty string", ""],
    ["text that is not a principal", "not-a-principal"],
    ["a principal with its checksum broken", "ryjl3-tyaaa-aaaaa-aaaba-caj"],
    ["a principal in upper case", EXPLICIT_CANISTER_ID.toUpperCase()],
    ["a principal with a space around it", ` ${EXPLICIT_CANISTER_ID} `],
    ["a principal without its dashes", EXPLICIT_CANISTER_ID.replace(/-/g, "")],
    [
      "the JSON form of a principal, which is not its text",
      `{"__principal__":"${EXPLICIT_CANISTER_ID}"}`,
    ],
  ])("is refused at build time with a TypeError that names it: %s", (_, id) => {
    expect(() => resolveCanisterId({ id }, net())).toThrow(TypeError)
    expect(() => resolveCanisterId({ id }, net())).toThrow(
      `${JSON.stringify(id)} is not a valid canister id`
    )
  })

  it("is taken on every host, and never overridden by the cookie", () => {
    // The cookie holds a different id under the name the id could be mistaken
    // for; an explicit id is configuration, and configuration wins.
    for (const [network, page] of [
      ["local", LOCAL_PAGE],
      [{ host: LOCAL_REPLICA }, CUSTOM_PAGE],
      [{ host: CUSTOM_PAGE }, CUSTOM_PAGE],
      ["ic", CUSTOM_PAGE],
      ["env", LOCAL_PAGE],
    ] as const) {
      stubPage(page)
      expect(
        resolveCanisterId({ id: EXPLICIT_CANISTER_ID }, resolveNetwork(network))
      ).toStrictEqual({ ok: true, id: EXPLICIT_CANISTER_ID })
    }
  })

  it("is validated without reading the cookie", () => {
    const page = stubPage(LOCAL_PAGE)

    resolveCanisterId({ id: EXPLICIT_CANISTER_ID }, resolveNetwork("local"))

    expect(page.cookieReads()).toBe(0)
  })
})

describe("a target that is neither { id } nor { name }", () => {
  it.each([
    ["an empty object", {}],
    ["a name that is not a string", { name: 3 }],
    ["null", null],
    ["a string", EXPLICIT_CANISTER_ID],
  ])("is a TypeError at build time: %s", (_, target) => {
    expect(() =>
      resolveCanisterId(target as never, resolveNetwork("ic"))
    ).toThrow(TypeError)
  })
})

describe("a { name } target on a page that is trusted", () => {
  it.each([
    ["a dev server on a local replica", "local" as Network, LOCAL_PAGE],
    [
      "a local replica's own page",
      { host: LOCAL_REPLICA } as Network,
      LOCAL_REPLICA,
    ],
    ['"env" on a dev server', "env" as Network, LOCAL_PAGE],
    ['"env" on a loopback replica', "env" as Network, LOCAL_REPLICA],
    ['"env" on an IPv6 loopback page', "env" as Network, "http://[::1]:5173"],
    [
      '"env" on a *.localhost page',
      "env" as Network,
      "http://app.localhost:4943",
    ],
  ])("resolves from the cookie: %s", (_, network, page) => {
    // The Vite plugin injects this cookie on the dev server, and generated code
    // names its canisters. That flow has to keep working on a local replica.
    const { result, net } = resolveBackend(network, page)

    expect(net.trustsEnv).toBe(true)
    expect(result).toStrictEqual({ ok: true, id: COOKIE_CANISTER_ID })
  })

  it("resolves each name from its own entry", () => {
    stubPage(LOCAL_PAGE, {
      cookie: icEnvCookie({
        "PUBLIC_CANISTER_ID:backend": COOKIE_CANISTER_ID,
        "PUBLIC_CANISTER_ID:ledger": EXPLICIT_CANISTER_ID,
      }),
    })
    const net = resolveNetwork("local")

    expect(resolveCanisterId({ name: "backend" }, net)).toStrictEqual({
      ok: true,
      id: COOKIE_CANISTER_ID,
    })
    expect(resolveCanisterId({ name: "ledger" }, net)).toStrictEqual({
      ok: true,
      id: EXPLICIT_CANISTER_ID,
    })
  })

  it("takes a custom domain's cookie when the caller opts in", () => {
    const { result, net } = resolveBackend({ host: CUSTOM_PAGE }, CUSTOM_PAGE, {
      allowEnvConfig: true,
    })

    expect(net.trustsEnv).toBe(true)
    expect(result).toStrictEqual({ ok: true, id: COOKIE_CANISTER_ID })
  })

  it("takes a Codespaces or Gitpod cookie when the caller opts in", () => {
    for (const page of [CODESPACE, GITPOD]) {
      const { result } = resolveBackend("env", page, { allowEnvConfig: true })

      expect(result).toStrictEqual({ ok: true, id: COOKIE_CANISTER_ID })
    }
  })
})

describe("a { name } target on a page that is not trusted", () => {
  it("is refused on a custom domain, which is the attack the guard exists for", () => {
    // app.example.com and evil.example.com share a registrable domain, so the
    // cookie is attacker-writable here. Failing closed is the whole point: the
    // alternative is silently calling someone else's canister.
    const { result, fake } = resolveBackend({ host: CUSTOM_PAGE }, CUSTOM_PAGE)
    const failure = refusal(result)

    expect(failure.reason).toBe("untrusted_host")
    expect(failure.message).toMatch(/not trusted for this network/)
    // Refused, so not read: not even to look at what it says.
    expect(fake.cookieReads()).toBe(0)
  })

  it('is refused for "env" on a dapp that configures no host, on a custom domain', () => {
    // Nothing in the generated setup names a host, so it comes from the page. A
    // custom domain is not a page the agent routes through, so the fallback
    // host is not local either way.
    const { result, fake } = resolveBackend("env", CUSTOM_PAGE)

    expect(refusal(result).reason).toBe("untrusted_host")
    expect(fake.cookieReads()).toBe(0)
  })

  it('is refused for "env" on a dapp served from its own mainnet asset canister', () => {
    // Here the page origin IS adopted as the host, so this is the other branch
    // of the host choice and it still has to fail closed.
    const { result } = resolveBackend(
      "env",
      "https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io"
    )

    expect(refusal(result).reason).toBe("untrusted_host")
  })

  it('is refused on mainnet, with the page named, as "ic"', () => {
    const { result } = resolveBackend("ic", CUSTOM_PAGE)
    const failure = refusal(result)

    expect(failure.reason).toBe("untrusted_host")
    // The agent host is often not anywhere the reader recognises, so the page
    // is named too: their address bar says something else.
    expect(failure.message).toContain("agent host https://icp-api.io")
    expect(failure.message).toContain(`page ${CUSTOM_PAGE}`)
  })

  it("is refused when the page is on a real domain, whatever the agent host", () => {
    // Keying only on the agent host would let a document on app.example.com,
    // pointed at a loopback replica, keep trusting a cookie that every sibling
    // of example.com can write. The agent host says nothing about who owns the
    // cookie jar.
    for (const network of [
      "local",
      { host: LOCAL_REPLICA },
      { host: "https://foo-4943.app.github.dev" },
    ] as const) {
      const { result, net } = resolveBackend(network, CUSTOM_PAGE)

      expect(net.trustsEnv).toBe(false)
      expect(refusal(result).reason).toBe("untrusted_host")
    }
  })

  it("is refused when the agent host is not local, whatever the page", () => {
    // Either side failing is enough to refuse.
    for (const host of [
      "https://icp-api.io",
      "https://testnet.example.com",
      "http://128.0.0.1:4943",
    ]) {
      const { result, net } = resolveBackend({ host }, LOCAL_PAGE)

      expect(net.trustsEnv).toBe(false)
      expect(refusal(result).reason).toBe("untrusted_host")
    }
  })

  it("is refused on Codespaces and Gitpod, which strangers' workspaces share", () => {
    // Every workspace is a subdomain of the same parent, which is not a public
    // suffix, so a page in someone else's workspace can set `ic_env` for yours.
    for (const page of [CODESPACE, GITPOD]) {
      const { result, fake } = resolveBackend({ host: page }, page)

      expect(refusal(result).reason).toBe("untrusted_host")
      expect(fake.cookieReads()).toBe(0)
    }
    expect(refusal(resolveBackend("env", CODESPACE).result).reason).toBe(
      "untrusted_host"
    )
  })

  it("is refused on a local replica when the caller opts out", () => {
    const { result, fake } = resolveBackend("local", LOCAL_PAGE, {
      allowEnvConfig: false,
    })

    expect(refusal(result).reason).toBe("untrusted_host")
    expect(fake.cookieReads()).toBe(0)
  })

  it("is not widened by the deprecated spelling", () => {
    // `allowEnvRootKey` granted the root key and nothing else, and v4 does not
    // carry it: someone who set it for a custom testnet did not thereby agree
    // to take their canister ids from the same cookie. A rename must not widen
    // a grant already in the wild, so `allowEnvConfig` is the only opt-in.
    const legacy = { allowEnvRootKey: true } as NetworkOptions
    const { result, net } = resolveBackend(
      { host: "https://testnet.example.com" },
      "https://testnet.example.com",
      legacy
    )

    expect(net.trustsEnv).toBe(false)
    expect(refusal(result).reason).toBe("untrusted_host")
    expect(resolveBackend("env", CUSTOM_PAGE, legacy).net.rootKey).toBe(
      undefined
    )
  })

  it("lets allowEnvConfig: false win over the deprecated spelling", () => {
    const legacy = { allowEnvConfig: false, allowEnvRootKey: true } as never
    const { result } = resolveBackend("local", LOCAL_PAGE, legacy)

    expect(refusal(result).reason).toBe("untrusted_host")
  })
})

describe("a { name } target the cookie does not answer", () => {
  it("is absent when the cookie has no entry under the name", () => {
    stubPage(LOCAL_PAGE)
    const failure = refusal(
      resolveCanisterId({ name: "not_in_the_cookie" }, resolveNetwork("local"))
    )

    expect(failure.reason).toBe("absent")
    expect(failure.message).toContain('"PUBLIC_CANISTER_ID:not_in_the_cookie"')
  })

  it("matches the name exactly", () => {
    stubPage(LOCAL_PAGE)
    const net = resolveNetwork("local")

    expect(refusal(resolveCanisterId({ name: "Backend" }, net)).reason).toBe(
      "absent"
    )
    expect(refusal(resolveCanisterId({ name: "back" }, net)).reason).toBe(
      "absent"
    )
    expect(refusal(resolveCanisterId({ name: "" }, net)).reason).toBe("absent")
  })

  it("is absent when the page has no cookie at all", () => {
    stubPage(LOCAL_PAGE, { cookie: "" })

    expect(
      refusal(resolveCanisterId({ name: "backend" }, resolveNetwork("local")))
        .reason
    ).toBe("absent")
  })

  it("is absent when the cookie is malformed, which the reader refuses", () => {
    // `safeGetCanisterEnv` returns nothing for a cookie with no root key, or one
    // of the wrong length, so its entries are never offered.
    for (const cookie of [
      icEnvCookie({ "PUBLIC_CANISTER_ID:backend": COOKIE_CANISTER_ID }, null),
      icEnvCookie(
        { "PUBLIC_CANISTER_ID:backend": COOKIE_CANISTER_ID },
        new Uint8Array(32)
      ),
      "ic_env=%E0%A4%A",
    ]) {
      stubPage(LOCAL_PAGE, { cookie })

      expect(
        refusal(resolveCanisterId({ name: "backend" }, resolveNetwork("local")))
          .reason
      ).toBe("absent")
    }
  })

  it.each([
    ["not principal text", "not-a-principal"],
    ["principal text with its checksum broken", "ryjl3-tyaaa-aaaaa-aaaba-caj"],
    ["a principal in upper case", COOKIE_CANISTER_ID.toUpperCase()],
    [
      "the JSON form of a principal",
      `{"__principal__":"${COOKIE_CANISTER_ID}"}`,
    ],
  ])("does not turn a value that is %s into a canister id", (_, value) => {
    // The cookie is trusted here, not validated: a trusted page can still carry
    // a value that is not a principal, and it must not become one.
    stubPage(LOCAL_PAGE, {
      cookie: icEnvCookie({ "PUBLIC_CANISTER_ID:backend": value }),
    })

    const failure = refusal(
      resolveCanisterId({ name: "backend" }, resolveNetwork("local"))
    )

    expect(failure.reason).toBe("absent")
    expect(failure.message).toMatch(/not principal text/)
  })

  it("is not fooled by a name that is a property of every object", () => {
    stubPage(LOCAL_PAGE)
    const net = resolveNetwork("local")

    for (const name of ["__proto__", "constructor", "toString"]) {
      expect(refusal(resolveCanisterId({ name }, net)).reason).toBe("absent")
    }
  })
})

describe("a { name } target outside a browser page", () => {
  it("is refused as no_browser, and reads no cookie", () => {
    // A server that happens to have a `document`, with a cookie that looks
    // exactly like a trusted one: the trust rule is about where the code runs,
    // not about what it can find.
    const server = stubNoWindow()
    stubProcessEnv({ ICP_NETWORK: "local" })

    const net = resolveNetwork("env", { allowEnvConfig: true })
    const failure = refusal(resolveCanisterId({ name: "backend" }, net))

    expect(failure.reason).toBe("no_browser")
    expect(server.cookieReads()).toBe(0)
  })

  it("is refused as no_browser for every network, with the opt-in too", () => {
    const server = stubNoWindow()

    for (const network of [
      "ic",
      "local",
      "env",
      { host: LOCAL_REPLICA },
    ] as const) {
      const net = resolveNetwork(network, { allowEnvConfig: true })

      expect(refusal(resolveCanisterId({ name: "backend" }, net)).reason).toBe(
        "no_browser"
      )
    }
    expect(server.cookieReads()).toBe(0)
  })

  it("reads no cookie even for a network that claims to trust it", () => {
    // Defence in depth: a network resolved elsewhere, or by hand, does not get
    // to make a server read a cookie.
    const server = stubNoWindow()
    const claimsTrust: ResolvedNetwork = {
      keySegment: "local",
      host: LOCAL_REPLICA,
      fetchRootKey: true,
      trustsEnv: true,
    }

    const failure = refusal(resolveCanisterId({ name: "backend" }, claimsTrust))

    expect(failure.reason).toBe("no_browser")
    expect(server.cookieReads()).toBe(0)
  })

  it("is refused in a web worker as well, which has no cookie jar", () => {
    const worker = stubNoWindow({ workerOrigin: LOCAL_PAGE })

    const net = resolveNetwork("env", { allowEnvConfig: true })

    expect(refusal(resolveCanisterId({ name: "backend" }, net)).reason).toBe(
      "no_browser"
    )
    expect(worker.cookieReads()).toBe(0)
  })
})

describe("resolving a canister id", () => {
  it("sends nothing, whatever the outcome", () => {
    // The resolver only decides. A failure is turned into a refusal by the
    // caller, before any request is made, and a success needs no request.
    const send = vi.fn()
    vi.stubGlobal("fetch", send)

    for (const [network, page] of [
      ["local", LOCAL_PAGE],
      ["ic", CUSTOM_PAGE],
      ["env", LOCAL_PAGE],
    ] as const) {
      stubPage(page)
      const net = resolveNetwork(network)
      resolveCanisterId({ name: "backend" }, net)
      resolveCanisterId({ name: "missing" }, net)
      resolveCanisterId({ id: EXPLICIT_CANISTER_ID }, net)
    }
    stubNoWindow()
    resolveCanisterId({ name: "backend" }, resolveNetwork("env"))

    expect(send).not.toHaveBeenCalled()
  })
})

describe("the three failures", () => {
  /** One of each, in a fixed order. */
  const failures = () => {
    const server = (() => {
      stubNoWindow()
      return refusal(
        resolveCanisterId({ name: "backend" }, resolveNetwork("env"))
      )
    })()
    vi.unstubAllGlobals()

    const untrusted = refusal(resolveBackend("ic", CUSTOM_PAGE).result)
    vi.unstubAllGlobals()

    stubPage(LOCAL_PAGE)
    const absent = refusal(
      resolveCanisterId({ name: "missing" }, resolveNetwork("local"))
    )
    return { server, untrusted, absent }
  }

  it("have three reasons and three different messages", () => {
    const { server, untrusted, absent } = failures()

    expect([server.reason, untrusted.reason, absent.reason]).toEqual([
      "no_browser",
      "untrusted_host",
      "absent",
    ])
    expect(
      new Set([server.message, untrusted.message, absent.message]).size
    ).toBe(3)
  })

  it("each name the target and say what to do, so a message is actionable", () => {
    const { server, untrusted, absent } = failures()

    for (const failure of [server, untrusted, absent]) {
      expect(failure.message).toMatch(/^\[ic-reactor\] cannot resolve/)
      expect(failure.message).toContain('{ name: "')
      expect(failure.message).toContain("{ id }")
    }
    // A refused cookie is not an absent one: only the first sends the reader to
    // the opt-in, and only the last to the name.
    expect(untrusted.message).toContain("allowEnvConfig: true")
    expect(untrusted.message).toContain("not trusted")
    expect(absent.message).not.toContain("allowEnvConfig")
    expect(absent.message).toContain('"PUBLIC_CANISTER_ID:missing"')
    // A server render is not blamed on the host for having no cookie jar, and
    // the opt-in, which would change nothing there, is not offered.
    expect(server.message).toContain("outside a browser page")
    expect(server.message).not.toContain("allowEnvConfig")
    expect(server.message).not.toContain("not trusted")
  })
})

describe("the cookie's root key", () => {
  it('goes to "env" on a trusted page, and to no other network', () => {
    // Taking it elsewhere would let a cookie choose the key an explicit network
    // is verified with.
    for (const network of [
      "ic",
      "local",
      { host: LOCAL_REPLICA },
      { host: LOCAL_REPLICA, name: "dev" },
    ] as const) {
      stubPage(LOCAL_PAGE)
      expect(
        resolveNetwork(network, { allowEnvConfig: true }).rootKey
      ).toBeUndefined()
    }

    stubPage(LOCAL_PAGE)
    expect(sameBytes(resolveNetwork("env").rootKey, COOKIE_ROOT_KEY)).toBe(true)
  })

  it('is not taken by "env" on a custom domain without the opt-in', () => {
    const { net, fake } = resolveBackend("env", CUSTOM_PAGE)

    expect(net.rootKey).toBeUndefined()
    expect(fake.cookieReads()).toBe(0)
  })

  it('is taken by "env" on a custom domain with the opt-in, and not on opting out', () => {
    expect(
      sameBytes(
        resolveBackend("env", CUSTOM_PAGE, { allowEnvConfig: true }).net
          .rootKey,
        COOKIE_ROOT_KEY
      )
    ).toBe(true)
    expect(
      resolveBackend("env", LOCAL_PAGE, { allowEnvConfig: false }).net.rootKey
    ).toBeUndefined()
  })

  it("is not granted by the deprecated spelling, alone or against the new one", () => {
    const only = { allowEnvRootKey: true } as NetworkOptions
    const against = { allowEnvConfig: false, allowEnvRootKey: true } as never

    expect(resolveBackend("env", CUSTOM_PAGE, only).net.rootKey).toBe(undefined)
    expect(resolveBackend("env", LOCAL_PAGE, against).net.rootKey).toBe(
      undefined
    )
  })
})
