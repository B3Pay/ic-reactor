import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ transfer: IDL.Func([], [IDL.Nat], []) })

/**
 * An update call that outlives the sync-call window polls with the identity it
 * submitted under. `updateAgent` mutates the shared agent in place — on purpose,
 * so retained Actors, `addTransform` and an in-flight `initializeAgent()` all
 * keep working — so the pinning has to happen per call instead: the identity is
 * captured at submit and passed back on the read_state.
 */
describe("per-call identity pinning", () => {
  let clientManager: ClientManager

  beforeEach(() => {
    clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
  })

  describe("the shared agent keeps its identity contract", () => {
    it("keeps one agent instance across an identity change", () => {
      // Anything holding `clientManager.agent` — an SDK Actor built during app
      // setup, for instance — must follow the identity, not be stranded on the
      // one it captured at construction.
      const before = clientManager.agent

      clientManager.updateAgent(Ed25519KeyIdentity.generate())

      expect(clientManager.agent).toBe(before)
    })

    it("moves the retained reference onto the new identity", async () => {
      const retained = clientManager.agent
      const next = Ed25519KeyIdentity.generate()

      clientManager.updateAgent(next)

      expect((await retained.getPrincipal()).toText()).toBe(
        next.getPrincipal().toText()
      )
    })

    it("exposes the installed identity for callers to capture", () => {
      const next = Ed25519KeyIdentity.generate()
      clientManager.updateAgent(next)

      expect(clientManager.identity).toBe(next)
    })

    it("reports the anonymous identity after a sign-out", async () => {
      clientManager.updateAgent(Ed25519KeyIdentity.generate())
      clientManager.updateAgent(new AnonymousIdentity())

      expect((await clientManager.agent.getPrincipal()).isAnonymous()).toBe(
        true
      )
    })
  })

  describe("the call pins the identity that submitted it", () => {
    it("passes the submitting identity to agent.call", async () => {
      const submitter = Ed25519KeyIdentity.generate()
      clientManager.updateAgent(submitter)

      const call = vi
        .spyOn(clientManager.agent, "call")
        .mockRejectedValue(new Error("stop after submit"))

      const reactor = new Reactor({
        clientManager,
        name: "ledger",
        canisterId: CANISTER_ID,
        idlFactory,
      })

      await reactor
        .callMethod({ functionName: "transfer" as never })
        .catch(() => undefined)

      expect(call).toHaveBeenCalledTimes(1)
      // Third argument is the per-call identity the SDK signs with.
      expect(call.mock.calls[0][2]).toBe(submitter)
    })

    it("still pins after the identity has changed underneath", async () => {
      const first = Ed25519KeyIdentity.generate()
      clientManager.updateAgent(first)

      const reactor = new Reactor({
        clientManager,
        name: "ledger",
        canisterId: CANISTER_ID,
        idlFactory,
      })

      const second = Ed25519KeyIdentity.generate()
      clientManager.updateAgent(second)

      const call = vi
        .spyOn(clientManager.agent, "call")
        .mockRejectedValue(new Error("stop after submit"))

      await reactor
        .callMethod({ functionName: "transfer" as never })
        .catch(() => undefined)

      // A call submitted now must use the identity installed now.
      expect(call.mock.calls[0][2]).toBe(second)
    })

    it("defers to a callConfig-supplied agent instead of pinning", async () => {
      clientManager.updateAgent(Ed25519KeyIdentity.generate())
      const custom = {
        call: vi.fn().mockRejectedValue(new Error("stop after submit")),
      }

      const reactor = new Reactor({
        clientManager,
        name: "ledger",
        canisterId: CANISTER_ID,
        idlFactory,
      })

      await reactor
        .callMethod({
          functionName: "transfer" as never,
          callConfig: { agent: custom as never },
        })
        .catch(() => undefined)

      // The caller brought their own agent; its own identity governs.
      expect(custom.call.mock.calls[0][2]).toBeUndefined()
    })
  })
})
