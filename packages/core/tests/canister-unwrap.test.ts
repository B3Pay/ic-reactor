/**
 * The unwrap rule has two halves that must agree: `Unwrap<R>` decides the type
 * a method resolves with, and `isResultSchema` decides at run time whether the
 * reply is unwrapped (DECISIONS Q7). For every method of the generated
 * fixtures, the table below is checked twice: by the compiler, against what
 * `Unwrap` makes of the generated reply type, and by this test, against what
 * `isResultSchema` makes of the method's result schema.
 */
import { describe, expect, it } from "vitest"
import {
  serviceMethods,
  type Principal,
  type Schema,
} from "@candid-core/schema"
import { isResultSchema } from "@candid-core/schema/validate"
import type { ReplyOf, Unwrap } from "../src/types.js"
import * as archive from "./fixtures/archive.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as management from "./fixtures/management.js"
import * as shapes from "./fixtures/shapes.js"

/** Whether `Unwrap` changes `R`: `true` exactly when it reads `R` as a result. */
type IsUnwrapped<R> = [Unwrap<R>] extends [R]
  ? [R] extends [Unwrap<R>]
    ? false
    : true
  : true

/** For each method of `A`, whether its reply is unwrapped, as the types say. */
type Table<A> = { readonly [K in keyof A]: IsUnwrapped<ReplyOf<A[K]>> }

const icrc1Table: Table<icrc1.Actor> = {
  icrc1_balance_of: false,
  icrc1_decimals: false,
  icrc1_fee: false,
  icrc1_supported_standards: false,
  icrc1_metadata: false,
  icrc1_symbol: false,
  icrc1_minting_account: false,
  icrc1_name: false,
  icrc1_total_supply: false,
  icrc1_transfer: true,
}

const shapesTable: Table<shapes.Actor> = {
  nothing: false,
  one: false,
  many: false,
  small: false,
  pair: false,
  maybe: false,
  bytes: false,
  who: false,
  lookup: false,
  outcome: true,
  composite: false,
  bump: true,
  flag: true,
  three: false,
  note: false,
  fire: false,
  address: false,
}

const archiveTable: Table<archive.Actor> = {
  get_blocks: false,
  notify_hook: false,
}

/** The management interface has no result variant; every row is `false`. */
const managementTable = Object.fromEntries(
  [...serviceMethods(management.actor).keys()].map((name) => [name, false])
) as Table<management.Actor>
const everyManagementReplyIsPlain: { [K in keyof management.Actor]: false } =
  managementTable

/** Whether the run-time rule unwraps each method of `service`. */
const runtime = (service: Schema<Principal>) =>
  Object.fromEntries(
    [...serviceMethods(service).values()].map(({ name, results }) => [
      name,
      results.length === 1 && isResultSchema(results[0]),
    ])
  )

describe("the unwrap rule", () => {
  it.each([
    ["the ICRC-1 ledger", icrc1.actor, icrc1Table],
    ["the shapes service", shapes.actor, shapesTable],
    ["the archived ledger", archive.actor, archiveTable],
    ["the management canister", management.actor, everyManagementReplyIsPlain],
  ] as const)(
    "is the same in the types and at run time for %s",
    (_label, service, table) => {
      expect(runtime(service)).toEqual(table)
    }
  )
})
