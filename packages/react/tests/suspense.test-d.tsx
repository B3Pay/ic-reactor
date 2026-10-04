/**
 * Type tests for the options of `client.queryOptions()` as TanStack Query's
 * React hooks take them, compiled by `pnpm typecheck` and never run.
 * `useSuspenseQuery` and `useSuspenseQueries` take no `skipToken` for
 * `queryFn`, so options built from variables that cannot be `skipToken` must
 * carry none, and need no cast. Options built from variables that may be
 * `skipToken` keep it, and the suspense hooks refuse them, here and as a trap
 * of `packages/core/tests/traps.test-d.ts` that `pnpm verify:traps` proves.
 */
import type { Principal } from "@candid-core/schema"
import type { Canister, Client, ReactorError } from "@ic-reactor/core"
import {
  QueryClient,
  skipToken,
  useQueries,
  useQuery,
  useSuspenseQueries,
  useSuspenseQuery,
  type SkipToken,
} from "@tanstack/react-query"
import { expectTypeOf } from "vitest"

type Account = { owner: Principal; subaccount: Uint8Array | null }
/** What a generated module's `Actor` type looks like, cut down. */
type Ledger = {
  icrc1_fee: () => Promise<bigint>
  icrc1_balance_of: (account: Account) => Promise<bigint>
  icrc1_name: () => Promise<string>
  outcome: (
    n: bigint
  ) => Promise<{ tag: "Ok"; value: bigint } | { tag: "Err"; value: string }>
  pair: (left: bigint, right: string) => Promise<string>
  /** A Candid `reserved` argument, which a generated module types `unknown`. */
  anything: (value: unknown) => Promise<bigint>
}

declare const client: Client
declare const ledger: Canister<Ledger>
declare const account: Account
declare const maybeAccount: Account | SkipToken
declare const queryClient: QueryClient

export function SuspenseReads() {
  // A method without arguments, called without variables.
  const fee = useSuspenseQuery(client.queryOptions(ledger, "icrc1_fee"))
  expectTypeOf(fee.data).toEqualTypeOf<bigint>()
  expectTypeOf(fee.error).toEqualTypeOf<ReactorError | null>()

  // ... or with `undefined` in their place.
  const name = useSuspenseQuery(
    client.queryOptions(ledger, "icrc1_name", undefined)
  )
  expectTypeOf(name.data).toEqualTypeOf<string>()

  // Variables whose type does not include SkipToken.
  const balance = useSuspenseQuery(
    client.queryOptions(ledger, "icrc1_balance_of", account)
  )
  expectTypeOf(balance.data).toEqualTypeOf<bigint>()

  // Two arguments, as the tuple.
  const pair = useSuspenseQuery(client.queryOptions(ledger, "pair", [1n, "x"]))
  expectTypeOf(pair.data).toEqualTypeOf<string>()

  // A result read keeps its typed error.
  const outcome = useSuspenseQuery(client.queryOptions(ledger, "outcome", 1n))
  expectTypeOf(outcome.data).toEqualTypeOf<bigint>()
  expectTypeOf(outcome.error).toEqualTypeOf<ReactorError<string> | null>()

  // Several reads at once.
  const [many, total] = useSuspenseQueries({
    queries: [
      client.queryOptions(ledger, "icrc1_fee"),
      client.queryOptions(ledger, "icrc1_balance_of", account),
    ],
  })
  expectTypeOf(many.data).toEqualTypeOf<bigint>()
  expectTypeOf(total.data).toEqualTypeOf<bigint>()

  // Spread, with options of the app's added.
  const spread = useSuspenseQuery({
    ...client.queryOptions(ledger, "icrc1_balance_of", account),
    staleTime: 5_000,
  })
  expectTypeOf(spread.data).toEqualTypeOf<bigint>()

  // Variables that may be skipped: a suspense read cannot wait for them.
  // The two lines below each refusal say it is for SkipToken: without them a
  // refusal for another reason (a retry the hook does not take) would pass.
  const maybe = client.queryOptions(ledger, "icrc1_balance_of", maybeAccount)
  // @ts-expect-error a suspense read cannot be skipped; read it with useQuery
  const skipped = useSuspenseQuery(maybe)
  expectTypeOf<
    Extract<typeof maybe.queryFn, SkipToken>
  >().toEqualTypeOf<SkipToken>()
  useQuery(maybe)
  const none = client.queryOptions(ledger, "icrc1_fee", skipToken)
  // @ts-expect-error skipToken is for useQuery
  const skippedMany = useSuspenseQueries({ queries: [none] })
  expectTypeOf<
    Extract<typeof none.queryFn, SkipToken>
  >().toEqualTypeOf<SkipToken>()
  useQueries({ queries: [none] })

  // A reserved argument is `unknown`, which may hold skipToken whatever its
  // value: such a read keeps SkipToken, and a suspense read of it needs a cast.
  const reserved = client.queryOptions(ledger, "anything", 1n)
  // @ts-expect-error a reserved argument may be skipToken
  const reservedRead = useSuspenseQuery(reserved)
  expectTypeOf<
    Extract<typeof reserved.queryFn, SkipToken>
  >().toEqualTypeOf<SkipToken>()

  return [
    fee,
    name,
    balance,
    pair,
    outcome,
    many,
    total,
    spread,
    skipped,
    skippedMany,
    reservedRead,
  ].length
}

