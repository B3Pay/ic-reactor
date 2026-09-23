import { describe, it, expect, vi, afterEach } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import React, { useState } from "react"
import { QueryClient } from "@tanstack/react-query"
import { ClientManager } from "@ic-reactor/core"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import { AuthenticationManager } from "../../src/auth/index.js"
import { createAuthHooks } from "../../src/hooks/createAuthHooks.js"

/**
 * `useAuth`, `useUserPrincipal` and `useAgentState` handed
 * `useSyncExternalStore` a subscribe function built on every render. React
 * unsubscribes and subscribes again whenever that function changes, and each
 * unsubscribe filters the manager's whole subscriber list. An auth state change
 * re-renders every consumer, so with k consumers it made k re-subscriptions and
 * about k²/2 subscriber visits: 2,001,000 for 2,000 `useUserPrincipal()` rows,
 * and 1,000 re-subscriptions per change at k = 1,000.
 */

function setup() {
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: "https://icp-api.io" },
  })
  const anonymous = new AnonymousIdentity()
  const authentication = new AuthenticationManager({
    clientManager,
    authClient: {
      getIdentity: async () => anonymous,
      isAuthenticated: async () => false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    } as never,
  })
  const subscribeAuthState = vi.spyOn(authentication, "subscribeAuthState")
  const subscribeAgentState = vi.spyOn(clientManager, "subscribeAgentState")
  return {
    authentication,
    subscribeAuthState,
    subscribeAgentState,
    ...createAuthHooks(authentication),
  }
}

/** The manager's live registrations, read for the unmount check only. */
const authSubscriberCount = (authentication: AuthenticationManager) =>
  (authentication as unknown as { authStateSubscribers: unknown[] })
    .authStateSubscribers.length

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

afterEach(() => {
  cleanup()
})

describe("auth hooks subscriptions", () => {
  it("do not subscribe again when a consumer re-renders", async () => {
    const hooks = setup()
    let rerender!: (value: number) => void
    function Consumer() {
      const [, setValue] = useState(0)
      rerender = setValue
      hooks.useAuth()
      hooks.useUserPrincipal()
      hooks.useAgentState()
      return null
    }

    render(<Consumer />)
    await settle()
    const authSubscriptions = hooks.subscribeAuthState.mock.calls.length
    const agentSubscriptions = hooks.subscribeAgentState.mock.calls.length

    for (let value = 1; value <= 10; value++) {
      act(() => rerender(value))
    }

    // Main subscribed 20 more times to the auth state and 10 more to the
    // agent state: once per hook per render.
    expect(hooks.subscribeAuthState).toHaveBeenCalledTimes(authSubscriptions)
    expect(hooks.subscribeAgentState).toHaveBeenCalledTimes(agentSubscriptions)
  })

  it("do not re-subscribe their consumers on an auth state change", async () => {
    const hooks = setup()
    function Row() {
      hooks.useUserPrincipal()
      return null
    }

    render(
      <>
        {Array.from({ length: 200 }, (_, index) => (
          <Row key={index} />
        ))}
      </>
    )
    await settle()
    const subscriptions = hooks.subscribeAuthState.mock.calls.length
    expect(subscriptions).toBe(200)

    act(() => hooks.authentication.setAuthenticating())
    act(() => hooks.authentication.setAuthenticationError(new Error("x")))

    // Main subscribed all 200 rows again for each of the two changes.
    expect(hooks.subscribeAuthState).toHaveBeenCalledTimes(subscriptions)
  })

  it("still deliver changes and unsubscribe on unmount", async () => {
    const hooks = setup()
    const seen: boolean[] = []
    function Consumer() {
      seen.push(hooks.useAuth().isAuthenticating)
      return null
    }

    const { unmount } = render(<Consumer />)
    await settle()
    act(() => hooks.authentication.setAuthenticating())
    expect(seen[seen.length - 1]).toBe(true)
    act(() => hooks.authentication.setAuthenticationError(new Error("x")))
    expect(seen[seen.length - 1]).toBe(false)

    unmount()
    expect(authSubscriberCount(hooks.authentication)).toBe(0)
  })
})
