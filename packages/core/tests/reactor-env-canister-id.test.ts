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
  options?: { allowEnvConfig?: boolean; allowEnvRootKey?: boolean }
) {
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

  it("refuses the cookie on mainnet", () => {
    expect(() => resolveCanisterId("https://icp-api.io")).toThrow(
      /not trusted for this agent's host/
    )
  })

  it("still takes it on a local replica, which is the generated dev workflow", () => {
    // The vite plugin injects this cookie on the dev server, and generated
    // reactors omit `canisterId` when none is configured. That path has to keep
    // working, or the guard breaks every local project.
    expect(resolveCanisterId("http://127.0.0.1:4943")).toBe(ENV_CANISTER_ID)
  })

  it("takes it on a custom domain when the caller opts in", () => {
    expect(
      resolveCanisterId("https://testnet.example.com", { allowEnvConfig: true })
    ).toBe(ENV_CANISTER_ID)
  })

  it("honours the deprecated allowEnvRootKey spelling as an alias", () => {
    // The option was renamed because it governs all three cookie-derived
    // values, but the old name is public API and still has to work.
    expect(
      resolveCanisterId("https://testnet.example.com", {
        allowEnvRootKey: true,
      })
    ).toBe(ENV_CANISTER_ID)
  })

  it("lets allowEnvConfig win over the deprecated spelling", () => {
    expect(() =>
      resolveCanisterId("http://127.0.0.1:4943", {
        allowEnvConfig: false,
        allowEnvRootKey: true,
      })
    ).toThrow(/not trusted for this agent's host/)
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

  it("says which failure it was, so the message is actionable", () => {
    // A refused cookie and an absent one are different problems with different
    // fixes, and reporting the first as the second sends the reader looking for
    // a cookie that is sitting right there.
    expect(() => resolveCanisterId("https://app.example.com")).toThrow(
      /allowEnvConfig: true/
    )
    expect(
      () =>
        // Trusted host, but nothing in the cookie under this name.
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
    options?: { allowEnvConfig?: boolean; allowEnvRootKey?: boolean }
  ) {
    return new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host },
      ...options,
    }).trustsEnvConfig
  }

  it("is the same decision the root key already used", () => {
    expect(trusts("http://127.0.0.1:4943")).toBe(true)
    expect(trusts("http://localhost:4943")).toBe(true)
    expect(trusts("https://foo-4943.app.github.dev")).toBe(true)
    expect(trusts("https://app.example.com")).toBe(false)
    expect(trusts("https://icp-api.io")).toBe(false)
  })

  it("takes the explicit opt-in under either spelling", () => {
    expect(trusts("https://app.example.com", { allowEnvConfig: true })).toBe(
      true
    )
    expect(trusts("https://app.example.com", { allowEnvRootKey: true })).toBe(
      true
    )
    expect(trusts("http://127.0.0.1:4943", { allowEnvConfig: false })).toBe(
      false
    )
  })
})
