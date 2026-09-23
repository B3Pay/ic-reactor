import { describe, it, expect, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { ClientManager } from "../src/client.js"
import { getNetworkByHostname } from "../src/utils/helper.js"

/**
 * `ClientManager.network` decides whether the agent is talking to a local
 * replica: `initialize()` fetches the replica's root key only when `isLocal`,
 * and the authentication layer picks the local Internet Identity from the same
 * flag. The classifier matched the strings "localhost" and "127.0.0.1" only,
 * so a replica on the IPv6 loopback (`http://[::1]:4943`) or anywhere else in
 * 127.0.0.0/8 was classified as mainnet. The agent then kept the pinned mainnet
 * root key, every certified response from the replica failed verification, and
 * sign-in went to the mainnet Internet Identity.
 *
 * `allowsEnvRootKey` already treats all of those addresses as loopback.
 */
describe("ClientManager on a loopback replica", () => {
  const LOOPBACK_HOSTS = ["http://[::1]:4943", "http://127.0.0.2:4943"]

  const manager = (host: string) =>
    new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host },
    })

  for (const host of LOOPBACK_HOSTS) {
    it(`classifies ${host} as local`, () => {
      const m = manager(host)

      expect(m.network).toBe("local")
      expect(m.isLocal).toBe(true)
      expect(m.agentState.isLocalhost).toBe(true)
    })

    it(`fetches the replica's root key from ${host} on initialize`, async () => {
      const m = manager(host)
      const fetchRootKey = vi
        .spyOn(m.agent, "fetchRootKey")
        .mockResolvedValue(new Uint8Array(133))

      await m.initialize()

      expect(fetchRootKey).toHaveBeenCalledTimes(1)
    })
  }

  it("classifies the loopback addresses themselves as local", () => {
    for (const hostname of ["[::1]", "::1", "127.0.0.2", "127.255.255.254"]) {
      expect(getNetworkByHostname(hostname)).toBe("local")
    }
  })

  it("still classifies the hosts it always recognised", () => {
    // Guard: the existing local names, the dev-container tunnels, and mainnet.
    expect(getNetworkByHostname("127.0.0.1")).toBe("local")
    expect(getNetworkByHostname("localhost")).toBe("local")
    expect(getNetworkByHostname("backend.localhost")).toBe("local")
    expect(getNetworkByHostname("foo-4943.app.github.dev")).toBe("remote")
    expect(getNetworkByHostname("icp-api.io")).toBe("ic")
    expect(getNetworkByHostname("app.example.com")).toBe("ic")
  })

  it("does not take a routable address for loopback", () => {
    // Guard: only 127.0.0.0/8 is loopback, not every address starting "127".
    expect(getNetworkByHostname("128.0.0.1")).toBe("ic")
    expect(getNetworkByHostname("10.127.0.1")).toBe("ic")
    expect(manager("https://icp-api.io").isLocal).toBe(false)
  })
})
