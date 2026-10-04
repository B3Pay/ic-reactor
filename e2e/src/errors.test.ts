/**
 * Failures on the real replica, as `ReactorError`s: a reject 4 from
 * `ic0.msg_reject`, a trap (reject 5), the `Err` arm of a Result (Q7), an
 * anonymous write refused before sending, and a `{ name }` with no id.
 */
import { createClient } from "@ic-reactor/core"
import { afterEach, describe, expect, it } from "vitest"
import { actor, type Actor } from "./declarations/hello_actor"
import { ANONYMOUS, ed25519, network, rejection, target } from "./replica"

const clients: { dispose(): void }[] = []
const signedIn = () => {
  const client = createClient({ network, identity: ed25519() })
  clients.push(client)
  return client
}
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose()
})

describe("failures on the local replica", () => {
  it("a reject from ic0.msg_reject is `rejected` with code 4, and the update may have executed", async () => {
    const hello = signedIn().canister<Actor>(actor, target)

    const error = await rejection(hello.refuse())
    expect(error).toMatchObject({
      name: "ReactorError",
      kind: "rejected",
      rejectCode: 4,
      mayHaveExecuted: true,
      method: "refuse",
      canisterId: target.id,
    })
    expect(error.message).toContain("refused: this method always rejects")
  })

  it("a trap is `rejected` with code 5, and the update may have executed", async () => {
    const hello = signedIn().canister<Actor>(actor, target)

    const error = await rejection(hello.boom())
    expect(error).toMatchObject({
      kind: "rejected",
      rejectCode: 5,
      mayHaveExecuted: true,
      method: "boom",
    })
    expect(error.message).toContain("boom: this method always traps")
  })

  it("a Result resolves with its `Ok` value and rejects `canister_err` with its `Err` value, which did not leave the outcome open (Q7)", async () => {
    const hello = signedIn().canister<Actor>(actor, target)

    const ok = await hello.increment_by(2n)
    expect(typeof ok).toBe("bigint")

    const error = await rejection(hello.increment_by(0n))
    expect(error).toMatchObject({
      kind: "canister_err",
      err: "by must be positive",
      mayHaveExecuted: false,
      method: "increment_by",
    })
    expect(error.rejectCode).toBeUndefined()
    // The Err arm changed nothing.
    await expect(hello.count()).resolves.toBe(ok)
  })

  it("an anonymous write is refused before it is sent", async () => {
    const client = createClient({ network, identity: "anonymous" })
    clients.push(client)
    const hello = client.canister<Actor>(actor, target)
    expect(client.caller()).toBe(ANONYMOUS)

    const before = await hello.count()
    const error = await rejection(hello.increment())
    expect(error).toMatchObject({
      kind: "unauthenticated",
      code: "anonymous_write",
      mayHaveExecuted: false,
      method: "increment",
    })
    // The replica takes anonymous updates: had the call gone out, the
    // counter would have moved.
    await expect(hello.count()).resolves.toBe(before)
  })

  it("an unresolved `{ name }` target rejects `invalid_args` (canister_id_unresolved)", async () => {
    const client = createClient({ network, identity: ed25519() })
    clients.push(client)
    // This page is local and so is the replica, so the ic_env cookie is
    // trusted, and it has no entry for this name.
    const missing = client.canister<Actor>(actor, { name: "not_deployed" })

    for (const call of [
      () => missing.greet("nobody"),
      () => missing.increment(),
    ]) {
      const error = await rejection(call())
      expect(error).toMatchObject({
        kind: "invalid_args",
        code: "canister_id_unresolved",
        mayHaveExecuted: false,
      })
      expect(error.message).toContain("not_deployed")
    }
  })
})
