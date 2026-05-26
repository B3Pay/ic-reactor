import { describe, it, expect, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "@ic-reactor/core"
import { AuthenticationManager, IdentityAttributesManager } from "../src"

function makeManagers() {
  const identity = { getPrincipal: () => Principal.fromText("aaaaa-aa") }
  const authClient = {
    getIdentity: vi.fn(() => identity),
    isAuthenticated: vi.fn(() => true),
    signIn: vi.fn(async () => identity),
    signOut: vi.fn(),
    requestAttributes: vi.fn(async () => ({
      data: new Uint8Array([68, 73, 68, 76]),
      signature: new Uint8Array([1, 2, 3]),
    })),
  }
  const clientManager = new ClientManager({ queryClient: new QueryClient() })
  vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
  const authentication = new AuthenticationManager({
    clientManager,
    authClient,
  })
  return {
    authClient,
    authentication,
    identityAttributes: new IdentityAttributesManager(authentication),
  }
}

describe("IdentityAttributesManager", () => {
  it("requests scoped attributes and updates authentication state", async () => {
    const { authClient, authentication, identityAttributes } = makeManagers()

    const result = await identityAttributes.request({
      keys: ["openid:https://issuer.example.com:email"],
      nonce: new Uint8Array([9, 9]),
    })

    expect(authClient.signIn).toHaveBeenCalledTimes(1)
    expect(authClient.requestAttributes).toHaveBeenCalledWith({
      keys: ["openid:https://issuer.example.com:email"],
      nonce: new Uint8Array([9, 9]),
    })
    expect(result.principal).toBe("aaaaa-aa")
    expect(authentication.authState.isAuthenticated).toBe(true)
  })

  it("builds OpenID keys for provider aliases", async () => {
    const { authClient, identityAttributes } = makeManagers()

    const result = await identityAttributes.requestOpenId({
      openIdProvider: "microsoft",
      keys: ["email"],
      nonce: new Uint8Array([9]),
    })

    expect(authClient.requestAttributes).toHaveBeenCalledWith({
      keys: ["openid:https://login.microsoftonline.com/{tid}/v2.0:email"],
      nonce: new Uint8Array([9]),
    })
    expect(result.requestedKeys).toEqual([
      "openid:https://login.microsoftonline.com/{tid}/v2.0:email",
    ])
  })

  it("starts sign-in and attribute request before agent initialization", async () => {
    const events: string[] = []
    const { authClient, identityAttributes } = makeManagers()
    authClient.signIn.mockImplementation(async () => {
      events.push("signIn")
      return { getPrincipal: () => Principal.fromText("aaaaa-aa") }
    })
    authClient.requestAttributes.mockImplementation(async () => {
      events.push("requestAttributes")
      return { data: new Uint8Array(), signature: new Uint8Array() }
    })

    await identityAttributes.request({
      keys: ["openid:https://issuer.example.com:email"],
      nonce: new Uint8Array([9]),
    })

    expect(events.slice(0, 2)).toEqual(["signIn", "requestAttributes"])
  })

  it("does not pass arbitrary issuer URLs as auth provider aliases", async () => {
    const identity = { getPrincipal: () => Principal.fromText("aaaaa-aa") }
    const authClient = {
      getIdentity: vi.fn(() => identity),
      isAuthenticated: vi.fn(() => true),
      signIn: vi.fn(async () => identity),
      signOut: vi.fn(),
      requestAttributes: vi.fn(async () => ({
        data: new Uint8Array(),
        signature: new Uint8Array(),
      })),
    }
    const AuthClient = vi.fn(function () {
      return authClient
    })
    vi.doMock("@icp-sdk/auth/client", () => ({ AuthClient }))
    const clientManager = new ClientManager({ queryClient: new QueryClient() })
    vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
    const identityAttributes = new IdentityAttributesManager(
      new AuthenticationManager({ clientManager })
    )

    await identityAttributes.requestOpenId({
      openIdProvider: "https://issuer.example.com",
      keys: ["email"],
      nonce: new Uint8Array([9]),
    })

    expect(AuthClient).toHaveBeenCalledWith({
      identityProvider: "https://id.ai/authorize",
      windowOpenerFeatures: undefined,
      openIdProvider: undefined,
    })
  })

  it("recovers requests when sign-in errors after identity authentication", async () => {
    const { authClient, authentication, identityAttributes } = makeManagers()
    authClient.signIn.mockRejectedValue(new Error("sign-in timed out"))

    const result = await identityAttributes.request({
      keys: ["openid:https://issuer.example.com:email"],
      nonce: new Uint8Array([9]),
    })

    expect(result.principal).toBe("aaaaa-aa")
    expect(authentication.authState.isAuthenticated).toBe(true)
  })
})
