import { describe, it, expect, afterEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import type { HttpAgentOptions } from "@icp-sdk/core/agent"
import { ClientManager } from "../src/client.js"

/** A recognisable root key, as the `ic_env` cookie would carry it. */
const ENV_ROOT_KEY = new Uint8Array(133).fill(7)

vi.mock("@icp-sdk/core/agent/canister-env", () => ({
  safeGetCanisterEnv: () => ({ IC_ROOT_KEY: ENV_ROOT_KEY }),
}))

const usesEnvRootKey = (manager: ClientManager) => {
  const key = manager.agent.rootKey
  return key instanceof Uint8Array && key.every((b) => b === 7)
}

/**
 * The constructor resolved the agent's host, query-signature verification and
 * root key by assigning them onto the `agentOptions` object it was handed —
 * the caller's own object. So:
 *
 * - a frozen options object made construction throw;
 * - an options object shared between two managers carried the first one's
 *   resolved settings into the second, including a root key the first had
 *   taken from the `ic_env` cookie — which the second then used even though it
 *   passed `allowEnvConfig: false` to refuse exactly that.
 */
describe("ClientManager agentOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("does not write into the options object it is given", () => {
    const agentOptions: HttpAgentOptions = { host: "https://icp-api.io" }

    new ClientManager({ queryClient: new QueryClient(), agentOptions })

    expect(agentOptions).toEqual({ host: "https://icp-api.io" })
  })

  it("accepts frozen options", () => {
    const agentOptions = Object.freeze({ host: "https://icp-api.io" })

    const manager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions,
    })

    expect(manager.agentHost?.toString()).toBe("https://icp-api.io/")
  })

  it("does not hand one manager's cookie root key to another that refused it", () => {
    // A local dev page, where the cookie is trusted by default.
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:5173", protocol: "http:" },
    })
    const shared: HttpAgentOptions = { host: "http://127.0.0.1:4943" }

    const trusting = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: shared,
    })
    const refusing = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: shared,
      allowEnvConfig: false,
    })

    expect(usesEnvRootKey(trusting)).toBe(true)
    expect(usesEnvRootKey(refusing)).toBe(false)
  })

  it("still applies the options it is given", () => {
    // Guard: copying must not drop what the caller configured.
    const rootKey = new Uint8Array(133).fill(9)
    const manager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:4943", rootKey },
    })

    expect(manager.agentHost?.toString()).toBe("http://127.0.0.1:4943/")
    expect(manager.agent.rootKey).toEqual(rootKey)
  })
})
