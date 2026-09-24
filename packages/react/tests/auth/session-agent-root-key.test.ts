/**
 * The agent a v9+ auth client mints delegations with, and the root key it
 * verifies against (#713).
 *
 * `ClientManager` keeps a root key the app passed as `agentOptions.rootKey`:
 * `initialize()` no longer replaces it with the one a local host serves. The
 * minting agent follows the same rule, so sign-in checks the Internet Identity
 * canister's certificates against the key the app chose, not against whatever
 * the host's `/api/v2/status` answers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "@ic-reactor/core"
import { AuthenticationManager } from "../../src/auth/index.js"

const authClientMocks = vi.hoisted(() => ({ factory: vi.fn() }))

vi.mock("@icp-sdk/auth/client", () => ({ AuthClient: authClientMocks.factory }))

// There is no replica to probe for the local Internet Identity's sign-in page.
vi.mock("../../src/auth/local-ii-probe.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  probeLocalInternetIdentity: vi.fn(async () => ({
    path: "/authorize" as const,
    inconclusive: false,
  })),
}))

const identity = { getPrincipal: () => Principal.fromText("aaaaa-aa") }

/** Installs a v9+ `AuthClient` (it has `getStatus`) and returns its mock. */
function useSessionEraClient() {
  const factory = authClientMocks.factory
  factory.mockImplementation(function () {
    return {
      getIdentity: vi.fn(() => identity),
      isAuthenticated: vi.fn(() => false),
      signIn: vi.fn(async () => identity),
      signOut: vi.fn(async () => {}),
    }
  })
  Object.assign(factory.prototype as object, {
    getStatus: () => {},
    getPrincipal: () => {},
  })
  return factory
}

/** The agent options the auth client was built with. */
async function sessionAgentOptionsFor(clientManager: ClientManager) {
  const factory = useSessionEraClient()
  vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
  await new AuthenticationManager({ clientManager }).prepareClient()
  const [options] = factory.mock.calls[0] as [Record<string, unknown>]
  return options.agentOptions
}

const APP_KEY = new Uint8Array(133).fill(7)

describe("the v9+ auth client's minting agent off mainnet", () => {
  beforeEach(() => {
    authClientMocks.factory.mockReset()
  })

  it("gets the root key the app passed, and fetches none", async () => {
    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:8000", rootKey: APP_KEY },
    })

    expect(await sessionAgentOptionsFor(clientManager)).toEqual({
      host: "http://127.0.0.1:8000/",
      rootKey: APP_KEY,
    })
  })

  it("fetches the replica's key when the app passed none", async () => {
    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:8000" },
    })

    expect(await sessionAgentOptionsFor(clientManager)).toEqual({
      host: "http://127.0.0.1:8000/",
      shouldFetchRootKey: true,
    })
  })
})
