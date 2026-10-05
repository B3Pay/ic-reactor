/**
 * Type tests for which reads of `client.queryOptions()` keep `SkipToken` in
 * their `queryFn` type. `pnpm typecheck` compiles this file; nothing here
 * runs.
 *
 * The builder returns `queryFn: skipToken` whenever the value in place of the
 * variables is `skipToken`, whatever the method. So the options may leave
 * `SkipToken` out of `queryFn` only when the variables' type cannot hold
 * `skipToken`: when it is not assignable to them. `useSuspenseQuery` takes
 * those options, and refuses every other. The variables here are what
 * `candid-core-cli gen` writes for `fixtures/skippable.did`, one method per
 * shape `skipToken` might be assignable to, and one written by hand (`{}`, an
 * empty record as other generators write it). The refusals under a suspense
 * read are traps in `traps.test-d.ts`.
 */
import { skipToken, type SkipToken } from "@tanstack/query-core"
import { expectTypeOf } from "vitest"
import { createClient, type Canister } from "../src/index.js"
import type { VarsOf } from "../src/types.js"
import * as skippable from "./fixtures/skippable.js"

const client = createClient({ network: "ic", identity: "anonymous" })
const service = client.canister<skippable.Actor>(skippable.actor, {
  id: "rrkah-fqaaa-aaaaa-aaaaq-cai",
})
type Actor = skippable.Actor

/** What the options' `queryFn` may be besides the query function. */
type SkipOf<O extends { readonly queryFn: unknown }> = Extract<
  O["queryFn"],
  SkipToken
>
/** Whether `skipToken` is assignable to the variables of `M`. */
type TakesSkip<A, M extends keyof A> = [SkipToken] extends [VarsOf<A, M>]
  ? true
  : false

// ---------------------------------------------------------------------------
// What the generator writes for each shape, and whether skipToken fits it
// ---------------------------------------------------------------------------

// `record {}` is `Record<string, never>`, which a symbol is not.
expectTypeOf<VarsOf<Actor, "empty_record">>().toEqualTypeOf<
  Record<string, never>
>()
expectTypeOf<TakesSkip<Actor, "empty_record">>().toEqualTypeOf<false>()
// A record of opts alone has every field, each `T | null`.
expectTypeOf<VarsOf<Actor, "only_opts">>().toEqualTypeOf<{
  limit: bigint | null
  prefix: string | null
}>()
expectTypeOf<TakesSkip<Actor, "only_opts">>().toEqualTypeOf<false>()
expectTypeOf<VarsOf<Actor, "maybe_nat">>().toEqualTypeOf<bigint | null>()
expectTypeOf<TakesSkip<Actor, "maybe_nat">>().toEqualTypeOf<false>()
expectTypeOf<VarsOf<Actor, "nothing_at_all">>().toEqualTypeOf<null>()
expectTypeOf<TakesSkip<Actor, "nothing_at_all">>().toEqualTypeOf<false>()
expectTypeOf<VarsOf<Actor, "no_args">>().toEqualTypeOf<void>()
expectTypeOf<TakesSkip<Actor, "no_args">>().toEqualTypeOf<false>()
// `reserved` is `unknown`, which `skipToken` is too.
expectTypeOf<VarsOf<Actor, "anything">>().toEqualTypeOf<unknown>()
expectTypeOf<TakesSkip<Actor, "anything">>().toEqualTypeOf<true>()

// An empty record written `{}`, which `skipToken` is assignable to.
type Braces = { braces: (arg: {}) => Promise<bigint> }
declare const braces: Canister<Braces>
expectTypeOf<TakesSkip<Braces, "braces">>().toEqualTypeOf<true>()

// ---------------------------------------------------------------------------
// skipToken: the options keep SkipToken, whatever the variables' type
// ---------------------------------------------------------------------------

export const skipped = [
  client.queryOptions(service, "empty_record", skipToken),
  client.queryOptions(service, "only_opts", skipToken),
  client.queryOptions(service, "maybe_nat", skipToken),
  client.queryOptions(service, "anything", skipToken),
  client.queryOptions(service, "nothing_at_all", skipToken),
  client.queryOptions(service, "no_args", skipToken),
  client.queryOptions(braces, "braces", skipToken),
] as const
expectTypeOf<SkipOf<(typeof skipped)[0]>>().toEqualTypeOf<SkipToken>()
expectTypeOf<SkipOf<(typeof skipped)[1]>>().toEqualTypeOf<SkipToken>()
expectTypeOf<SkipOf<(typeof skipped)[2]>>().toEqualTypeOf<SkipToken>()
expectTypeOf<SkipOf<(typeof skipped)[3]>>().toEqualTypeOf<SkipToken>()
expectTypeOf<SkipOf<(typeof skipped)[4]>>().toEqualTypeOf<SkipToken>()
expectTypeOf<SkipOf<(typeof skipped)[5]>>().toEqualTypeOf<SkipToken>()
expectTypeOf<SkipOf<(typeof skipped)[6]>>().toEqualTypeOf<SkipToken>()

// ---------------------------------------------------------------------------
// A value: SkipToken goes, unless skipToken is assignable to the variables
// ---------------------------------------------------------------------------

export const read = [
  client.queryOptions(service, "empty_record", {}),
  client.queryOptions(service, "only_opts", { limit: null, prefix: "a" }),
  client.queryOptions(service, "maybe_nat", 1n),
  client.queryOptions(service, "maybe_nat", null),
  client.queryOptions(service, "nothing_at_all", null),
  client.queryOptions(service, "no_args"),
  client.queryOptions(service, "no_args", undefined),
] as const
expectTypeOf<SkipOf<(typeof read)[0]>>().toBeNever()
expectTypeOf<SkipOf<(typeof read)[1]>>().toBeNever()
expectTypeOf<SkipOf<(typeof read)[2]>>().toBeNever()
expectTypeOf<SkipOf<(typeof read)[3]>>().toBeNever()
expectTypeOf<SkipOf<(typeof read)[4]>>().toBeNever()
expectTypeOf<SkipOf<(typeof read)[5]>>().toBeNever()
expectTypeOf<SkipOf<(typeof read)[6]>>().toBeNever()

// A type that `skipToken` is assignable to cannot tell a value from it, so
// every read of such a method keeps SkipToken, with a value too. The builder
// returns a query function for these two, which their type cannot promise.
export const readOfTakesSkip = [
  client.queryOptions(service, "anything", 1n),
  client.queryOptions(braces, "braces", {}),
] as const
expectTypeOf<SkipOf<(typeof readOfTakesSkip)[0]>>().toEqualTypeOf<SkipToken>()
expectTypeOf<SkipOf<(typeof readOfTakesSkip)[1]>>().toEqualTypeOf<SkipToken>()

// The variables of an empty record still refuse anything but `{}`, and the
// excess-property check of the narrow call still holds.
// @ts-expect-error an empty record has no fields
client.queryOptions(service, "empty_record", { extra: 1 })
// @ts-expect-error Options has no field `limt`; it is `limit`
client.queryOptions(service, "only_opts", { limt: null, prefix: null })
