import { describe, it, expect, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { ClientManager } from "../src/client.js"

/**
 * An update call that outlives the sync-call window polls with the agent it
 * captured at submit time. `updateAgent` used to call `replaceIdentity` on the
 * shared instance, so that captured object changed underneath the poll: the
 * read_state got signed by the new identity and the replica answered 403 for a
 * call that had already committed on chain.
 */
describe("ClientManager.updateAgent — agent instance pinning", () => {
  let clientManager: ClientManager

  beforeEach(() => {
    clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
  })

  it("hands out a new agent instance rather than mutating the old one", () => {
    const submitting = clientManager.agent

    clientManager.updateAgent(Ed25519KeyIdentity.generate())

    expect(clientManager.agent).not.toBe(submitting)
  })

  it("leaves the captured agent on the identity that submitted with it", async () => {
    // What an in-flight call holds.
    const captured = clientManager.agent
    const before = await captured.getPrincipal()

    const next = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(next)

    expect((await captured.getPrincipal()).toText()).toBe(before.toText())
    expect((await clientManager.agent.getPrincipal()).toText()).toBe(
      next.getPrincipal().toText()
    )
  })

  it("carries the agent configuration across", () => {
    const before = clientManager.agent.config

    clientManager.updateAgent(Ed25519KeyIdentity.generate())
    const after = clientManager.agent.config

    expect(clientManager.agent.host.toString()).toBe("https://icp-api.io/")
    expect(after.verifyQuerySignatures).toBe(before.verifyQuerySignatures)
  })

  it("preserves the root key, which local replicas depend on", () => {
    // A key obtained by fetchRootKey() lives on the instance; recreating the
    // agent without carrying it over would break certificate verification on a
    // local replica or custom testnet.
    const fetched = Uint8Array.from({ length: 133 }, (_, i) => i % 251)
    ;(clientManager.agent as unknown as { rootKey: Uint8Array }).rootKey =
      fetched

    clientManager.updateAgent(Ed25519KeyIdentity.generate())

    expect(clientManager.agent.rootKey).toEqual(fetched)
  })

  it("still reports the new identity through getUserPrincipal", async () => {
    const next = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(next)

    expect((await clientManager.getUserPrincipal()).toText()).toBe(
      next.getPrincipal().toText()
    )
  })

  it("works for a sign-out back to the anonymous identity", async () => {
    clientManager.updateAgent(Ed25519KeyIdentity.generate())
    const signedIn = clientManager.agent

    clientManager.updateAgent(new AnonymousIdentity())

    expect(clientManager.agent).not.toBe(signedIn)
    expect((await clientManager.agent.getPrincipal()).isAnonymous()).toBe(true)
  })
})
