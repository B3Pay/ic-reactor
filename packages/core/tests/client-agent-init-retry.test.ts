import { describe, it, expect, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { ClientManager } from "../src/client.js"
import type { AgentState } from "../src/types/client.js"

/**
 * `initializeAgent` records a failed attempt in `agentState.error` and clears
 * its promise so the caller can try again. A later attempt that succeeded set
 * `isInitialized` but never cleared `error`, so the state read "initialized"
 * and "failed" at once for the rest of the session.
 *
 * The documented `useAgentState` pattern renders an error screen whenever
 * `error` is set. With the stale error, an app whose first attempt failed
 * (a local replica not yet started, a dropped connection) stayed on that error
 * screen after a retry connected. `AuthenticationManager` in
 * @ic-reactor/react clears its own `error` when a new attempt starts.
 */

const LOCAL_HOST = "http://127.0.0.1:4943"

const makeLocalManager = () => {
  const manager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: LOCAL_HOST },
  })
  // A local agent fetches the replica's root key during initialization.
  const fetchRootKey = vi.spyOn(manager.agent, "fetchRootKey")
  return { manager, fetchRootKey }
}

describe("ClientManager.initializeAgent retry", () => {
  it("clears the previous attempt's error once a retry succeeds", async () => {
    const { manager, fetchRootKey } = makeLocalManager()
    fetchRootKey
      .mockRejectedValueOnce(new Error("replica not running"))
      .mockResolvedValueOnce(new Uint8Array(133))

    await expect(manager.initializeAgent()).rejects.toThrow(
      "replica not running"
    )
    expect(manager.agentState.error?.message).toBe("replica not running")

    await manager.initializeAgent()

    expect(manager.agentState).toMatchObject({
      isInitialized: true,
      isInitializing: false,
      error: undefined,
    })
  })

  it("tells subscribers the recovered state has no error", async () => {
    const { manager, fetchRootKey } = makeLocalManager()
    fetchRootKey
      .mockRejectedValueOnce(new Error("replica not running"))
      .mockResolvedValueOnce(new Uint8Array(133))
    const states: AgentState[] = []
    manager.subscribeAgentState((state) => states.push(state))

    await manager.initializeAgent().catch(() => undefined)
    await manager.initialize()

    expect(states[states.length - 1]).toMatchObject({
      isInitialized: true,
      error: undefined,
    })
  })

  describe("when an agent-state subscriber throws", () => {
    // The attempt announced itself (`isInitializing: true`) before entering
    // its try block, so a subscriber that threw on that notification rejected
    // the attempt with `isInitializing` left true and the rejected promise
    // kept. Every later call returned that same rejected promise, so one
    // exception from app code left the manager uninitializable for good, the
    // root key was never fetched, and a UI gated on `isInitializing` spun
    // forever.
    const throwingOnce = () => {
      let thrown = false
      return () => {
        if (thrown) return
        thrown = true
        throw new Error("subscriber failed")
      }
    }

    it("reports the failure without leaving the attempt in progress", async () => {
      const { manager } = makeLocalManager()
      manager.subscribeAgentState(throwingOnce())

      await expect(manager.initializeAgent()).rejects.toThrow(
        "subscriber failed"
      )

      expect(manager.agentState.isInitializing).toBe(false)
    })

    it("lets a later attempt initialize the agent", async () => {
      const { manager, fetchRootKey } = makeLocalManager()
      fetchRootKey.mockResolvedValue(new Uint8Array(133))
      manager.subscribeAgentState(throwingOnce())

      await manager.initializeAgent().catch(() => undefined)
      await manager.initializeAgent()

      expect(fetchRootKey).toHaveBeenCalledTimes(1)
      expect(manager.agentState).toMatchObject({
        isInitialized: true,
        isInitializing: false,
        error: undefined,
      })
    })
  })

  it("still reports the error of an attempt that fails", async () => {
    // Guards against over-reach: clearing must not hide a real failure.
    const { manager, fetchRootKey } = makeLocalManager()
    fetchRootKey
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))

    await manager.initializeAgent().catch(() => undefined)
    await manager.initializeAgent().catch(() => undefined)

    expect(manager.agentState).toMatchObject({
      isInitialized: false,
      isInitializing: false,
    })
    expect(manager.agentState.error?.message).toBe("second")
  })
})
