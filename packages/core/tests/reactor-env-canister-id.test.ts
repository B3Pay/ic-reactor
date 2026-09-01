/**
 * Which hosts may take a reactor's canister ID from the `ic_env` cookie.
 *
 * The cookie carries three values — the root key, the Internet Identity
 * provider, and the `PUBLIC_CANISTER_ID:<name>` entries — and it is not
 * origin-isolated, so any sibling subdomain of the registrable domain can write
 * it. The first two were guarded; the canister ID was not (#348), so a sibling
 * subdomain could substitute the canister every read and every authenticated
 * update call is routed to. Certificate verification does not notice: the
 * attacker names a real canister, whose responses verify against the same
 * mainnet root key.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"

/** The id an attacker-writable cookie would carry. */
const ENV_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
/** An id passed in configuration, which the cookie must never override. */
const EXPLICIT_CANISTER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai"

// The env normally comes from the `ic_env` cookie; mocking the reader keeps the
// test about the host guard rather than about cookie parsing. A root key is
// present because `safeGetCanisterEnv` only returns entries at all when the
// cookie carries a well-formed one — any 133-byte value satisfies it, which is
// exactly why the cookie is not evidence of anything.
vi.mock("@icp-sdk/core/agent/canister-env", () => ({
  safeGetCanisterEnv: () => ({
    IC_ROOT_KEY: new Uint8Array(133).fill(7),
    "PUBLIC_CANISTER_ID:backend": ENV_CANISTER_ID,
  }),
}))

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ get: IDL.Func([], [IDL.Text], ["query"]) })

function withBrowser(origin: string) {
  vi.stubGlobal("window", {
    location: { origin, protocol: new URL(origin).protocol },
  })
}

/**
 * Build a reactor the way the generated code does — no `canisterId`, resolved
 * by name — and report which id it ended up targeting.
 */
function resolveCanisterId(
  host: string,
  options?: { allowEnvConfig?: boolean; allowEnvRootKey?: boolean },
  page?: string
) {
  // The page decides who can write the cookie, so it is part of the fixture and
  // not a detail: a "local replica" case served from a real domain is a
  // different situation, and has its own test below.
  if (page) withBrowser(page)
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host },
    ...options,
  })
  return new Reactor({
    clientManager,
    idlFactory,
    name: "backend",
  }).canisterId.toString()
}

/**
 * The shape #348 actually describes: a deployed dapp that configures no host at
 * all, so `ClientManager` infers one from the page. Nothing in the generated
 * setup passes `agentOptions`, so this is the path that matters most and the
 * one an explicit-host test never reaches.
 */
function resolveFromPage(origin: string) {
  withBrowser(origin)
  const clientManager = new ClientManager({ queryClient: new QueryClient() })
  return new Reactor({
    clientManager,
    idlFactory,
    name: "backend",
  }).canisterId.toString()
}

