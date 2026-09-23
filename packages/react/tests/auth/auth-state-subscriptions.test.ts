import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { ClientManager } from "@ic-reactor/core"
import { AuthenticationManager } from "../../src/auth/index.js"

/**
 * `subscribeAuthState` pushed the callback onto a list and returned an
 * unsubscribe that filtered EVERY entry equal to it out of the list. A
 * function subscribed twice, such as one module-level handler registered by
 * two mounted components, was notified twice, but the first unsubscribe
 * removed both registrations, so the component still mounted stopped hearing
 * about sign-ins and sign-outs. `ClientManager` had the same defect (#513).
 */
describe("AuthenticationManager.subscribeAuthState", () => {
  let authentication: AuthenticationManager

  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {})
    authentication = new AuthenticationManager({
      clientManager: new ClientManager({
        queryClient: new QueryClient(),
        agentOptions: { host: "https://icp-api.io" },
      }),
    })
  })

  /** Publishes one auth state change. */
  const changeAuthState = () => authentication.setAuthenticating()

  it("keeps the other registration of a shared handler", () => {
    const handler = vi.fn()
    const unsubscribeFirst = authentication.subscribeAuthState(handler)
    authentication.subscribeAuthState(handler)

    unsubscribeFirst()
    changeAuthState()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("removes only its own registration when called twice", () => {
    const handler = vi.fn()
    const unsubscribeFirst = authentication.subscribeAuthState(handler)
    authentication.subscribeAuthState(handler)

    unsubscribeFirst()
    unsubscribeFirst()
    changeAuthState()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("still stops notifying a handler once all its registrations are gone", () => {
    // Guard: the ordinary single-subscription contract.
    const handler = vi.fn()
    const other = vi.fn()
    const unsubscribe = authentication.subscribeAuthState(handler)
    authentication.subscribeAuthState(other)

    unsubscribe()
    changeAuthState()

    expect(handler).not.toHaveBeenCalled()
    expect(other).toHaveBeenCalledTimes(1)
  })
})
