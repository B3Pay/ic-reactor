import { describe, it, expect, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import type { Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { ClientManager } from "../src/client.js"
import type { AgentState } from "../src/types/client.js"

/**
 * `ClientManager` tells its identity and agent-state subscribers about a change
 * after it has made it: `updateAgent` has already put the new identity on the
 * agent, `initializeAgent` has already recorded the new state. Two things went
 * wrong in the loop that tells them.
 *
 * A subscriber that threw ended the loop, so every subscriber after it never
 * heard about a sign-in or sign-out the agent had already applied.
 *
 * A subscriber may also make a newer change from inside its callback: sign out
 * a principal it does not accept, or retry an initialization that failed. That
 * nested change told every subscriber about itself, and then the outer loop
 * went on delivering its older value to the subscribers after the one that
 * made it, so they were left holding a value that was no longer current.
 */

const mainnetManager = () =>
  new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: "https://icp-api.io" },
  })

const localManager = () => {
  const manager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: "http://127.0.0.1:4943" },
  })
  const fetchRootKey = vi.spyOn(manager.agent, "fetchRootKey")
  return { manager, fetchRootKey }
}

const principalOf = (identity: Identity) => identity.getPrincipal().toText()

describe("identity subscribers", () => {
  it("all hear the new identity when one of them throws", async () => {
    const manager = mainnetManager()
    const heard: string[] = []
    manager.subscribe(() => {
      throw new Error("subscriber failed")
    })
    manager.subscribe((identity) => heard.push(principalOf(identity)))
    const user = Ed25519KeyIdentity.generate()

    // The caller still learns about the failure.
    expect(() => manager.updateAgent(user)).toThrow("subscriber failed")

    // The agent signs as the new identity, so everyone must know about it.
    expect((await manager.agent.getPrincipal()).toText()).toBe(
      principalOf(user)
    )
    expect(heard).toEqual([principalOf(user)])
  })

  it("end on the identity the agent holds when one of them switches it again", async () => {
    // A guard that signs out any principal it does not accept, registered
    // before a subscriber that tracks the current principal.
    const manager = mainnetManager()
    const anonymous = new AnonymousIdentity()
    manager.subscribe((identity) => {
      if (!identity.getPrincipal().isAnonymous()) {
        manager.updateAgent(anonymous)
      }
    })
    const heard: string[] = []
    manager.subscribe((identity) => heard.push(principalOf(identity)))

    manager.updateAgent(Ed25519KeyIdentity.generate())

    const current = (await manager.agent.getPrincipal()).toText()
    expect(current).toBe(principalOf(anonymous))
    expect(heard[heard.length - 1]).toBe(current)
  })

  it("rethrows the first error when several throw", () => {
    // Guard: one error reaches the caller, and it is the first one raised.
    const manager = mainnetManager()
    manager.subscribe(() => {
      throw new Error("first")
    })
    manager.subscribe(() => {
      throw new Error("second")
    })

    expect(() => manager.updateAgent(Ed25519KeyIdentity.generate())).toThrow(
      "first"
    )
  })

  it("are called in the order they subscribed, and a new one waits for the next change", () => {
    // Guard: what did not change about the notification loop.
    const manager = mainnetManager()
    const calls: string[] = []
    let added = false
    manager.subscribe(() => {
      calls.push("a")
      if (!added) {
        added = true
        manager.subscribe(() => calls.push("c"))
      }
    })
    manager.subscribe(() => calls.push("b"))

    manager.updateAgent(Ed25519KeyIdentity.generate())
    expect(calls).toEqual(["a", "b"])

    manager.updateAgent(Ed25519KeyIdentity.generate())
    expect(calls).toEqual(["a", "b", "a", "b", "c"])
  })
})

describe("agent-state subscribers", () => {
  it("all hear that initialization started when one of them throws", async () => {
    const { manager, fetchRootKey } = localManager()
    fetchRootKey.mockResolvedValue(new Uint8Array(133))
    let thrown = false
    manager.subscribeAgentState(() => {
      if (thrown) return
      thrown = true
      throw new Error("subscriber failed")
    })
    const heard: boolean[] = []
    manager.subscribeAgentState((state) => heard.push(state.isInitializing))

    await manager.initializeAgent().catch(() => undefined)

    expect(heard[0]).toBe(true)
  })

  it("end on the current state when one of them retries a failed initialization", async () => {
    const { manager, fetchRootKey } = localManager()
    let finishRetry: (rootKey: Uint8Array) => void = () => undefined
    fetchRootKey
      .mockRejectedValueOnce(new Error("replica not running"))
      .mockReturnValueOnce(
        new Promise<Uint8Array>((resolve) => {
          finishRetry = resolve
        })
      )
    let retry: Promise<void> | undefined
    manager.subscribeAgentState((state) => {
      if (state.error && !retry) retry = manager.initializeAgent()
    })
    const heard: AgentState[] = []
    manager.subscribeAgentState((state) => heard.push(state))

    await expect(manager.initializeAgent()).rejects.toThrow(
      "replica not running"
    )

    // The retry is running, and the last thing the second subscriber heard
    // has to say so, not that initialization failed.
    expect(manager.agentState).toMatchObject({
      isInitializing: true,
      error: undefined,
    })
    expect(heard[heard.length - 1]).toBe(manager.agentState)

    finishRetry(new Uint8Array(133))
    await retry
    expect(heard[heard.length - 1]).toMatchObject({
      isInitialized: true,
      isInitializing: false,
      error: undefined,
    })
  })
})