beforeEach(() => {
  withBrowser("https://app.example.com")
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Reactor canister ID from ic_env", () => {
  it("refuses the cookie on a custom domain, which is the attack in #348", () => {
    // app.example.com and evil.example.com share a registrable domain, so the
    // cookie is attacker-writable here. Failing closed is the whole fix: the
    // alternative is silently talking to someone else's canister.
    expect(() => resolveCanisterId("https://app.example.com")).toThrow(
      /not trusted for this agent's host/
    )
  })

  it("refuses the cookie for a dapp that configures no host at all", () => {
    // The generated setup passes no `agentOptions`, so the host comes from the
    // page. A custom domain is not recognised as an origin worth adopting, so
    // the agent falls back to the mainnet API — either way the cookie is out.
    expect(() => resolveFromPage("https://app.example.com")).toThrow(
      /not trusted for this agent's host/
    )
  })

  it("refuses it for a dapp served from its own mainnet asset canister", () => {
    // Here the page origin IS adopted as the host, so this exercises the other
    // branch of the host inference and still has to fail closed.
    expect(() => resolveFromPage("https://abcde-aaaaa.icp0.io")).toThrow(
      /not trusted for this agent's host/
    )
  })

  it("still resolves it for a dapp served from a local replica", () => {
    // Same no-agentOptions path, on the host where the cookie is trusted. This
    // is the local `icp deploy` flow, and it must not have been broken by the
    // two cases above.
    expect(resolveFromPage("http://localhost:4943")).toBe(ENV_CANISTER_ID)
  })

  it("refuses the cookie on mainnet", () => {
    expect(() => resolveCanisterId("https://icp-api.io")).toThrow(
      /not trusted for this agent's host/
    )
  })

  it("still takes it on a local replica, which is the generated dev workflow", () => {
    // The vite plugin injects this cookie on the dev server, and generated
    // reactors omit `canisterId` when none is configured. That path has to keep
    // working, or the guard breaks every local project. The page is the dev
    // server, which is the whole reason the cookie can be believed here.
    expect(
      resolveCanisterId(
        "http://127.0.0.1:4943",
        undefined,
        "http://127.0.0.1:4943"
      )
    ).toBe(ENV_CANISTER_ID)
  })

  it("refuses it when the page is on a real domain, whatever the agent host", () => {
    // Reported by Codex on this PR, and correct: keying only on the agent host
    // let a document on app.example.com pointed at a loopback replica keep
    // trusting a cookie every sibling of example.com can write. The agent host
    // says nothing about who owns the cookie jar.
    expect(() =>
      resolveCanisterId(
        "http://127.0.0.1:4943",
        undefined,
        "https://app.example.com"
      )
    ).toThrow(/not trusted for this agent's host/)
    // Same for a dev-container tunnel, whose registrable domain is shared with
    // every other user of the platform.
    expect(() =>
      resolveCanisterId(
        "https://foo-4943.app.github.dev",
        undefined,
        "https://app.example.com"
      )
    ).toThrow(/not trusted for this agent's host/)
  })

  it("takes it on a custom domain when the caller opts in", () => {
    expect(
      resolveCanisterId("https://testnet.example.com", { allowEnvConfig: true })
    ).toBe(ENV_CANISTER_ID)
  })

  it("does not let the deprecated spelling widen into canister IDs", () => {
    // `allowEnvRootKey` granted the root key and nothing else. Someone who set
    // it for a custom testnet did not thereby agree to take their canister IDs
    // from the same cookie, and a rename must not widen a grant already in the
    // wild — so the old name keeps its old reach and `allowEnvConfig` is the
    // one that opts into the whole cookie. (The root key it does still grant is
    // pinned in client-env-root-key.test.ts.)
    expect(() =>
      resolveCanisterId("https://testnet.example.com", {
        allowEnvRootKey: true,
      })
    ).toThrow(/not trusted for this agent's host/)
  })

  it("lets allowEnvConfig win over the deprecated spelling", () => {
    // For the canister ID the deprecated name is not consulted at all, so this
    // pair only says something once the root key is watched too — see the
    // precedence case in "ClientManager root key" below, which is where the two
    // options genuinely compete.
    expect(() =>
      resolveCanisterId("http://127.0.0.1:4943", {
        allowEnvConfig: false,
        allowEnvRootKey: true,
      })
    ).toThrow(/not trusted for this agent's host/)
  })

  it("names the page origin as well as the agent host", () => {
    // On a custom domain with no explicit host the agent falls back to the
    // mainnet API, so the agent host alone names somewhere the reader has never
    // heard of while their address bar says something else.
    expect(() => resolveCanisterId("https://icp-api.io")).toThrow(
      /page https:\/\/app\.example\.com/
    )
  })

  it("refuses it on a local replica when the caller opts out", () => {
    expect(() =>
      resolveCanisterId("http://127.0.0.1:4943", { allowEnvConfig: false })
    ).toThrow(/not trusted for this agent's host/)
  })

  it("prefers an explicitly configured id over the cookie, on any host", () => {
    for (const host of ["http://127.0.0.1:4943", "https://app.example.com"]) {
      const clientManager = new ClientManager({
        queryClient: new QueryClient(),
        agentOptions: { host },
      })
      const reactor = new Reactor({
        clientManager,
        idlFactory,
        name: "backend",
        canisterId: EXPLICIT_CANISTER_ID,
      })
      expect(reactor.canisterId.toString()).toBe(EXPLICIT_CANISTER_ID)
    }
  })

  it("names the server render rather than blaming the host, with no window", () => {
    // A trusted host with no browser is not a refused cookie: there is no
    // cookie jar at all. Saying the host is untrusted would send a Next.js
    // reader off to configure an option that would change nothing.
    vi.unstubAllGlobals()
    expect(() => resolveCanisterId("http://127.0.0.1:4943")).toThrow(
      /no ic_env cookie to read outside a browser/
    )
  })

  it("says which failure it was, so the message is actionable", () => {
    // A refused cookie and an absent one are different problems with different
    // fixes, and reporting the first as the second sends the reader looking for
    // a cookie that is sitting right there.
    expect(() => resolveCanisterId("https://app.example.com")).toThrow(
      /allowEnvConfig: true/
    )
    withBrowser("http://127.0.0.1:4943")
    expect(
      () =>
        // Trusted page and host, but nothing in the cookie under this name.
        new Reactor({
          clientManager: new ClientManager({
            queryClient: new QueryClient(),
            agentOptions: { host: "http://127.0.0.1:4943" },
          }),
          idlFactory,
          name: "not_in_the_cookie",
        })
    ).toThrow(/could not be resolved from the ic_env cookie/)
  })
})

describe("ClientManager.trustsEnvConfig", () => {
  function trusts(
    host: string,
    options?: { allowEnvConfig?: boolean; allowEnvRootKey?: boolean },
    page = "http://localhost:4943"
  ) {
    withBrowser(page)
    return new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host },
      ...options,
    }).trustsEnvConfig
  }

  // NOT interchangeable with the root-key gate: that one also honours the
  // deprecated `allowEnvRootKey`, which this deliberately does not. Collapsing
  // the two would silently restore the widening this change exists to avoid.
  it("uses the same host allowlist the root key does, on both sides", () => {
    expect(trusts("http://127.0.0.1:4943")).toBe(true)
    expect(trusts("http://localhost:4943")).toBe(true)
    expect(
      trusts(
        "https://foo-4943.app.github.dev",
        undefined,
        "https://foo-4943.app.github.dev"
      )
    ).toBe(true)
    expect(trusts("https://app.example.com")).toBe(false)
    expect(trusts("https://icp-api.io")).toBe(false)
    // Either side failing is enough to refuse.
    expect(
      trusts("http://127.0.0.1:4943", undefined, "https://app.example.com")
    ).toBe(false)
    expect(
      trusts("https://icp-api.io", undefined, "http://localhost:4943")
    ).toBe(false)
  })

  it("takes allowEnvConfig, and only allowEnvConfig", () => {
    expect(trusts("https://app.example.com", { allowEnvConfig: true })).toBe(
      true
    )
    // Not the deprecated spelling: that grant was about the root key.
    expect(trusts("https://app.example.com", { allowEnvRootKey: true })).toBe(
      false
    )
    expect(trusts("http://127.0.0.1:4943", { allowEnvConfig: false })).toBe(
      false
    )
  })
})

describe("ClientManager root key", () => {
  /** The mocked cookie root key, so an adopted one is distinguishable. */
  function adoptedEnvRootKey(
    host: string,
    options?: { allowEnvConfig?: boolean; allowEnvRootKey?: boolean }
  ) {
    const manager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host },
      ...options,
    })
    const rootKey = manager.agent.rootKey
    if (!rootKey) return false
    const bytes =
      rootKey instanceof Uint8Array
        ? rootKey
        : new Uint8Array(rootKey as ArrayBuffer)
    return bytes.length === 133 && bytes.every((b) => b === 7)
  }

  it("is granted by the new option, not only the deprecated one", () => {
    // Without this, dropping `allowEnvConfig` from the root-key term would go
    // unnoticed, and a caller migrating off the old spelling would silently
    // lose the root key their custom testnet needs.
    expect(adoptedEnvRootKey("https://testnet.example.com")).toBe(false)
    expect(
      adoptedEnvRootKey("https://testnet.example.com", {
        allowEnvConfig: true,
      })
    ).toBe(true)
  })

  it("is still granted by the deprecated spelling", () => {
    expect(
      adoptedEnvRootKey("https://testnet.example.com", {
        allowEnvRootKey: true,
      })
    ).toBe(true)
  })

  it("lets allowEnvConfig override the deprecated spelling, not the reverse", () => {
    // The one place the two options actually compete. Inverting the precedence
    // would let a stale `allowEnvRootKey: true` defeat an explicit opt-out.
    expect(
      adoptedEnvRootKey("https://testnet.example.com", {
        allowEnvConfig: false,
        allowEnvRootKey: true,
      })
    ).toBe(false)
  })
})
