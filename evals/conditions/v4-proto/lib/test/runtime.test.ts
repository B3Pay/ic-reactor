// @vitest-environment node
//
// Runtime checks of the prototype itself against the harness's fake replica.
// Not a hidden test: it tests the library, not a solution.
//
//   cd evals/conditions/v4-proto && node node_modules/vitest/vitest.mjs run --config lib/test/vitest.config.mjs
import { afterEach, beforeEach, expect, it } from "vitest"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { QueryClient } from "@tanstack/query-core"
import { actor, type Actor } from "../../starter/src/generated/icrc1"
import { LedgerService } from "../../starter/src/generated/icrc1.service"
import {
  createClient,
  defineService,
  isReactorError,
  principal,
} from "../src/index"
import { createWorld, type World } from "#harness/world"
import { MINTER } from "#harness/fake-ledger"

let world: World
let alice: Ed25519KeyIdentity
beforeEach(() => {
  world = createWorld()
  alice = Ed25519KeyIdentity.generate()
  world.own(alice.getPrincipal().toText())
  world.ledger.setBalance(alice.getPrincipal().toText(), 5_000_000_000n)
})
afterEach(() => world.restore())

const ledgerAs = (identity?: Ed25519KeyIdentity | AnonymousIdentity) =>
  createClient({
    network: { host: world.host, rootKey: world.rootKey, name: "test" },
    identity,
  }).canister(LedgerService, { id: world.ledgerId })

const transferArg = (to: string, amount: bigint) => ({
  to: { owner: principal(to), subaccount: null },
  amount,
  fee: null,
  memo: null,
  from_subaccount: null,
  created_at_time: null,
})

it("defineService refuses a mode map that disagrees with the schema", () => {
  expect(() =>
    defineService<Actor>()(actor, {
      icrc1_balance_of: "update",
      icrc1_decimals: "query",
      icrc1_fee: "query",
      icrc1_metadata: "query",
      icrc1_minting_account: "query",
      icrc1_name: "query",
      icrc1_supported_standards: "query",
      icrc1_symbol: "query",
      icrc1_total_supply: "query",
      icrc1_transfer: "update",
    })
  ).toThrow(/icrc1_balance_of is declared update but the schema says query/)
})

it("keys carry network, caller, canister, method and the encoded args", () => {
  const ledger = ledgerAs(alice)
  const owner = principal(alice.getPrincipal().toText())
  const key = ledger.icrc1_balance_of.queryKey([{ owner, subaccount: null }])
  expect(key.slice(0, 6)).toEqual([
    "ic-reactor",
    "test",
    alice.getPrincipal().toText(),
    world.ledgerId,
    "icrc1_balance_of",
    "query",
  ])
  expect(key[6]).toMatch(/^4449444c/) // hex of "DIDL"
  expect(
    ledgerAs().icrc1_balance_of.queryKey([{ owner, subaccount: null }])[2]
  ).toBe("2vxsx-fae")
})

it("decodes principals in replies to text", async () => {
  const minting = await ledgerAs().icrc1_minting_account([])
  expect(minting).toEqual({ owner: MINTER, subaccount: null })
  expect(typeof minting?.owner).toBe("string")
})

it("reads through queryOptions and certified()", async () => {
  const ledger = ledgerAs(alice)
  const owner = principal(alice.getPrincipal().toText())
  const qc = new QueryClient()
  await expect(
    qc.fetchQuery(
      ledger.icrc1_balance_of.queryOptions([{ owner, subaccount: null }])
    )
  ).resolves.toBe(5_000_000_000n)
  await expect(
    ledger.icrc1_balance_of.certified([{ owner, subaccount: null }])
  ).resolves.toBe(5_000_000_000n)
  expect(world.calls("icrc1_balance_of")).toHaveLength(1) // certified() is a replicated call
})

it("refuses a write from an anonymous caller before sending", async () => {
  const error = await ledgerAs(new AnonymousIdentity())
    .icrc1_transfer([transferArg(alice.getPrincipal().toText(), 1n)])
    .catch((e: unknown) => e)
  expect(isReactorError(error) && error.kind).toBe("unauthenticated")
  expect(world.calls()).toHaveLength(0)
})

it("refuses invalid principal text as invalid_args before sending", async () => {
  const bad = {
    owner: "not-a-principal" as ReturnType<typeof principal>,
    subaccount: null,
  }
  const error = await ledgerAs(alice)
    .icrc1_balance_of([bad])
    .catch((e: unknown) => e)
  expect(isReactorError(error) && error.kind).toBe("invalid_args")
  expect(world.queries()).toHaveLength(0)
})

it("unwraps Err as a typed canister_err", async () => {
  world.ledger.setBalance(alice.getPrincipal().toText(), 5n)
  const error = await ledgerAs(alice)
    .icrc1_transfer([transferArg(MINTER, 1_000n)])
    .catch((e: unknown) => e)
  if (!isReactorError(error)) throw error
  expect(error.kind).toBe("canister_err")
  expect(error.mayHaveExecuted).toBe(false)
  expect(error.err).toEqual({
    tag: "InsufficientFunds",
    value: { balance: 5n },
  })
})

it("classifies rejects by who produced them, and a lost reply as outcome_unknown", async () => {
  // Code 3: rejected by the system, no ledger code ran.
  world.ledger.rejectTransfersWith = 3
  const missing = await ledgerAs(alice)
    .icrc1_transfer([transferArg(MINTER, 1n)])
    .catch((e: unknown) => e)
  expect(
    isReactorError(missing) && [
      missing.kind,
      missing.mayHaveExecuted,
      missing.rejectCode,
    ]
  ).toEqual(["rejected", false, 3])
  world.ledger.rejectTransfersWith = null
  // Code 5: the ledger's own code trapped; it may have committed before.
  world.ledger.rejectTransfersWith = 5
  const trap = await ledgerAs(alice)
    .icrc1_transfer([transferArg(MINTER, 1n)])
    .catch((e: unknown) => e)
  expect(
    isReactorError(trap) && [trap.kind, trap.mayHaveExecuted, trap.rejectCode]
  ).toEqual(["rejected", true, 5])
  world.ledger.rejectTransfersWith = null
  world.loseReplyOf("icrc1_transfer", 3)
  const lost = await ledgerAs(alice)
    .icrc1_transfer([transferArg(MINTER, 1n)])
    .catch((e: unknown) => e)
  expect(isReactorError(lost) && [lost.kind, lost.mayHaveExecuted]).toEqual([
    "outcome_unknown",
    true,
  ])
  expect(world.distinctCalls("icrc1_transfer")).toHaveLength(3)
  expect(world.ledger.transfers).toHaveLength(1)
}, 30_000)
