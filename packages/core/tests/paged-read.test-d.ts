/**
 * Type tests for a read walked through its pages,
 * `client.queryOptions(canister, method, firstVars, { pages })`. `pnpm
 * typecheck` compiles this file; nothing here runs.
 */
import { skipToken, type SkipToken } from "@tanstack/query-core"
import { expectTypeOf } from "vitest"
import { createClient } from "../src/index.js"
import type { CanisterQueryOptions } from "../src/types.js"
import * as archive from "./fixtures/archive.js"
import * as shapes from "./fixtures/shapes.js"

const client = createClient({ network: "ic", identity: "anonymous" })
const ledger = client.canister<archive.Actor>(archive.actor, {
  id: "qoctq-giaaa-aaaaa-aaaea-cai",
})
const service = client.canister<shapes.Actor>(shapes.actor, {
  id: "rrkah-fqaaa-aaaaa-aaaaq-cai",
})
const first: archive.GetBlocksArgs = { start: 0n, length: 2n }

// `pages` is given one page and the variables it was asked for with, and the
// data is the list of pages.
const walk = client.queryOptions(ledger, "get_blocks", first, {
  pages: (page, vars) => {
    expectTypeOf(page).toEqualTypeOf<archive.GetBlocksResponse>()
    expectTypeOf(vars).toEqualTypeOf<archive.GetBlocksArgs>()
    return page.blocks.length === 0 ? undefined : vars
  },
})
expectTypeOf(walk).toEqualTypeOf<
  CanisterQueryOptions<archive.GetBlocksResponse[], never, never>
>()

// The read of the first page alone is what it was.
expectTypeOf(client.queryOptions(ledger, "get_blocks", first)).toEqualTypeOf<
  CanisterQueryOptions<archive.GetBlocksResponse, never, never>
>()

// Several arguments are the tuple, in `pages` as in the variables.
const tuple = client.queryOptions(service, "pair", [1n, "a"], {
  pages: (page, vars) => {
    expectTypeOf(page).toEqualTypeOf<shapes.Pair>()
    expectTypeOf(vars).toEqualTypeOf<[bigint, string]>()
    return undefined
  },
})
expectTypeOf(tuple).toEqualTypeOf<
  CanisterQueryOptions<shapes.Pair[], never, never>
>()

// A page of a method that returns a result is its `ok` value, and the read's
// error holds its `err`.
const unwrapped = client.queryOptions(service, "outcome", 0n, {
  pages: (page) => {
    expectTypeOf(page).toEqualTypeOf<bigint>()
    return page
  },
})
expectTypeOf(unwrapped).toEqualTypeOf<
  CanisterQueryOptions<bigint[], string, never>
>()

// Variables that may be skipToken keep SkipToken in the query function.
declare const later: archive.GetBlocksArgs | SkipToken
const skipped = client.queryOptions(ledger, "get_blocks", later, {
  pages: () => undefined,
})
expectTypeOf(skipped).toEqualTypeOf<
  CanisterQueryOptions<archive.GetBlocksResponse[], never>
>()
expectTypeOf(
  client.queryOptions(ledger, "get_blocks", skipToken, {
    pages: () => undefined,
  })
).toEqualTypeOf<CanisterQueryOptions<archive.GetBlocksResponse[], never>>()

// What `pages` returns is the method's variables, or undefined.
client.queryOptions(ledger, "get_blocks", first, {
  // @ts-expect-error a cursor alone is not the variables of get_blocks
  pages: (page) => page.first_index,
})
// The builder's own type is still its last signature's, the opt-in read.
expectTypeOf<
  ReturnType<typeof client.queryOptions<archive.Actor, "get_blocks">>
>().toEqualTypeOf<CanisterQueryOptions<archive.GetBlocksResponse, never>>()
