import { describe, it, expect, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"

/** The reactor's own ledger, and a second one reached through callConfig. */
const TOKEN_A = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const TOKEN_B = "mc6ru-gyaaa-aaaar-qaaaq-cai"

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    icrc1_name: IDL.Func([], [IDL.Text], ["query"]),
    icrc1_balance_of: IDL.Func([IDL.Text], [IDL.Nat], ["query"]),
  })

/**
 * `Reactor.invalidateQueries(params?, callConfig?)` takes a `callConfig`, and
 * its `params` are typed `Partial`, so a call with no `functionName` compiles.
 * Without a `functionName` it did one of two wrong things:
 *
 * - `params` omitted: it invalidated `[this.canisterId]` and ignored
 *   `callConfig.canisterId`, so refreshing a canister reached through an
 *   override refreshed the reactor's default canister instead;
 * - `params` present: it built `[canisterId, undefined, ...]`, which TanStack's
 *   prefix match compares segment by segment, so it matched nothing at all.
 *
 * Either way the caller's data stayed stale with no error.
 */
describe("Reactor.invalidateQueries scope", () => {
  let queryClient: QueryClient
  let reactor: Reactor

  const seed = (canisterId: string) => {
    const nameKey = reactor.generateQueryKey(
      { functionName: "icrc1_name" as never },
      { canisterId }
    )
    const balanceKey = reactor.generateQueryKey(
      { functionName: "icrc1_balance_of" as never, args: ["me"] as never },
      { canisterId }
    )
    queryClient.setQueryData(nameKey, `name of ${canisterId}`)
    queryClient.setQueryData(balanceKey, 1n)
    return [nameKey, balanceKey]
  }

  const invalidated = (key: readonly unknown[]) =>
    queryClient.getQueryState(key)?.isInvalidated

  beforeEach(() => {
    queryClient = new QueryClient()
    reactor = new Reactor({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "ledger",
      canisterId: TOKEN_A,
      idlFactory,
    })
  })

  it("invalidates the canister a callConfig override names", async () => {
    const own = seed(TOKEN_A)
    const other = seed(TOKEN_B)

    await reactor.invalidateQueries(undefined, { canisterId: TOKEN_B })

    for (const key of other) expect(invalidated(key)).toBe(true)
    for (const key of own) expect(invalidated(key)).toBe(false)
  })

  it("invalidates the whole canister for params without a functionName", async () => {
    const own = seed(TOKEN_A)

    await reactor.invalidateQueries({})

    for (const key of own) expect(invalidated(key)).toBe(true)
  })

  it("does the same for an override canister", async () => {
    const own = seed(TOKEN_A)
    const other = seed(TOKEN_B)

    await reactor.invalidateQueries({}, { canisterId: TOKEN_B })

    for (const key of other) expect(invalidated(key)).toBe(true)
    for (const key of own) expect(invalidated(key)).toBe(false)
  })

  it("still scopes to one method when a functionName is given", async () => {
    // Guard: the method-scoped form keeps working and stays narrow.
    const [nameKey, balanceKey] = seed(TOKEN_B)

    await reactor.invalidateQueries(
      { functionName: "icrc1_balance_of" as never },
      { canisterId: TOKEN_B }
    )

    expect(invalidated(balanceKey)).toBe(true)
    expect(invalidated(nameKey)).toBe(false)
  })

  it("still invalidates the reactor's own canister with no arguments", async () => {
    // Guard: the documented no-argument form is unchanged.
    const own = seed(TOKEN_A)
    const other = seed(TOKEN_B)

    await reactor.invalidateQueries()

    for (const key of own) expect(invalidated(key)).toBe(true)
    for (const key of other) expect(invalidated(key)).toBe(false)
  })
})
