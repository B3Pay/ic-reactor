import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent"
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
} from "@icp-sdk/core/identity"
import { ClientManager } from "@ic-reactor/core"
import {
  AuthenticationManager,
  IdentityAttributesManager,
} from "../../src/auth/index.js"

/**
 * Signing in again while signed in, and requesting identity attributes, both
 * run a new sign-in, which returns a new delegation for the same principal.
 * `ClientManager.updateAgent` used to sweep the canister cache for it as for a
 * switch between users (#719).
 */

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

/** A delegation from `root` to a fresh session key, as a sign-in returns. */
async function delegate(root: Ed25519KeyIdentity) {
  const sessionKey = Ed25519KeyIdentity.generate()
  const chain = await DelegationChain.create(
    root,
    sessionKey.getPublicKey(),
    new Date(Date.now() + 30 * 60_000)
  )
  return DelegationIdentity.fromDelegation(sessionKey, chain)
}

function setup() {
  const user = Ed25519KeyIdentity.generate()
  let current: Identity = new AnonymousIdentity()
  const authClient = {
    getIdentity: vi.fn(() => current),
    isAuthenticated: vi.fn(() => !current.getPrincipal().isAnonymous()),
    signIn: vi.fn(async () => {
      current = await delegate(user)
      return current
    }),
    signOut: vi.fn(async () => {
      current = new AnonymousIdentity()
    }),
    requestAttributes: vi.fn(async () => ({
      data: new Uint8Array([68, 73, 68, 76]),
      signature: new Uint8Array([1, 2, 3]),
    })),
  }
  const queryClient = new QueryClient()
  const clientManager = new ClientManager({
    queryClient,
    agentOptions: { host: "https://icp-api.io" },
  })
  vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
  clientManager.registerCanisterId(CANISTER_ID)
  const authentication = new AuthenticationManager({
    clientManager,
    authClient: authClient as never,
  })
  return { queryClient, authentication, authClient }
}

const PROFILE = [CANISTER_ID, "my_profile"]

describe("the canister cache across a sign-in for the principal signed in", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("is kept when the user signs in again", async () => {
    const { queryClient, authentication, authClient } = setup()
    await authentication.login()
    queryClient.setQueryData(PROFILE, { name: "Ada" })

    await authentication.login()

    expect(authClient.signIn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(PROFILE)).toEqual({ name: "Ada" })
  })

  it("is kept when the user requests identity attributes", async () => {
    const { queryClient, authentication, authClient } = setup()
    await authentication.login()
    queryClient.setQueryData(PROFILE, { name: "Ada" })

    await new IdentityAttributesManager(authentication).request({
      keys: ["openid:https://issuer.example.com:email"],
      nonce: new Uint8Array([9]),
    })

    expect(authClient.signIn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(PROFILE)).toEqual({ name: "Ada" })
  })

  it("is still swept when the user signs out", async () => {
    const { queryClient, authentication } = setup()
    await authentication.login()
    queryClient.setQueryData(PROFILE, { name: "Ada" })

    await authentication.logout()

    expect(queryClient.getQueryData(PROFILE)).toBeUndefined()
  })
})
