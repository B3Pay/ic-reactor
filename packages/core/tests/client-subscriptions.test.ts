import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import { ClientManager } from "../src/client.js"

/**
 * `subscribe` and `subscribeAgentState` push the callback onto a list and
 * return an unsubscribe that filtered EVERY entry equal to it out of the list.
 * A function subscribed twice — one module-level handler registered by two
 * mounted components, say — was notified twice, but the first unsubscribe
 * removed both registrations, so the component still mounted silently stopped
 * hearing about sign-ins, sign-outs and agent readiness.
 */
describe("ClientManager subscriptions", () => {
  let manager: ClientManager

  beforeEach(() => {
    manager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
  })

  describe("identity", () => {
    it("keeps the other registration of a shared handler", () => {
      const handler = vi.fn()
      const unsubscribeFirst = manager.subscribe(handler)
      manager.subscribe(handler)

      unsubscribeFirst()
      manager.updateAgent(new AnonymousIdentity())

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it("removes only its own registration when called twice", () => {
      const handler = vi.fn()
      const unsubscribeFirst = manager.subscribe(handler)
      manager.subscribe(handler)

      unsubscribeFirst()
      unsubscribeFirst()
      manager.updateAgent(new AnonymousIdentity())

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it("still stops notifying a handler once all its registrations are gone", () => {
      // Guard: the ordinary single-subscription contract.
      const handler = vi.fn()
      const other = vi.fn()
      const unsubscribe = manager.subscribe(handler)
      manager.subscribe(other)

      unsubscribe()
      manager.updateAgent(new AnonymousIdentity())

      expect(handler).not.toHaveBeenCalled()
      expect(other).toHaveBeenCalledTimes(1)
    })
  })

  describe("agent state", () => {
    it("keeps the other registration of a shared handler", async () => {
      const handler = vi.fn()
      const unsubscribeFirst = manager.subscribeAgentState(handler)
      manager.subscribeAgentState(handler)

      unsubscribeFirst()
      await manager.initialize()

      expect(handler).toHaveBeenLastCalledWith(
        expect.objectContaining({ isInitialized: true })
      )
    })

    it("still stops notifying a handler once all its registrations are gone", async () => {
      // Guard: the ordinary single-subscription contract.
      const handler = vi.fn()
      const unsubscribe = manager.subscribeAgentState(handler)

      unsubscribe()
      await manager.initialize()

      expect(handler).not.toHaveBeenCalled()
    })
  })
})
