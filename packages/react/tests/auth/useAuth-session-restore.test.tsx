import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, act, cleanup } from "@testing-library/react"
import React from "react"
import { createRoot } from "react-dom/client"
import { QueryClient } from "@tanstack/react-query"
import { ClientManager } from "@ic-reactor/core"
import { Principal } from "@icp-sdk/core/principal"
import { AuthenticationManager } from "../../src/auth/index.js"
import { createAuthHooks } from "../../src/hooks/createAuthHooks.js"

/**
 * `useAuth()` restores the previous session when it mounts. That restore used
 * to run once per mounted consumer rather than once per manager, and every run
 * publishes `isAuthenticating: true` and then the restored state.
 */

/**
 * After this many identity reads the fake client stops answering, which parks
 * the restore that asked and so ends a loop of restores. The tests can then
 * count the reads instead of hanging.
 */
const READ_LIMIT = 25

const identityOf = (text: string) =>
  ({ getPrincipal: () => Principal.fromText(text) }) as never

/**
 * A client holding a session, or none. Both real clients answer these from
 * memory once loaded, so each read settles on the microtask queue.
 */
function fakeAuthClient(signedIn: boolean) {
  const client = {
    signedIn,
    getIdentity: vi.fn(() =>
      client.getIdentity.mock.calls.length > READ_LIMIT
        ? new Promise<never>(() => {})
        : Promise.resolve(
            identityOf(client.signedIn ? "aaaaa-aa" : "2vxsx-fae")
          )
    ),
    isAuthenticated: vi.fn(async () => client.signedIn),
    // A sign-in whose provider window stays open.
    signIn: vi.fn(() => new Promise<never>(() => {})),
    signOut: vi.fn(async () => {}),
  }
  return client
}

function setup(signedIn: boolean) {
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: "https://icp-api.io" },
  })
  const authClient = fakeAuthClient(signedIn)
  const authentication = new AuthenticationManager({
    clientManager,
    authClient: authClient as never,
  })
  const { useAuth } = createAuthHooks(authentication)
  /** Every `isAuthenticating: true` the manager publishes from now on. */
  const authenticatingPublished = () => {
    const seen: true[] = []
    authentication.subscribeAuthState(
      (state) => state.isAuthenticating && seen.push(true)
    )
    return seen
  }
  return { authClient, authentication, useAuth, authenticatingPublished }
}

/** Let the restore, which only waits on promises, run to the end. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

beforeEach(() => {
  // The manager narrates every state change in development.
  vi.spyOn(console, "debug").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("useAuth restores the session once per manager", () => {
  it("does not restore again when another consumer mounts", async () => {
    const { authClient, useAuth, authenticatingPublished } = setup(false)
    const Consumer = () => {
      useAuth()
      return null
    }
    const { rerender } = render(<Consumer key="first" />)
    await settle()
    const reads = authClient.getIdentity.mock.calls.length
    const published = authenticatingPublished()

    rerender(
      <>
        <Consumer key="first" />
        <Consumer key="second" />
      </>
    )
    await settle()

    expect(published).toEqual([])
    expect(authClient.getIdentity).toHaveBeenCalledTimes(reads)
  })

  it("settles a guard that hides a useAuth() consumer while authenticating", async () => {
    const { authClient, useAuth } = setup(false)
    const SignInButton = () => {
      useAuth()
      return <button>Sign in</button>
    }
    // Waiting for the session before showing sign-in UI, as the guides advise.
    const Header = () => {
      const { isAuthenticating } = useAuth()
      return isAuthenticating ? <p>Loading</p> : <SignInButton />
    }

    // Rendered outside act(), which schedules renders as a browser does. The
    // loop lives in that scheduling: under act() React 18 batches the restore's
    // two updates into one render, so the consumer never unmounts.
    const reactGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const actEnvironment = reactGlobal.IS_REACT_ACT_ENVIRONMENT
    reactGlobal.IS_REACT_ACT_ENVIRONMENT = false
    const container = document.createElement("div")
    const root = createRoot(container)
    try {
      root.render(<Header />)
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(container.innerHTML).toBe("<button>Sign in</button>")
      // The constructor syncs from the client once, and the restore reads once.
      expect(authClient.getIdentity.mock.calls.length).toBeLessThanOrEqual(2)
    } finally {
      root.unmount()
      reactGlobal.IS_REACT_ACT_ENVIRONMENT = actEnvironment
    }
  })

  it("leaves isAuthenticating set when a consumer mounts during sign-in", async () => {
    const { authentication, useAuth } = setup(false)
    const Consumer = () => {
      useAuth()
      return null
    }
    const { rerender } = render(<Consumer key="first" />)
    await settle()

    // The provider window is open.
    void authentication.login().catch(() => undefined)
    await settle()
    expect(authentication.authState.isAuthenticating).toBe(true)

    rerender(
      <>
        <Consumer key="first" />
        <Consumer key="second" />
      </>
    )
    await settle()

    expect(authentication.authState.isAuthenticating).toBe(true)
  })

  it("still notices a lapsed delegation when a later consumer mounts", async () => {
    const { authClient, authentication, useAuth } = setup(true)
    const Consumer = () => {
      useAuth()
      return null
    }
    const { rerender } = render(<Consumer key="first" />)
    await settle()
    expect(authentication.authState.isAuthenticated).toBe(true)

    // The delegation expires while the page is open.
    authClient.signedIn = false
    rerender(
      <>
        <Consumer key="first" />
        <Consumer key="second" />
      </>
    )
    await settle()

    expect(authentication.authState.isAuthenticated).toBe(false)
  })
})
