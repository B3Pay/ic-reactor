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
  const maybe = client.queryOptions(ledger, "icrc1_balance_of", maybeAccount)
  // @ts-expect-error a suspense read cannot be skipped; read it with useQuery
  const skipped = useSuspenseQuery(maybe)
  const none = client.queryOptions(ledger, "icrc1_fee", skipToken)
  // @ts-expect-error skipToken is for useQuery
  const skippedMany = useSuspenseQueries({ queries: [none] })

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
  const none = useQuery(client.queryOptions(ledger, "icrc1_fee", skipToken))
  expectTypeOf(none.data).toEqualTypeOf<bigint | undefined>()
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
