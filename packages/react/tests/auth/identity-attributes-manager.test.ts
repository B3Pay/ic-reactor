import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "@ic-reactor/core"
import {
  AuthenticationManager,
  IdentityAttributesManager,
} from "../../src/auth/index.js"

const authClientMocks = vi.hoisted(() => ({
  factory: vi.fn(),
}))

vi.mock("@icp-sdk/auth/client", () => ({
  AuthClient: authClientMocks.factory,
}))

function mockAuthClientModule(authClient: Record<string, unknown>) {
  authClientMocks.factory.mockImplementation(function () {
    return authClient as any
  })
  return authClientMocks.factory
}

function makeManagers() {
  const identity = { getPrincipal: () => Principal.fromText("aaaaa-aa") } as any
  const authClient = {
    getIdentity: vi.fn(() => identity),
    isAuthenticated: vi.fn(() => true),
    signIn: vi.fn(async () => identity),
    signOut: vi.fn(),
    requestAttributes: vi.fn(async () => ({
      data: new Uint8Array([68, 73, 68, 76]),
      signature: new Uint8Array([1, 2, 3]),
    })),
  } as any
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
  beforeEach(() => {
    authClientMocks.factory.mockReset()
  })

  it("requests scoped attributes and updates authentication state", async () => {
    const { authClient, authentication, identityAttributes } = makeManagers()

    const result = await identityAttributes.request({
      keys: ["openid:https://issuer.example.com:email"],
      nonce: new Uint8Array([9, 9]),
    })

    expect(authClient.signIn).toHaveBeenCalledTimes(1)
    // The nonce is handed over in its deferred form so the auth client opens
    // the identity provider window inside the user gesture.
    const [request] = authClient.requestAttributes.mock.calls[0]
    expect(request.keys).toEqual(["openid:https://issuer.example.com:email"])
    await expect(request.nonce()).resolves.toEqual(new Uint8Array([9, 9]))
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

    const [request] = authClient.requestAttributes.mock.calls[0]
    expect(request.keys).toEqual([
      "openid:https://login.microsoftonline.com/{tid}/v2.0:email",
    ])
    await expect(request.nonce()).resolves.toEqual(new Uint8Array([9]))
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
    const AuthClient = mockAuthClientModule(authClient)
    const clientManager = new ClientManager({ queryClient: new QueryClient() })
    vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
    const identityAttributes = new IdentityAttributesManager(
      new AuthenticationManager({
        clientManager,
        identityProvider: "https://id.ai/authorize",
      })
    )

    await identityAttributes.requestOpenId({
      openIdProvider: "https://issuer.example.com",
      keys: ["email"],
      nonce: new Uint8Array([9]),
    })

    expect(AuthClient).toHaveBeenCalledTimes(1)
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

  it("keeps a sign-in that completed when the attribute request fails", async () => {
    // Sign-in and the attribute request run in one provider window and can end
    // differently. Here the app's nonce call rejects while the user is still in
    // the window, and the user then finishes signing in. The client held that
    // session, and a reload restored it, but the request had already failed
    // and nothing committed it: the app showed the user signed out.
    const { authClient, authentication, identityAttributes } = makeManagers()
    const signedIn = { getPrincipal: () => Principal.fromText("aaaaa-aa") }
    let holdsSession = false
    let finishSignIn: () => void = () => {}
    authClient.isAuthenticated.mockImplementation(() => holdsSession)
    authClient.getIdentity.mockImplementation(() =>
      holdsSession ? signedIn : { getPrincipal: () => Principal.anonymous() }
    )
    authClient.signIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSignIn = () => {
            holdsSession = true
            resolve(signedIn)
          }
        })
    )
    // Both supported clients await the nonce before sending the request, so
    // its rejection is the request's.
    authClient.requestAttributes.mockImplementation(
      async ({ nonce }: { nonce: () => Promise<Uint8Array> }) => {
        await nonce()
        return { data: new Uint8Array(), signature: new Uint8Array() }
      }
    )
    const nonceFailed = new Error("register_begin rejected the caller")

    const request = identityAttributes.request({
      keys: ["openid:https://accounts.google.com:email"],
      nonce: () => Promise.reject(nonceFailed),
    })
    const settled = request.catch((error: unknown) => error)
    await new Promise((resolve) => setTimeout(resolve, 0))
    finishSignIn()

    await expect(settled).resolves.toBe(nonceFailed)
    expect(authentication.authState.isAuthenticated).toBe(true)
    expect(authentication.authState.identity?.getPrincipal().toText()).toBe(
      "aaaaa-aa"
    )
    expect(authentication.clientManager.identity?.getPrincipal().toText()).toBe(
      "aaaaa-aa"
    )
    // The attribute failure is still reported.
    expect(authentication.authState.error).toBe(nonceFailed)
    expect(authentication.authState.isAuthenticating).toBe(false)
  })

  it("does not commit a sign-in the client has since replaced with another account", async () => {
    // Sign-in A completes while the attribute side is still pending; another
    // login then switches the shared client to account B; only after that does
    // the attribute request fail. Committing A then would replace B with the
    // account the user switched away from.
    const { authClient, authentication, identityAttributes } = makeManagers()
    const accountA = { getPrincipal: () => Principal.fromText("aaaaa-aa") }
    const accountB = {
      getPrincipal: () => Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
    }
    let held: { getPrincipal: () => Principal } | undefined
    let finishSignIn: () => void = () => {}
    authClient.isAuthenticated.mockImplementation(() => held !== undefined)
    authClient.getIdentity.mockImplementation(
      () => held ?? { getPrincipal: () => Principal.anonymous() }
    )
    authClient.signIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSignIn = () => {
            held = accountA
            resolve(accountA)
          }
        })
    )
    authClient.requestAttributes.mockImplementation(
      async ({ nonce }: { nonce: () => Promise<Uint8Array> }) => {
        await nonce()
        return { data: new Uint8Array(), signature: new Uint8Array() }
      }
    )
    let rejectNonce: (error: Error) => void = () => {}
    const nonceFailed = new Error("register_begin rejected the caller")

    const request = identityAttributes.request({
      keys: ["openid:https://accounts.google.com:email"],
      nonce: () =>
        new Promise<Uint8Array>((_, reject) => {
          rejectNonce = reject
        }),
    })
    const settled = request.catch((error: unknown) => error)
    await new Promise((resolve) => setTimeout(resolve, 0))
    finishSignIn()
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Another login moves the shared client, and the manager, to account B.
    held = accountB
    await authentication.commitIdentity(accountB as never, true)
    rejectNonce(nonceFailed)

    await expect(settled).resolves.toBe(nonceFailed)
    expect(authentication.authState.identity?.getPrincipal().toText()).toBe(
      "rrkah-fqaaa-aaaaa-aaaaq-cai"
    )
    expect(authentication.clientManager.identity?.getPrincipal().toText()).toBe(
      "rrkah-fqaaa-aaaaa-aaaaq-cai"
    )
  })

  it("stays signed out when neither the sign-in nor the request succeeds", async () => {
    const { authClient, authentication, identityAttributes } = makeManagers()
    const closed = new Error("UserInterrupt")
    authClient.isAuthenticated.mockReturnValue(false)
    authClient.getIdentity.mockReturnValue({
      getPrincipal: () => Principal.anonymous(),
    })
    authClient.signIn.mockRejectedValue(closed)
    authClient.requestAttributes.mockRejectedValue(closed)

    await expect(
      identityAttributes.request({
        keys: ["openid:https://accounts.google.com:email"],
        nonce: new Uint8Array(32),
      })
    ).rejects.toBe(closed)

    expect(authentication.authState.isAuthenticated).toBe(false)
    expect(authentication.authState.error).toBe(closed)
    expect(authentication.authState.isAuthenticating).toBe(false)
  })
})
