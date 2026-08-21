/**
 * Which hosts may take their agent root key from the `ic_env` cookie.
 *
 * The root key is what certificate verification is checked against, so adopting
 * one from a cookie is only safe where the cookie is as trusted as the replica:
 * a local development environment. Cookies are not origin-isolated, so on a real
 * domain any sibling subdomain can write `ic_env`.
 *
 * Until 3.12.0 the test was `!isMainnetHost(host)`, which fails OPEN —
 * `isMainnetHost` recognises exactly three boundary domains, so a production
 * dapp on an `ic-domains` custom domain fell straight through it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { ClientManager } from "../src/client.js"
import { allowsEnvRootKey, isMainnetHost } from "../src/utils/helper.js"

/**
 * A recognisable DER-shaped key, so a rootKey we adopted is distinguishable
 * from the mainnet key the agent pins by default.
 */
const ENV_ROOT_KEY = new Uint8Array(133).fill(7)

// The env normally comes from the `ic_env` cookie; mocking the reader keeps the
// test about the host guard rather than about cookie parsing.
vi.mock("@icp-sdk/core/agent/canister-env", () => ({
  safeGetCanisterEnv: () => ({ IC_ROOT_KEY: ENV_ROOT_KEY }),
}))

function withBrowser(origin: string) {
  vi.stubGlobal("window", {
    location: { origin, protocol: new URL(origin).protocol },
  })
}

/** True when the agent ended up using the key from the environment. */
function adoptedEnvRootKey(host: string, allowEnvRootKey?: boolean) {
  const manager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host },
    ...(allowEnvRootKey === undefined ? {} : { allowEnvRootKey }),
  })
  const rootKey = manager.agent.rootKey
  if (!rootKey) return false
  const bytes =
    rootKey instanceof Uint8Array
      ? rootKey
      : new Uint8Array(rootKey as ArrayBuffer)
  return bytes.length === ENV_ROOT_KEY.length && bytes.every((b) => b === 7)
}

beforeEach(() => {
  withBrowser("https://app.example.com")
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("allowsEnvRootKey", () => {
  it("accepts hosts that are unambiguously a local replica", () => {
    for (const host of [
      "http://127.0.0.1:4943",
      "http://localhost:4943",
      "http://backend.localhost:4943",
      "http://[::1]:4943",
    ]) {
      expect(allowsEnvRootKey(host)).toBe(true)
    }
  })

  it("accepts dev-container domains that tunnel a local replica", () => {
    expect(allowsEnvRootKey("https://foo-4943.app.github.dev")).toBe(true)
    expect(allowsEnvRootKey("https://foo-4943.gitpod.io")).toBe(true)
  })

  it("refuses mainnet boundary domains", () => {
    for (const host of [
      "https://ic0.app",
      "https://icp0.io",
      "https://icp-api.io",
      "https://abcde-aaaaa.icp0.io",
    ]) {
      expect(allowsEnvRootKey(host)).toBe(false)
    }
  })

  it("refuses a custom domain, which is the case the old check let through", () => {
    // This is the whole point: isMainnetHost says "not mainnet", so the old
    // `!isMainnetHost(host)` guard treated a production dapp as a testnet.
    expect(isMainnetHost("https://app.example.com")).toBe(false)
    expect(allowsEnvRootKey("https://app.example.com")).toBe(false)
  })

  it("refuses an unparseable or absent host rather than defaulting open", () => {
    expect(allowsEnvRootKey("not a url")).toBe(false)
    expect(allowsEnvRootKey(undefined)).toBe(false)
    expect(allowsEnvRootKey("")).toBe(false)
  })
})

describe("ClientManager root key adoption", () => {
  it("does not take the cookie root key on a custom domain", () => {
    expect(adoptedEnvRootKey("https://app.example.com")).toBe(false)
  })

  it("still takes it on a local replica", () => {
    expect(adoptedEnvRootKey("http://127.0.0.1:4943")).toBe(true)
  })

  it("does not take it on mainnet", () => {
    expect(adoptedEnvRootKey("https://icp-api.io")).toBe(false)
  })

  it("takes it on a custom domain when the caller opts in", () => {
    // The escape hatch for a genuine custom testnet on a real domain.
    expect(adoptedEnvRootKey("https://testnet.example.com", true)).toBe(true)
  })

  it("refuses it on a local replica when the caller opts out", () => {
    expect(adoptedEnvRootKey("http://127.0.0.1:4943", false)).toBe(false)
  })
})
