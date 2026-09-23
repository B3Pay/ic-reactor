import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient } from "@tanstack/react-query"
import { ClientManager } from "@ic-reactor/core"
import { Principal } from "@icp-sdk/core/principal"
import { AuthenticationManager } from "../../src/auth/index.js"
import type { AuthState } from "../../src/auth/types.js"
import { createAuthHooks } from "../../src/hooks/createAuthHooks.js"

/**
 * `AuthenticationManager` tells its subscribers about an auth state change
 * after it has made it: the state is recorded, and on a sign-in the agent
 * already signs as the user. A subscriber that threw ended the loop, so every
 * subscriber after it never heard the change.
 *
 * An app's own subscriber is usually registered at module scope, before any
 * component mounts, so it comes before every `useAuth()`. One that throws once
 * someone is signed in (an analytics call that fails, say) left `useAuth()` on
 * `isAuthenticating: true` for good, while the manager held the signed-in user.
 * `ClientManager` had the same defect (#638).
 */

const USER = "aaaaa-aa"

// The client `useAuth()` builds itself, through the optional peer's module.
const authModule = vi.hoisted(() => ({ AuthClient: vi.fn() }))
vi.mock("@icp-sdk/auth/client", () => authModule)

const identityOf = (text: string) =>
  ({ getPrincipal: () => Principal.fromText(text) }) as never

/** A client that restores `signedIn` and signs in when asked. */
function fakeAuthClient({ signedIn = false } = {}) {
  let holdsSession = signedIn
  return {
    getIdentity: vi.fn(async () =>
      identityOf(holdsSession ? USER : "2vxsx-fae")
    ),
    isAuthenticated: vi.fn(async () => holdsSession),
    signIn: vi.fn(async () => {
      holdsSession = true
      return identityOf(USER)
    }),
    signOut: vi.fn(async () => {
      holdsSession = false
    }),
    requestAttributes: vi.fn(),
  }
}

function createManager(authClient = fakeAuthClient()) {
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: "https://icp-api.io" },
  })
  vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
  const authentication = new AuthenticationManager({
    clientManager,
    authClient: authClient as never,
  })
  return { clientManager, authentication }
}

/** An app subscriber that fails whenever someone is signed in. */
const throwOnceSignedIn = (state: AuthState) => {
  if (state.isAuthenticated) throw new Error("analytics is down")
}

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("auth state subscribers", () => {
  it("all hear the change when one of them throws", () => {
    const { authentication } = createManager()
    authentication.subscribeAuthState(() => {
      throw new Error("subscriber failed")
    })
    const heard: AuthState[] = []
    authentication.subscribeAuthState((state) => heard.push(state))

    // The caller still learns about the failure.
    expect(() => authentication.setAuthenticating()).toThrow(
      "subscriber failed"
    )

    expect(heard).toEqual([authentication.authState])
    expect(heard[0].isAuthenticating).toBe(true)
  })

  it("rethrows the first error when several throw", () => {
    // Guard: one error reaches the caller, and it is the first one raised.
    const { authentication } = createManager()
    authentication.subscribeAuthState(() => {
      throw new Error("first")
    })
    authentication.subscribeAuthState(() => {
      throw new Error("second")
    })

    expect(() => authentication.setAuthenticating()).toThrow("first")
  })

  it("are called in the order they subscribed, and a new one waits for the next change", () => {
    // Guard: what did not change about the notification loop.
    const { authentication } = createManager()
    const calls: string[] = []
    let added = false
    authentication.subscribeAuthState(() => {
      calls.push("a")
      if (!added) {
        added = true
        authentication.subscribeAuthState(() => calls.push("c"))
      }
    })
    authentication.subscribeAuthState(() => calls.push("b"))

    authentication.setAuthenticating()
    expect(calls).toEqual(["a", "b"])

    authentication.setAuthenticating()
    expect(calls).toEqual(["a", "b", "a", "b", "c"])
  })

  it("end on the current state when one of them changes it again", () => {
    // Guard: a subscriber that clears a stale error as soon as a sign-in
    // starts, registered before one that tracks the state.
    const { authentication } = createManager()
    authentication.subscribeAuthState((state) => {
      if (state.error) authentication.setAuthenticating()
    })
    const heard: AuthState[] = []
    authentication.subscribeAuthState((state) => heard.push(state))

    authentication.setAuthenticationError(new Error("popup closed"))

    expect(authentication.authState.error).toBeUndefined()
    expect(heard[heard.length - 1]).toBe(authentication.authState)
  })
})

describe("useAuth() with an app subscriber that throws", () => {
  it("shows a sign-in the manager made", async () => {
    const { authentication, clientManager } = createManager()
    authentication.subscribeAuthState(throwOnceSignedIn)
    const { useAuth } = createAuthHooks(authentication)
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(authentication.client).toBeDefined())

    await act(async () => {
      await result.current.login().catch(() => undefined)
    })

    // The manager signed the user in, and the agent signs as them.
    expect(authentication.authState.isAuthenticated).toBe(true)
    expect(clientManager.identity?.getPrincipal().toText()).toBe(USER)
    // So the hook has to say so, instead of "Connecting..." for good.
    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.principal?.toText()).toBe(USER)
    expect(result.current.error?.message).toBe("analytics is down")
  })

  it("shows a session restored on page load", async () => {
    // The restore every page load runs for a user with a stored session, with
    // the client `useAuth()` builds itself.
    const stored = fakeAuthClient({ signedIn: true })
    authModule.AuthClient.mockImplementation(function () {
      return stored
    })
    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
    vi.spyOn(clientManager, "initialize").mockResolvedValue(clientManager)
    const authentication = new AuthenticationManager({ clientManager })
    authentication.subscribeAuthState(throwOnceSignedIn)
    const { useAuth } = createAuthHooks(authentication)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(stored.isAuthenticated).toHaveBeenCalled())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(authentication.authState.isAuthenticated).toBe(true)
    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.principal?.toText()).toBe(USER)
  })
})