export function Reads() {
  // useQuery takes both: the read that may be skipped and the one that
  // cannot, with the same data and error.
  const skipped = useQuery(
    client.queryOptions(ledger, "icrc1_balance_of", maybeAccount)
  )
  expectTypeOf(skipped.data).toEqualTypeOf<bigint | undefined>()
  expectTypeOf(skipped.error).toEqualTypeOf<ReactorError | null>()
  const read = useQuery(
    client.queryOptions(ledger, "icrc1_balance_of", account)
  )
  expectTypeOf(read.data).toEqualTypeOf<bigint | undefined>()
  expectTypeOf(read.error).toEqualTypeOf<ReactorError | null>()
  const none = useQuery(client.queryOptions(ledger, "icrc1_fee", skipToken))
  expectTypeOf(none.data).toEqualTypeOf<bigint | undefined>()
  expectTypeOf(none.error).toEqualTypeOf<ReactorError | null>()
  // useQueries types each query's error from its throwOnError alone, so the
  // options' retry must take any error.
  const [fee, balance] = useQueries({
    queries: [
      client.queryOptions(ledger, "icrc1_fee"),
      client.queryOptions(ledger, "icrc1_balance_of", maybeAccount),
    ],
  })
  expectTypeOf(fee.data).toEqualTypeOf<bigint | undefined>()
  expectTypeOf(balance.data).toEqualTypeOf<bigint | undefined>()
  return [skipped, read, none, fee, balance].length
}

// The options built from variables that cannot be skipped carry no SkipToken;
// the ones built from variables that may be keep it, as before.
export const certain = client.queryOptions(ledger, "icrc1_balance_of", account)
expectTypeOf<Extract<typeof certain.queryFn, SkipToken>>().toBeNever()
export const maybe = client.queryOptions(
  ledger,
  "icrc1_balance_of",
  maybeAccount
)
expectTypeOf<
  Extract<typeof maybe.queryFn, SkipToken>
>().toEqualTypeOf<SkipToken>()
export const skipped = client.queryOptions(ledger, "icrc1_fee", skipToken)
expectTypeOf<
  Extract<typeof skipped.queryFn, SkipToken>
>().toEqualTypeOf<SkipToken>()

// The key is tagged either way, so getQueryData and fetchQuery are typed.
expectTypeOf(
  queryClient.getQueryData(
    client.queryOptions(ledger, "icrc1_balance_of", account).queryKey
  )
).toEqualTypeOf<bigint | undefined>()
expectTypeOf(
  queryClient.getQueryData(
    client.queryOptions(ledger, "icrc1_balance_of", maybeAccount).queryKey
  )
).toEqualTypeOf<bigint | undefined>()
expectTypeOf(
  queryClient.fetchQuery(client.queryOptions(ledger, "icrc1_fee"))
).toEqualTypeOf<Promise<bigint>>()

// A wrapper of `client.queryOptions` written against the published 4.0.0-beta.1
// types stops compiling where it takes the function's type whole: the
// function has two signatures now, and one function cannot satisfy both, nor
// can `Parameters` (the last signature's) be spread back into the call. The
// forms below are the break the CHANGELOG lists.
// @ts-expect-error a function typed Client["queryOptions"] must satisfy both signatures
export const typedWrapper: Client["queryOptions"] = (c, m, ...rest) =>
  // @ts-expect-error neither signature takes the rest of both
  client.queryOptions(c, m, ...rest)
export const spreadWrapper = (...args: Parameters<Client["queryOptions"]>) =>
  // @ts-expect-error Parameters of an overloaded function is the last signature's, and its rest is not a tuple here
  client.queryOptions(...args)

// What a wrapper still does: the result type, and the options spread with the
// app's own.
export type QueryOptionsResult = ReturnType<Client["queryOptions"]>
expectTypeOf<QueryOptionsResult["queryKey"]>().not.toBeNever()
export const withStaleTime = {
  ...client.queryOptions(ledger, "icrc1_balance_of", account),
  staleTime: 1,
}
expectTypeOf<Extract<typeof withStaleTime.queryFn, SkipToken>>().toBeNever()

// A `retry` written into the options' type takes an error typed `unknown`
// too, as `useQueries` and `useSuspenseQueries` call it, so one whose error
// parameter is annotated `ReactorError<E>` stops compiling: the third break
// the CHANGELOG lists. One annotated `unknown`, or left to the context,
// compiles.
const outcome = client.queryOptions(ledger, "outcome", 1n)
export const annotatedRetry: typeof outcome = {
  ...outcome,
  // @ts-expect-error the options' retry must also take an error typed unknown
  retry: (_n: number, error: ReactorError<string>) => error.kind === "rejected",
}
export const unknownRetry: typeof outcome = {
  ...outcome,
  retry: (_n: number, error: unknown) => error !== null,
}
export const contextualRetry: typeof outcome = {
  ...outcome,
  retry: (n, error) => n < 3 && error !== null,
}
export function RetryOfTheApp() {
  // A `retry` passed to the hook replaces the options' own, and keeps its
  // annotation.
  return useQuery({
    ...outcome,
    retry: (_n: number, error: ReactorError<string>) =>
      error.kind === "rejected",
  })
}
