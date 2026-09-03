import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { LookupPathStatus } from "@icp-sdk/core/agent"
import type { Agent, PollingOptions } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { pinPollingIdentity } from "../src/utils/agent.js"

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const REQUEST_ID = new Uint8Array(32).fill(7)

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ transfer: IDL.Func([], [IDL.Nat], []) })

/** What the boundary node answers when a call outlives the sync-call window. */
const accepted = () => ({
  requestId: REQUEST_ID,
  response: {
    ok: true,
    status: 202,
    statusText: "Accepted",
    body: null,
    headers: [],
  },
})

/** A verified certificate with no request_status entry yet: the poll goes on. */
const stillPending = () => ({
  certificate: new Uint8Array(),
  verifiedCertificate: {
    lookup_path: () => ({ status: LookupPathStatus.Absent }),
  },
})

/** No delay between polls. */
const pollingOptions: PollingOptions = { strategy: async () => {} }

interface SignedReadState {
  body: {
    content: {
      request_type: string
      sender: Principal
      paths: Uint8Array[][]
    }
    sender_pubkey: Uint8Array
  }
}

const senderOf = (request: unknown) =>
  (request as SignedReadState).body.content.sender.toText()

/**
 * `Reactor.executeCall` captures the identity that submits an update call and
 * hands it to the poll loop, so a sign-in or sign-out mid-poll cannot re-sign
 * the request_status read for a call that has already committed. The replica
 * only lets the original sender read request_status, so a read signed by anyone
 * else is a 403, and a committed transfer surfaces as a failure.
 *
 * `HttpAgent.readState` ignores its identity parameter and signs with whatever
 * the agent holds; the only thing it sends as given is a pre-signed request.
 * These tests therefore look at the request each poll actually sends.
 */
describe("poll-time identity pinning", () => {
  let clientManager: ClientManager
  let submitter: Ed25519KeyIdentity
  let next: Ed25519KeyIdentity

  const reactor = (options: PollingOptions = pollingOptions) =>
    new Reactor({
      clientManager,
      name: "ledger",
      canisterId: CANISTER_ID,
      idlFactory,
      pollingOptions: options,
    })

  beforeEach(() => {
    clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
    submitter = Ed25519KeyIdentity.generate()
    next = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(submitter)
    vi.spyOn(clientManager.agent, "call").mockResolvedValue(accepted() as never)
  })

  it("signs every poll with the submitting identity across a sign-in mid-poll", async () => {
    const readState = vi
      .spyOn(clientManager.agent, "readState")
      // The first poll finds nothing yet, and the user signs in as someone
      // else while it is in flight.
      .mockImplementationOnce(async () => {
        clientManager.updateAgent(next)
        return stillPending() as never
      })
      .mockRejectedValueOnce(new Error("stop after the second poll"))

    await reactor()
      .callMethod({ functionName: "transfer" as never })
      .catch(() => undefined)

    expect(readState).toHaveBeenCalledTimes(2)
    const [first, second] = readState.mock.calls.map((call) => call[3])
    expect(senderOf(first)).toBe(submitter.getPrincipal().toText())
    expect(senderOf(second)).toBe(submitter.getPrincipal().toText())
    // The agent itself has moved on; only the in-flight call stayed pinned.
    expect((await clientManager.agent.getPrincipal()).toText()).toBe(
      next.getPrincipal().toText()
    )
  })

  it("re-signs each poll for the submitted call's request_status path", async () => {
    const readState = vi
      .spyOn(clientManager.agent, "readState")
      .mockResolvedValueOnce(stillPending() as never)
      .mockRejectedValueOnce(new Error("stop after the second poll"))

    await reactor()
      .callMethod({ functionName: "transfer" as never })
      .catch(() => undefined)

    const [first, second] = readState.mock.calls.map(
      (call) => call[3] as SignedReadState
    )
    // A fresh request per poll, so each carries its own ingress expiry.
    expect(first).not.toBe(second)
    for (const request of [first, second]) {
      expect(request.body.content.request_type).toBe("read_state")
      expect(request.body.sender_pubkey).toEqual(
        submitter.getPublicKey().toDer()
      )
      const [[label, requestId]] = request.body.content.paths
      expect(new TextDecoder().decode(label)).toBe("request_status")
      expect(requestId).toEqual(REQUEST_ID)
    }
  })

  it("leaves a callConfig-supplied agent to sign with its own identity", async () => {
    // Guards against over-reach: the caller brought their own agent, and
    // nothing is pinned for it, so its polls are invoked exactly as before.
    const custom = {
      call: vi.fn().mockResolvedValue(accepted()),
      readState: vi
        .fn()
        .mockRejectedValue(new Error("stop after the first poll")),
      createReadStateRequest: vi.fn(),
    }

    await reactor()
      .callMethod({
        functionName: "transfer" as never,
        callConfig: { agent: custom as unknown as Agent },
      })
      .catch(() => undefined)

    expect(custom.readState).toHaveBeenCalledTimes(1)
    expect(custom.readState.mock.calls[0][3]).toBeUndefined()
    expect(custom.createReadStateRequest).not.toHaveBeenCalled()
  })

  /**
   * `pollForResponse` with `preSignReadStateRequest: true` builds its request
   * through `createReadStateRequest` on the agent it was handed, passing no
   * identity, and then sends it as the `request` argument on every poll. The
   * SDK's own validator on that path rejects every `HttpAgent` request in
   * 6.1.0 (it looks for `toHash` as an own property of the expiry, which is a
   * prototype method), so it is exercised here at the wrapper, not end to end.
   */
  describe("the pinned agent's request builder", () => {
    const requestStatus = () => ({
      paths: [[new TextEncoder().encode("request_status"), REQUEST_ID]],
    })

    it("signs with the submitting identity when handed none", async () => {
      clientManager.updateAgent(next)
      const pinned = pinPollingIdentity(clientManager.agent, submitter)

      // Runs the real builder against the real agent: a prototype delegate
      // that let it run with the delegate as `this` would throw on the
      // agent's private fields.
      const request = await pinned.createReadStateRequest!(
        requestStatus(),
        undefined
      )

      expect(senderOf(request)).toBe(submitter.getPrincipal().toText())
    })

    it("lets an identity the caller names win over the pin", async () => {
      const pinned = pinPollingIdentity(clientManager.agent, submitter)

      const request = await pinned.createReadStateRequest!(
        requestStatus(),
        next
      )

      expect(senderOf(request)).toBe(next.getPrincipal().toText())
    })

    it("sends a request it is handed as given, without re-signing it", async () => {
      // Guards against over-reach: a request the caller signed themselves is
      // theirs, and `pollForResponse` reuses one across polls.
      const theirs = await clientManager.agent.createReadStateRequest(
        requestStatus(),
        next
      )
      const readState = vi
        .spyOn(clientManager.agent, "readState")
        .mockRejectedValue(new Error("stop"))
      const pinned = pinPollingIdentity(clientManager.agent, submitter)

      await pinned
        .readState(
          { canisterId: CANISTER_ID },
          requestStatus(),
          undefined,
          theirs
        )
        .catch(() => undefined)

      expect(readState.mock.calls[0][3]).toBe(theirs)
    })
  })
})
