/**
 * Calls that succeed on the real replica: a query, an update and its
 * invalidation, a certified read, and the root key the client fetches from the
 * local replica (Q4).
 */
import { createClient, isReactorError } from "@ic-reactor/core"
import { MutationObserver } from "@tanstack/react-query"
import { afterEach, describe, expect, it } from "vitest"
import { actor, type Actor } from "./declarations/hello_actor"
import { ANONYMOUS, ed25519, network, replica, target } from "./replica"

const clients: { dispose(): void }[] = []
const track = <C extends { dispose(): void }>(client: C): C => {
  clients.push(client)
  return client
}
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose()
})

describe("calls on the local replica", () => {
  it("a query answers, through its options and directly, without replicated execution", async () => {
    const client = track(createClient({ network, identity: "anonymous" }))
    const hello = client.canister<Actor>(actor, target)

    await expect(hello.greet("World")).resolves.toBe("Hello, World!")

    const options = client.queryOptions(hello, "greet", "Query")
    // The network, the caller, the canister, the method, then the encoded
    // arguments.
    expect(options.queryKey.slice(0, 5)).toEqual([
      "ic-reactor",
      replica.host,
      ANONYMOUS,
      replica.canisterId,
      "greet",
    ])
    expect(options.queryKey).toEqual(client.queryKey(hello, "greet", "Query"))
    await expect(client.queryClient.fetchQuery(options)).resolves.toBe(
      "Hello, Query!"
    )

    // The canister itself says the call went out as a query, not as an
    // update call: one that sent queries as updates would still greet.
    await expect(hello.is_replicated()).resolves.toBe(false)
  })

  it("an update changes state, and its mutation invalidates the canister's reads", async () => {
    const client = track(createClient({ network, identity: ed25519() }))
    const hello = client.canister<Actor>(actor, target)

    const countOptions = client.queryOptions(hello, "count")
    const before = await client.queryClient.fetchQuery(countOptions)
    expect(typeof before).toBe("bigint")
    expect(
      client.queryClient.getQueryState(countOptions.queryKey)
    ).toMatchObject({ status: "success", isInvalidated: false })

    const increment = new MutationObserver(
      client.queryClient,
      client.mutationOptions(hello, "increment")
    )
    await expect(increment.mutate()).resolves.toBe(before + 1n)

    // The cached count is stale now, and a direct read sees the write.
    expect(
      client.queryClient.getQueryState(countOptions.queryKey)
    ).toMatchObject({ isInvalidated: true })
    await expect(hello.count()).resolves.toBe(before + 1n)
  })

  it("a certified canister sends its queries as update calls, under keys of their own (Q19)", async () => {
    const client = track(createClient({ network, identity: "anonymous" }))
    const plain = client.canister<Actor>(actor, target)
    const certified = client.canister<Actor>(actor, {
      id: replica.canisterId,
      certified: true,
    })

    await expect(certified.greet("Certified")).resolves.toBe(
      "Hello, Certified!"
    )
    // Replicated execution: the reply came back certified by the subnet,
    // where a plain query is answered by one replica.
    await expect(certified.is_replicated()).resolves.toBe(true)
    await expect(plain.is_replicated()).resolves.toBe(false)

    const key = client.queryKey(certified, "greet", "Certified")
    expect(key.at(-1)).toBe("certified")
    expect(key).not.toEqual(client.queryKey(plain, "greet", "Certified"))
    await expect(
      client.queryClient.fetchQuery(
        client.queryOptions(certified, "is_replicated")
      )
    ).resolves.toBe(true)
  })

  it("fetches the root key from the local replica, and verifies replies with it (Q4)", async () => {
    // No rootKey: the host is local, so the client asks the replica for its
    // key, and the certified reply verifies against it.
    const fetched = track(createClient({ network, identity: ed25519() }))
    const hello = fetched.canister<Actor>(actor, {
      id: replica.canisterId,
      certified: true,
    })
    await expect(hello.greet("root key")).resolves.toBe("Hello, root key!")
    await expect(hello.increment_by(1n)).resolves.toEqual(expect.any(BigInt))

    // The same replica without the fetch: the agent checks the certificate
    // against mainnet's key, and the read fails. So the check above is real.
    const unfetched = track(
      createClient({
        network: { host: replica.host, fetchRootKey: false },
        identity: "anonymous",
      })
    )
    const error = await unfetched
      .canister<Actor>(actor, { id: replica.canisterId, certified: true })
      .greet("mainnet key")
      .then(
        () => undefined,
        (e: unknown) => e
      )
    expect(isReactorError(error)).toBe(true)
  })
})
