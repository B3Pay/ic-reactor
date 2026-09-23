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

/** Holds the next root-key fetch open; the returned function completes it. */
const holdRootKey = (
  fetchRootKey: ReturnType<typeof makeLocalManager>["fetchRootKey"]
) => {
  let finish: (rootKey: Uint8Array) => void = () => undefined
  fetchRootKey.mockReturnValueOnce(
    new Promise<Uint8Array>((resolve) => {
      finish = resolve
    })
  )
  return () => finish(new Uint8Array(133))
}

/** How `promise` stands once the work already queued has run. */
const settlementOf = (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(
      () => "resolved",
      (error: Error) => `rejected: ${error.message}`
    ),
    new Promise((resolve) => setTimeout(resolve, 0, "pending")),
  ])

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

    it("lets a retry started from the failure keep its own attempt", async () => {
      // A subscriber that retries on the error state runs INSIDE the failed
      // attempt, before that attempt has returned. The failed attempt's
      // promise was stored only once it returned, on top of the retry's, so a
      // caller arriving while the retry fetched the root key saw
      // `isInitializing` and was handed the old rejection instead of the retry.
      const { manager, fetchRootKey } = makeLocalManager()
      const finishRootKey = holdRootKey(fetchRootKey)
      manager.subscribeAgentState(throwingOnce())
      let retry: Promise<void> | undefined
      manager.subscribeAgentState((state) => {
        if (state.error && !retry) retry = manager.initializeAgent()
      })

      await expect(manager.initializeAgent()).rejects.toThrow(
        "subscriber failed"
      )
      expect(retry).toBeDefined()
      // The failed attempt finished after the retry began; it left the
      // retry's state alone.
      expect(manager.agentState).toMatchObject({
        isInitializing: true,
        error: undefined,
      })

      const joined = manager.initializeAgent()
      expect(await settlementOf(joined)).toBe("pending")

      finishRootKey()
      await expect(joined).resolves.toBeUndefined()
      await expect(retry).resolves.toBeUndefined()
      expect(fetchRootKey).toHaveBeenCalledTimes(1)
      expect(manager.agentState).toMatchObject({
        isInitialized: true,
        isInitializing: false,
        error: undefined,
      })
    })

    describe("on the 'initialized' notification", () => {
      // The fix above covers a throw when the attempt starts. A throw when it
      // finishes failed the attempt too, but only after `isInitialized` had
      // been recorded, and the failure left it standing next to the error.
      // Every later call then returned at once on `isInitialized`, so nothing
      // ever cleared the error: a UI that shows `error` stayed on its error
      // screen for the rest of the session.
      const throwingOnceInitialized = () => {
        let thrown = false
        return (state: AgentState) => {
          if (thrown || !state.isInitialized) return
          thrown = true
          throw new Error("subscriber failed")
        }
      }

      it("does not report the agent initialized after the attempt failed", async () => {
        const { manager, fetchRootKey } = makeLocalManager()
        fetchRootKey.mockResolvedValue(new Uint8Array(133))
        manager.subscribeAgentState(throwingOnceInitialized())

        await expect(manager.initializeAgent()).rejects.toThrow(
          "subscriber failed"
        )

        expect(manager.agentState).toMatchObject({
          isInitialized: false,
          isInitializing: false,
        })
        expect(manager.agentState.error?.message).toBe("subscriber failed")
      })

      it("lets a later attempt initialize the agent and clear the error", async () => {
        const { manager, fetchRootKey } = makeLocalManager()
        fetchRootKey.mockResolvedValue(new Uint8Array(133))
        manager.subscribeAgentState(throwingOnceInitialized())

        await manager.initializeAgent().catch(() => undefined)
        await manager.initializeAgent()

        expect(manager.agentState).toMatchObject({
          isInitialized: true,
          isInitializing: false,
          error: undefined,
        })
      })
    })
  })

  it("makes a subscriber that calls in on 'initializing' wait for that attempt", async () => {
    // The attempt announces itself synchronously, and its promise was stored
    // only after that announcement. A subscriber calling back in from it found
    // `isInitializing` set but nothing to join, so its call resolved at once,
    // before the root key had been fetched.
    const { manager, fetchRootKey } = makeLocalManager()
    const finishRootKey = holdRootKey(fetchRootKey)
    const joined: Promise<void>[] = []
    manager.subscribeAgentState((state) => {
      if (state.isInitializing && joined.length === 0) {
        joined.push(manager.initializeAgent())
      }
    })

    const first = manager.initializeAgent()
    expect(joined).toHaveLength(1)
    expect(await settlementOf(joined[0])).toBe("pending")

    finishRootKey()
    await expect(first).resolves.toBeUndefined()
    await expect(joined[0]).resolves.toBeUndefined()
    expect(fetchRootKey).toHaveBeenCalledTimes(1)
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
