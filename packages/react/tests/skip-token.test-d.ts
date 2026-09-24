/**
 * `skipToken` type-checks in place of args where TanStack Query can run a
 * query without them, `args: account ? [account] : skipToken` needs no `!`,
 * placeholder or cast, and the suspense variants refuse it: TanStack Query
 * cannot suspend on a query that cannot run.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type {
  InfiniteData,
  SkipToken as TanstackSkipToken,
} from "@tanstack/react-query"
import type { DisplayReactor, Reactor } from "@ic-reactor/core"
import {
  createActorHooks,
  createQuery,
  createQueryFactory,
  createSuspenseQuery,
  createSuspenseQueryFactory,
  skipToken,
  useReactorInfiniteQuery,
  useReactorQuery,
  useReactorSuspenseInfiniteQuery,
  useReactorSuspenseQuery,
  type QueryFactoryFn,
  type SkipToken,
  type SkippedQuery,
} from "../src/index.js"

interface Account {
  owner: string
}

interface Service {
  icrc1_balance_of: ActorMethod<[Account], bigint>
  get_blocks: ActorMethod<[{ start: bigint }], string[]>
}

declare const reactor: Reactor<Service>
declare const display: DisplayReactor<Service>
declare const account: Account | undefined

const hooks = createActorHooks(reactor)

describe("the non-suspense hooks take skipToken in place of args", () => {
  it("useActorQuery, with the data type unchanged", () => {
    const { data } = hooks.useActorQuery({
      functionName: "icrc1_balance_of",
      args: account ? [account] : skipToken,
    })
    expectTypeOf(data).toEqualTypeOf<bigint | undefined>()

    const { data: text } = hooks.useActorQuery({
      functionName: "icrc1_balance_of",
      args: account ? [account] : skipToken,
      select: (balance) => balance.toString(),
    })
    expectTypeOf(text).toEqualTypeOf<string | undefined>()
  })

  it("still checks the args skipToken stands in for", () => {
    hooks.useActorQuery({
      functionName: "icrc1_balance_of",
      // @ts-expect-error owner is a string
      args: account ? [{ owner: 1 }] : skipToken,
    })
  })

  it("useActorQuery of a DisplayReactor", () => {
    const { useActorQuery } = createActorHooks(display)
    const { data } = useActorQuery({
      functionName: "icrc1_balance_of",
      args: account ? [account] : skipToken,
    })
    expectTypeOf(data).toEqualTypeOf<string | undefined>()
  })

  it("useReactorQuery, the hook that takes the reactor", () => {
    const { data } = useReactorQuery({
      reactor,
      functionName: "icrc1_balance_of",
      args: account ? [account] : skipToken,
    })
    expectTypeOf(data).toEqualTypeOf<bigint | undefined>()
  })

  it("useActorInfiniteQuery and useReactorInfiniteQuery, as getArgs", () => {
    const { data } = hooks.useActorInfiniteQuery({
      functionName: "get_blocks",
      getArgs: account ? (start: bigint) => [{ start }] : skipToken,
      initialPageParam: 0n,
      getNextPageParam: () => undefined,
    })
    expectTypeOf(data).toEqualTypeOf<
      InfiniteData<string[], bigint> | undefined
    >()

    useReactorInfiniteQuery({
      reactor,
      functionName: "get_blocks",
      getArgs: skipToken,
      initialPageParam: 0n,
      getNextPageParam: () => undefined,
    })
  })
})

describe("createQueryFactory takes skipToken in place of args", () => {
  const getBalance = createQueryFactory(reactor, {
    functionName: "icrc1_balance_of",
  })
  const query = getBalance([{ owner: "alice" }])

  it("returns the full query object for args", () => {
    expectTypeOf(query.fetch()).toEqualTypeOf<Promise<bigint>>()
  })

  it("returns only useQuery for skipToken", () => {
    const skipped = getBalance(skipToken)
    expectTypeOf(skipped).toEqualTypeOf<SkippedQuery<typeof query>>()
    // @ts-expect-error nothing to fetch until the args are known
    void skipped.fetch()
    // @ts-expect-error nor an entry to invalidate
    void skipped.invalidate()
  })

  it("lets useQuery be called on args-or-skipToken directly", () => {
    const maybe = getBalance(account ? [account] : skipToken)
    expectTypeOf(maybe.useQuery).toEqualTypeOf<typeof query.useQuery>()

    const { data } = maybe.useQuery()
    expectTypeOf(data).toEqualTypeOf<bigint | undefined>()

    const { data: text } = maybe.useQuery({
      select: (balance) => balance.toString(),
    })
    expectTypeOf(text).toEqualTypeOf<string | undefined>()

    // @ts-expect-error the skipped query has no fetch: check the args first
    void maybe.fetch()
  })

  it("keeps the factory's type as it was for ReturnType, Parameters and inference", () => {
    // TypeScript reads these off the last call signature, so skipToken's
    // signatures must not widen them.
    expectTypeOf<ReturnType<typeof getBalance>>().toEqualTypeOf<typeof query>()
    expectTypeOf<Parameters<typeof getBalance>[0]>().toEqualTypeOf<[Account]>()

    // A helper written against QueryFactoryFn before skipToken existed
    const fetchWith = <A, Q extends { fetch: () => Promise<unknown> }>(
      factory: QueryFactoryFn<A, Q>,
      args: A
    ): Q => factory(args)
    expectTypeOf(fetchWith(getBalance, [{ owner: "alice" }])).toEqualTypeOf<
      typeof query
    >()
  })
})

describe("the suspense variants refuse skipToken", () => {
  it("useActorSuspenseQuery and useReactorSuspenseQuery", () => {
    hooks.useActorSuspenseQuery({
      functionName: "icrc1_balance_of",
      // @ts-expect-error a suspense query cannot wait on skipToken
      args: skipToken,
    })
    useReactorSuspenseQuery({
      reactor,
      functionName: "icrc1_balance_of",
      // @ts-expect-error a suspense query cannot wait on skipToken
      args: skipToken,
    })
  })

  it("useActorSuspenseInfiniteQuery and useReactorSuspenseInfiniteQuery", () => {
    hooks.useActorSuspenseInfiniteQuery({
      functionName: "get_blocks",
      // @ts-expect-error a suspense query cannot wait on skipToken
      getArgs: skipToken,
      initialPageParam: 0n,
      getNextPageParam: () => undefined,
    })
    useReactorSuspenseInfiniteQuery({
      reactor,
      functionName: "get_blocks",
      // @ts-expect-error a suspense query cannot wait on skipToken
      getArgs: skipToken,
      initialPageParam: 0n,
      getNextPageParam: () => undefined,
    })
  })

  it("createSuspenseQueryFactory", () => {
    const getBalance = createSuspenseQueryFactory(reactor, {
      functionName: "icrc1_balance_of",
    })
    // @ts-expect-error a suspense query cannot wait on skipToken
    getBalance(skipToken)
  })

  it("createQuery and createSuspenseQuery, whose args are fixed", () => {
    createQuery(reactor, {
      functionName: "icrc1_balance_of",
      // @ts-expect-error a query object's args are known when it is made
      args: skipToken,
    })
    createSuspenseQuery(reactor, {
      functionName: "icrc1_balance_of",
      // @ts-expect-error a query object's args are known when it is made
      args: skipToken,
    })
  })
})

describe("the re-export", () => {
  it("is TanStack Query's skipToken", () => {
    expectTypeOf(skipToken).toEqualTypeOf<TanstackSkipToken>()
    expectTypeOf<SkipToken>().toEqualTypeOf<TanstackSkipToken>()
  })
})
