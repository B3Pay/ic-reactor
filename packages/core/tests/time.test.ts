/**
 * `client.time(canister)`: the IC's certified time, for stamping a
 * deduplication key such as an ICRC-1 `created_at_time` (#876).
 *
 * The fake replica's certificates carry a clock the test sets, far from the
 * host's, so a result that follows the host's clock fails.
 */
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createFakeReplica } from "../src/testing/fake-replica.js"
import { LEDGER, SHAPES, clientAs, serve } from "./canister-helpers.js"
import * as shapes from "./fixtures/shapes.js"
import { icEnvCookie, stubPage } from "./network-helpers.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 2001-09-09T01:46:40.123456789Z: years from the host's clock, with nanoseconds. */
const IC_TIME = 1_000_000_000_123_456_789n

const replicaAt = (now: bigint = IC_TIME) =>
  createFakeReplica({
    canisters: {
      [SHAPES]: serve<shapes.Actor>(shapes.actor, { one: ([n]) => n + 1n }),
    },
    now: () => now,
  })

const shapesOf = (client: ReturnType<typeof clientAs>, id = SHAPES) =>
  client.canister<shapes.Actor>(shapes.actor, { id })

describe("client.time()", () => {
  it("resolves the time the replica certifies, in nanoseconds, not the host's", async () => {
    const replica = replicaAt()
    const client = clientAs(replica, "anonymous")
    await expect(client.time(shapesOf(client))).resolves.toBe(IC_TIME)
    const later = clientAs(replicaAt(IC_TIME + 1n), "anonymous")
    await expect(later.time(shapesOf(later))).resolves.toBe(IC_TIME + 1n)
    // One read_state, addressed to the canister, and nothing else: a host
    // clock years from the IC's does not make the agent re-sync first.
    expect(replica.requests).toEqual([
      expect.objectContaining({ endpoint: "read_state", canisterId: SHAPES }),
    ])
  })

  it("works for a signed-in caller as for an anonymous one", async () => {
    const replica = replicaAt()
    const client = clientAs(replica, Ed25519KeyIdentity.generate())
    await expect(client.time(shapesOf(client))).resolves.toBe(IC_TIME)
  })

  it("rejects not_delivered for a certificate that does not verify, and returns no time", async () => {
    const replica = replicaAt()
    // A client that trusts another network's root key.
    const other = createFakeReplica({})
    const client = clientAs({ ...replica, rootKey: other.rootKey }, "anonymous")
    await expect(client.time(shapesOf(client))).rejects.toMatchObject({
      kind: "not_delivered",
      mayHaveExecuted: false,
      method: "read_state",
      canisterId: SHAPES,
    })
  })

  it("routes by a { name } the cookie resolves, and refuses one it does not, sending nothing", async () => {
    stubPage("http://localhost:5173", {
      cookie: icEnvCookie({ "PUBLIC_CANISTER_ID:backend": SHAPES }),
    })
    const replica = replicaAt()
    const client = clientAs(replica, "anonymous")
    const backend = client.canister<shapes.Actor>(shapes.actor, {
      name: "backend",
    })
    await expect(client.time(backend)).resolves.toBe(IC_TIME)
    const missing = client.canister<shapes.Actor>(shapes.actor, {
      name: "missing",
    })
    const before = replica.requests.length
    await expect(client.time(missing)).rejects.toMatchObject({
      kind: "invalid_args",
      code: "canister_id_unresolved",
      mayHaveExecuted: false,
    })
    expect(replica.requests).toHaveLength(before)
  })

  it("rejects cancelled on a disposed client, sending nothing", async () => {
    const replica = replicaAt()
    const client = clientAs(replica, "anonymous")
    const canister = shapesOf(client, LEDGER)
    client.dispose()
    await expect(client.time(canister)).rejects.toMatchObject({
      kind: "cancelled",
      code: "client_disposed",
      mayHaveExecuted: false,
    })
    expect(replica.requests).toEqual([])
  })

  it("throws a TypeError for anything but a canister of this client", async () => {
    const client = clientAs(replicaAt(), "anonymous")
    const foreign = shapesOf(clientAs(replicaAt(), "anonymous"))
    await expect(client.time(foreign)).rejects.toThrow(TypeError)
    await expect(client.time({} as never)).rejects.toThrow(TypeError)
  })
})
