import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, skipToken } from "@tanstack/react-query"
import { ActorMethod, CallConfig } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createActorHooks } from "../src/createActorHooks.js"
import { createQueryFactory } from "../src/createQuery.js"

/**
 * A query whose args are not known yet (an account before sign-in, a
 * selection not made) had no honest way to wait: the docs and examples built
 * placeholder args, a non-null assertion or an `as any` cast, and turned the
 * query off with `enabled`. The non-suspense query hooks and
 * createQueryFactory now take TanStack Query's `skipToken` in place of args.
 * A skipped query does not call the canister, waits in an entry of its own
 * under its method's key (the prefix of the key its args will give it), and
 * fetches as usual once real args arrive.
 */

interface LedgerActor {
  icrc1_balance_of: ActorMethod<[string], bigint>
  get_blocks: ActorMethod<[{ owner: string; start: bigint }], string[]>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    icrc1_balance_of: IDL.Func([IDL.Text], [IDL.Nat], ["query"]),
    get_blocks: IDL.Func(
      [IDL.Record({ owner: IDL.Text, start: IDL.Nat })],
      [IDL.Vec(IDL.Text)],
      ["query"]
    ),
  })

const LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const CKBTC = "mxzaz-hqaaa-aaaar-qaada-cai"

describe("skipToken in place of args", () => {
  let queryClient: QueryClient
  let reactor: Reactor<LedgerActor>
  let calls: { functionName: string; args: unknown; canister: string }[]

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
      canisterId: LEDGER,
      idlFactory,
    })
    calls = []
    vi.spyOn(reactor, "callMethod").mockImplementation((async ({
      functionName,
      args,
      callConfig,
    }: {
      functionName: string
      args: unknown
      callConfig?: CallConfig
    }) => {
      calls.push({
        functionName,
        args,
        canister: String(callConfig?.canisterId ?? reactor.canisterId),
      })
      return functionName === "icrc1_balance_of" ? 42n : ["block"]
    }) as never)
  })

  /** Keys of every query in the cache. */
  const cachedKeys = () =>
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey)

  /**
   * The key of a skipped query: `prefix`, the method's key, and one segment
   * more, so it sits under the method without being any call's key.
   */
  const expectSkippedKeyUnder = (
    key: readonly unknown[],
    prefix: readonly unknown[]
  ) => {
    expect(key).toHaveLength(prefix.length + 1)
    expect(key.slice(0, prefix.length)).toEqual(prefix)
  }

  describe("useActorQuery", () => {
    it("waits without calling the canister, under the method's key", async () => {
      const { useActorQuery } = createActorHooks(reactor)
      const { result } = renderHook(() =>
        useActorQuery({
          functionName: "icrc1_balance_of",
          args: skipToken,
          // A custom key follows the args, so the skipped key leaves it out.
          queryKey: ["mine"],
        })
      )

      // Give a fetch every chance to start.
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(calls).toEqual([])
      expect(result.current.fetchStatus).toBe("idle")
      expect(result.current.data).toBeUndefined()
      expect(cachedKeys()).toHaveLength(1)
      expectSkippedKeyUnder(cachedKeys()[0], [LEDGER, "icrc1_balance_of"])
    })

    it("fetches once args arrive, under a key its skipped key prefixes", async () => {
      const { useActorQuery } = createActorHooks(reactor)
      const { result, rerender } = renderHook(
        ({ owner }: { owner?: string }) =>
          useActorQuery({
            functionName: "icrc1_balance_of",
            args: owner ? [owner] : skipToken,
          }),
        { initialProps: {} as { owner?: string } }
      )
      expect(calls).toEqual([])

      rerender({ owner: "alice" })
      await waitFor(() => expect(result.current.data).toBe(42n))
      expect(calls).toEqual([
        { functionName: "icrc1_balance_of", args: ["alice"], canister: LEDGER },
      ])

      const skippedKey = reactor.generateQueryKey({
        functionName: "icrc1_balance_of",
      })
      const realKey = reactor.generateQueryKey({
        functionName: "icrc1_balance_of",
        args: ["alice"],
      })
      expect(realKey.slice(0, skippedKey.length)).toEqual(skippedKey)
      expect(queryClient.getQueryData(realKey)).toBe(42n)

      // Back to waiting: nothing more is called.
      rerender({})
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(calls).toHaveLength(1)
    })

    it("stays idle when its method is invalidated", async () => {
      const { useActorQuery } = createActorHooks(reactor)
      renderHook(() =>
        useActorQuery({ functionName: "icrc1_balance_of", args: skipToken })
      )

      await act(() =>
        reactor.invalidateQueries({ functionName: "icrc1_balance_of" })
      )
      expect(calls).toEqual([])
    })

    it("is keyed at the canister its callConfig names", async () => {
      const { useActorQuery } = createActorHooks(reactor)
      renderHook(() =>
        useActorQuery({
          functionName: "icrc1_balance_of",
          args: skipToken,
          callConfig: { canisterId: CKBTC },
        })
      )
      await waitFor(() => expect(cachedKeys()).toHaveLength(1))
      expectSkippedKeyUnder(cachedKeys()[0], [CKBTC, "icrc1_balance_of"])
      expect(calls).toEqual([])
    })
  })

  describe("useActorInfiniteQuery", () => {
    const pages = {
      functionName: "get_blocks" as const,
      initialPageParam: 0n,
      getNextPageParam: () => undefined,
      queryKey: ["history"],
    }

    it("waits while getArgs is skipToken, then fetches its first page", async () => {
      const { useActorInfiniteQuery } = createActorHooks(reactor)
      const { result, rerender } = renderHook(
        ({ owner }: { owner?: string }) =>
          useActorInfiniteQuery({
            ...pages,
            getArgs: owner
              ? (start: bigint) =>
                  [{ owner, start }] as [{ owner: string; start: bigint }]
              : skipToken,
          }),
        { initialProps: {} as { owner?: string } }
      )

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(calls).toEqual([])
      expect(result.current.fetchStatus).toBe("idle")
      // Under the method and the custom key: the prefix of the key its args
      // give.
      const prefix = reactor.generateQueryKey({
        functionName: "get_blocks",
        queryKey: ["history"],
      })
      expect(cachedKeys()).toHaveLength(1)
      expectSkippedKeyUnder(cachedKeys()[0], prefix)
      const skippedKey = cachedKeys()[0]

      rerender({ owner: "alice" })
      await waitFor(() =>
        expect(result.current.data?.pages).toEqual([["block"]])
      )
      expect(calls).toEqual([
        {
          functionName: "get_blocks",
          args: [{ owner: "alice", start: 0n }],
          canister: LEDGER,
        },
      ])
      const realKey = cachedKeys().find(
        (key) => JSON.stringify(key) !== JSON.stringify(skippedKey)
      )!
      expect(realKey.slice(0, prefix.length)).toEqual(prefix)
    })
  })

  describe("createQueryFactory", () => {
    it("returns a query with only useQuery, the same one each time", () => {
      const getBalance = createQueryFactory(reactor, {
        functionName: "icrc1_balance_of",
      })
      const skipped = getBalance(skipToken)

      expect(Object.keys(skipped)).toEqual(["useQuery"])
      expect(getBalance(skipToken)).toBe(skipped)
    })

    it("waits under the factory's prefix, then fetches once args arrive", async () => {
      const getBalance = createQueryFactory(reactor, {
        functionName: "icrc1_balance_of",
        select: (balance) => balance.toString(),
      })
      const { result, rerender } = renderHook(
        ({ owner }: { owner?: string }) =>
          getBalance(owner ? [owner] : skipToken).useQuery(),
        { initialProps: {} as { owner?: string } }
      )

      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(calls).toEqual([])
      expect(result.current.fetchStatus).toBe("idle")
      expect(cachedKeys()).toHaveLength(1)
      expectSkippedKeyUnder(cachedKeys()[0], getBalance.getQueryKey())

      rerender({ owner: "bob" })
      await waitFor(() => expect(result.current.data).toBe("42"))
      expect(calls).toEqual([
        { functionName: "icrc1_balance_of", args: ["bob"], canister: LEDGER },
      ])
      expect(getBalance(["bob"]).getCacheData()).toBe("42")
    })

    it("keys a skipped query at the canister the config's callConfig names", async () => {
      const getBalance = createQueryFactory(reactor, {
        functionName: "icrc1_balance_of",
        callConfig: { canisterId: CKBTC },
      })
      renderHook(() => getBalance(skipToken).useQuery())

      await waitFor(() => expect(cachedKeys()).toHaveLength(1))
      expectSkippedKeyUnder(cachedKeys()[0], [CKBTC, "icrc1_balance_of"])
      expect(getBalance.getQueryKey()).toEqual([CKBTC, "icrc1_balance_of"])
      expect(calls).toEqual([])
    })
  })
})
