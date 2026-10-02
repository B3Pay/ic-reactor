/**
 * Trap: a root key fetched from a replica nobody vouches for.
 *
 * The mistake a hand-written integration makes: it calls
 * `agent.fetchRootKey()` for every host that is not mainnet, because that is
 * what makes a local replica work, and the staging host, the Codespaces
 * forward and the test network get it too. The key a replica reports is the
 * one every certificate after it is checked against, so whoever answers at
 * that host (a proxy, a hijacked domain) chooses what the app believes: a
 * forged balance, a transfer that "succeeded". Fetching it is the one request
 * that must never be made to a host the app does not control.
 *
 * The guarantee: a given `rootKey` is used and never fetched. Without one the
 * key is fetched from `localhost`, `*.localhost` and loopback addresses only,
 * or when the app writes `fetchRootKey: true` (a line a reviewer can find).
 * Anywhere else the client asks for no key at all, and certificates are
 * checked against mainnet's, which a forged answer fails. The spy below
 * stands where the replica would, and records what is asked of it.
 */
import { afterAll, describe, expect, it } from "vitest"
import { createClient, type Network } from "../../src/index.js"
import * as icrc1 from "../fixtures/icrc1.js"
import { fetchSpy } from "./fetch-spy.js"
import { LEDGER, disposeAll, rejection, track } from "./ledger.js"

afterAll(disposeAll)

/** A root key of the right length, which no replica reports. */
const GIVEN_ROOT_KEY = new Uint8Array(133).fill(5)

/** Reads a fee through a client on `network`, and returns every path the spy was asked for. */
async function pathsAskedFor(network: Network): Promise<string[]> {
  const spy = fetchSpy()
  const client = track(
    createClient({ network, identity: "anonymous", fetch: spy.fetch })
  )
  const ledger = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
  // The spy refuses everything, so the read fails: only what was asked of it
  // is of interest.
  await rejection(ledger.icrc1_fee())
  return spy.paths
}

const STATUS = "/api/v2/status"
const QUERY = new RegExp(`/canister/${LEDGER}/query$`)

describe("a replica that is not local", () => {
  it.each([
    ["a staging domain", "https://staging.example.com"],
    ["a Codespaces forward", "https://fluffy-space-5173.app.github.dev"],
    ["a Gitpod forward", "https://5173-user-repo-abc123.ws-us118.gitpod.io"],
    ["a name that ends in localhost", "http://notlocalhost:4943"],
    [
      "a domain that starts with localhost",
      "http://localhost.example.com:4943",
    ],
    [
      "a domain that starts with an address",
      "http://127.0.0.1.example.com:4943",
    ],
    [
      "a host with localhost in its userinfo",
      "http://localhost@evil.example.com",
    ],
    ["an address just outside 127.0.0.0/8", "http://128.0.0.1:4943"],
  ])("is never asked for its root key: %s", async (_, host) => {
    const paths = await pathsAskedFor({ host })

    // The read goes out, checked against mainnet's key; no key was requested.
    expect(paths).toEqual([expect.stringMatching(QUERY)])
    expect(paths).not.toContain(STATUS)
  })

  it("is never asked for its root key when mainnet is the network", async () => {
    const paths = await pathsAskedFor("ic")

    expect(paths).toEqual([expect.stringMatching(QUERY)])
  })

  it("is asked for it only where the app writes fetchRootKey: true", async () => {
    const paths = await pathsAskedFor({
      host: "https://fluffy-space-5173.app.github.dev",
      fetchRootKey: true,
    })

    // Asked first, before anything else is sent; the spy refuses, so it ends there.
    expect(paths).toEqual([STATUS])
  })
})

describe("a replica that is local", () => {
  it.each([
    ["the local network", "local"],
    ["127.0.0.1", { host: "http://127.0.0.1:4943" }],
    ["localhost", { host: "http://localhost:8000" }],
    ["a subdomain of localhost", { host: "http://abc.localhost:4943" }],
    [
      "an address of 127.0.0.0/8 other than the first",
      { host: "http://127.0.0.2:4943" },
    ],
    ["the IPv6 loopback", { host: "http://[::1]:4943" }],
  ] satisfies [string, Network][])(
    "is asked for its root key, so a local replica works: %s",
    async (_, network) => {
      const paths = await pathsAskedFor(network)

      expect(paths).toEqual([STATUS])
    }
  )

  // An invariant, not a regression a fault can reintroduce here: the agent
  // never fetches a key it was given, whatever the client asks of it.
  it("is not asked for it when the app gives the root key, which is used as given", async () => {
    const paths = await pathsAskedFor({
      host: "http://127.0.0.1:4943",
      rootKey: GIVEN_ROOT_KEY,
    })

    expect(paths).toEqual([expect.stringMatching(QUERY)])
  })

  it("is not asked for it where the app writes fetchRootKey: false", async () => {
    const paths = await pathsAskedFor({
      host: "http://127.0.0.1:4943",
      fetchRootKey: false,
    })

    expect(paths).toEqual([expect.stringMatching(QUERY)])
  })
})
