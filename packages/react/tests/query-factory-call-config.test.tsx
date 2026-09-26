import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient } from "@tanstack/react-query"
import { ActorMethod, CallConfig, HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createQuery, createQueryFactory } from "../src/createQuery.js"
import {
  createSuspenseQuery,
  createSuspenseQueryFactory,
} from "../src/createSuspenseQuery.js"

/**
 * `createQuery`, `createSuspenseQuery` and their factories take `callConfig`,
 * as the query hooks, `createInfiniteQuery` and `createMutation` already did.
 * It reaches the call and the key the way it does in `useActorQuery`, which
 * builds both with `reactor.getQueryOptions`: a query of another ledger of
 * the same interface is sent to that ledger and cached under its canister,
 * apart from the reactor's own. Without it, one reactor could not back query
 * objects for several tokens, and each needed a reactor of its own.
 */

interface LedgerActor {
  icrc1_symbol: ActorMethod<[], string>
  icrc1_balance_of: ActorMethod<[string], bigint>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    icrc1_symbol: IDL.Func([], [IDL.Text], ["query"]),
    icrc1_balance_of: IDL.Func([IDL.Text], [IDL.Nat], ["query"]),
  })

const ICP = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const CKBTC = "mxzaz-hqaaa-aaaar-qaada-cai"
const onCkbtc: CallConfig = { canisterId: CKBTC }

describe("query factories send the query where callConfig says and key it there", () => {
  let queryClient: QueryClient
  let reactor: Reactor<LedgerActor>
  /** The canister each call went to, as `callMethod` resolves it. */
  let calledOn: string[]

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    reactor = new Reactor<LedgerActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "ledger",
      canisterId: ICP,
      idlFactory,
    })
    calledOn = []
    vi.spyOn(reactor, "callMethod").mockImplementation((async ({
      functionName,
      callConfig,
    }: {
      functionName: string
      callConfig?: CallConfig
    }) => {
      const canister = callConfig?.canisterId
        ? String(callConfig.canisterId)
        : reactor.canisterId.toString()
      calledOn.push(canister)
      return functionName === "icrc1_symbol" ? `symbol of ${canister}` : 7n
    }) as never)
  })

  it("createQuery: fetch() calls the override and caches under its canister", async () => {
    const symbol = createQuery(reactor, {
      functionName: "icrc1_symbol",
      callConfig: onCkbtc,
    })

    await expect(symbol.fetch()).resolves.toBe(`symbol of ${CKBTC}`)
    expect(calledOn).toEqual([CKBTC])
    expect(symbol.getQueryKey()[0]).toBe(CKBTC)
    expect(symbol.getCacheData()).toBe(`symbol of ${CKBTC}`)
    // The reactor's own canister has no entry: the two are cached apart.
    expect(
      reactor.getQueryData({ functionName: "icrc1_symbol" })
    ).toBeUndefined()
  })

  it("createQuery: keys exactly as useActorQuery does with the same callConfig", () => {
    const balance = createQuery(reactor, {
      functionName: "icrc1_balance_of",
      args: ["alice"],
      callConfig: onCkbtc,
    })
    const hookKey = reactor.getQueryOptions({
      functionName: "icrc1_balance_of",
      args: ["alice"],
      callConfig: onCkbtc,
    }).queryKey

    expect(balance.getQueryKey()).toEqual(hookKey)
  })

  it("createQuery: prefetch() and useQuery() call the override too", async () => {
    const symbol = createQuery(reactor, {
      functionName: "icrc1_symbol",
      callConfig: onCkbtc,
    })
    await symbol.prefetch()
    expect(calledOn).toEqual([CKBTC])

    await symbol.invalidate()
    const { result } = renderHook(() => symbol.useQuery())
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(`symbol of ${CKBTC}`)
    expect(calledOn).toEqual([CKBTC, CKBTC])
  })

  it("createQuery: an agent override is keyed apart from the manager's agent", async () => {
    const otherAgent = HttpAgent.createSync({ host: "https://icp-api.io" })
    const viaOther = createQuery(reactor, {
      functionName: "icrc1_symbol",
      callConfig: { agent: otherAgent },
    })
    const viaManager = createQuery(reactor, { functionName: "icrc1_symbol" })

    expect(viaOther.getQueryKey()).not.toEqual(viaManager.getQueryKey())
    expect(viaOther.getQueryKey()).toEqual(
      reactor.generateQueryKey(
        { functionName: "icrc1_symbol" },
        { agent: otherAgent }
      )
    )
  })

  it("createSuspenseQuery: fetch() calls the override and caches under its canister", async () => {
    const symbol = createSuspenseQuery(reactor, {
      functionName: "icrc1_symbol",
      callConfig: onCkbtc,
    })

    await expect(symbol.fetch()).resolves.toBe(`symbol of ${CKBTC}`)
    expect(calledOn).toEqual([CKBTC])
    expect(symbol.getQueryKey()[0]).toBe(CKBTC)
    expect(symbol.getCacheData()).toBe(`symbol of ${CKBTC}`)
  })

  it("createQueryFactory: every instance and the factory's prefix sit at the override", async () => {
    const getBalance = createQueryFactory(reactor, {
      functionName: "icrc1_balance_of",
      callConfig: onCkbtc,
    })

    await getBalance(["alice"]).fetch()
    expect(calledOn).toEqual([CKBTC])
    expect(getBalance(["alice"]).getQueryKey()[0]).toBe(CKBTC)
    expect(getBalance.getQueryKey()).toEqual([CKBTC, "icrc1_balance_of"])

    // The factory's invalidate() reaches the entries it made.
    await getBalance.invalidate()
    const entry = queryClient
      .getQueryCache()
      .find({ queryKey: getBalance(["alice"]).getQueryKey(), exact: true })
    expect(entry?.state.isInvalidated).toBe(true)
  })

  it("createSuspenseQueryFactory: every instance and the factory's prefix sit at the override", async () => {
    const getBalance = createSuspenseQueryFactory(reactor, {
      functionName: "icrc1_balance_of",
      callConfig: onCkbtc,
    })

    await getBalance(["bob"]).fetch()
    expect(calledOn).toEqual([CKBTC])
    expect(getBalance(["bob"]).getQueryKey()[0]).toBe(CKBTC)
    expect(getBalance.getQueryKey()).toEqual([CKBTC, "icrc1_balance_of"])
  })

  it("without callConfig, the reactor's own canister is used as before", async () => {
    const symbol = createQuery(reactor, { functionName: "icrc1_symbol" })
    await symbol.fetch()
    expect(calledOn).toEqual([ICP])
    expect(symbol.getQueryKey()).toEqual([ICP, "icrc1_symbol"])
  })
})
