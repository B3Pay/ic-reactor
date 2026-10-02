// @vitest-environment node
//
// Hidden acceptance tests for the node-tool task. Condition-agnostic: they
// touch only the task's public boundary (`createLedgerTool` from
// `src/index.ts`) and the IC HTTP interface the fake replica answers, so the
// same file scores every condition. Never shown to agents.
//
// Each test checks one requirement (task.json groups them). Where several
// requirements are judged from one transfer, a `describe` runs the transfer
// once in `beforeAll` and each `it` checks one thing about it.
//
// The world (harness/world.ts) is one replica per file, imported before the
// solution, so a solution may keep agents at module scope.
import { beforeAll, describe, expect, it } from "vitest"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import {
  ANONYMOUS,
  NAT64_MAX,
  REMOTE_HOST,
  createWorld,
  sleep,
  type World,
} from "#harness/world"
import { LEDGER_FEE } from "#harness/fake-ledger"
import { createLedgerTool } from "../src/index"
import type { TransferResult } from "../src/contract"

// Above 2^53, so a detour through `number` changes it. Only
// balance_exact_bigint uses it; every other balance survives `number`, so a
// precision bug fails that test and no other.
const BIG = 12_345_678_901_234_567_891n
const BAL = 5_000_000_000n
// Long enough for a TanStack Query retry (first delay 1s) or a hand-written
// retry loop to show itself.
const SETTLE_MS = 2_500

interface Setup {
  world: World
  alice: Ed25519KeyIdentity
  bob: Ed25519KeyIdentity
}

function fresh(): Setup {
  const world = createWorld()
  const alice = Ed25519KeyIdentity.generate()
  const bob = Ed25519KeyIdentity.generate()
  world.own(alice.getPrincipal().toText(), bob.getPrincipal().toText())
  world.ledger.setBalance(alice.getPrincipal().toText(), BAL)
  return { world, alice, bob }
}

const toolFor = (
  world: World,
  identity?: Ed25519KeyIdentity | AnonymousIdentity
) =>
  createLedgerTool({
    host: world.host,
    canisterId: world.ledgerId,
    rootKey: world.rootKey,
    ...(identity ? { identity } : {}),
  })

const mayHave = (r: TransferResult) => (r.ok ? undefined : r.mayHaveExecuted)

/** One transfer from Alice under an injected fault, observed after a settle. */
function scenario(inject: (s: Setup) => void) {
  const out: { s?: Setup; result?: TransferResult } = {}
  beforeAll(async () => {
    const s = fresh()
    inject(s)
    out.s = s
    out.result = await toolFor(s.world, s.alice).transfer({
      to: s.bob.getPrincipal().toText(),
      amount: "2",
    })
    await sleep(SETTLE_MS)
  }, 40_000)
  return out
}

// ---------------------------------------------------------------- basic

it("balance_returned", async () => {
  const { world, alice } = fresh()
  expect(await toolFor(world).getBalance(alice.getPrincipal().toText())).toBe(
    BAL
  )
})

it("transfer_success", async () => {
  const { world, alice, bob } = fresh()
  const tool = toolFor(world, alice)
  const to = bob.getPrincipal().toText()
  const result = await tool.transfer({ to, amount: "1.5" })
  expect(result.ok).toBe(true)
  if (result.ok) expect(typeof result.blockIndex).toBe("bigint")
  const calls = world.distinctCalls("icrc1_transfer")
  expect(calls).toHaveLength(1)
  expect(calls[0].sender).toBe(alice.getPrincipal().toText())
  expect(world.ledger.balanceOf(to)).toBe(150_000_000n)
  expect(await tool.getBalance(alice.getPrincipal().toText())).toBe(
    BAL - 150_000_000n - LEDGER_FEE
  )
  expect(await tool.getBalance(to)).toBe(150_000_000n)
})

it("accepts_nat64_max", async () => {
  const { world, alice, bob } = fresh()
  await toolFor(world, alice).transfer({
    to: bob.getPrincipal().toText(),
    amount: "184467440737.09551615", // exactly 2^64 - 1 base units
  })
  expect(world.ledger.attempts.map((a) => a.amount)).toEqual([NAT64_MAX])
})

// ---------------------------------------------------------------- root key

it("root_key_used", async () => {
  const { world, alice, bob } = fresh()
  const tool = toolFor(world, alice)
  await tool.getBalance(alice.getPrincipal().toText())
  await tool.transfer({ to: bob.getPrincipal().toText(), amount: "1" })
  expect(world.statusRequests()).toEqual([])
})

it("root_key_not_fetched_off_local", async () => {
  const { world, alice, bob } = fresh()
  const tool = createLedgerTool({
    host: REMOTE_HOST,
    canisterId: world.ledgerId,
    identity: alice,
  })
  await tool.getBalance(alice.getPrincipal().toText()).catch(() => undefined)
  await tool
    .transfer({ to: bob.getPrincipal().toText(), amount: "1" })
    .catch(() => undefined)
  expect(world.statusRequests()).toEqual([])
}, 40_000)

// ---------------------------------------------------------------- exactness

it("balance_exact_bigint", async () => {
  const { world, alice } = fresh()
  world.ledger.setBalance(alice.getPrincipal().toText(), BIG)
  const balance = await toolFor(world).getBalance(alice.getPrincipal().toText())
  expect(typeof balance).toBe("bigint")
  expect(balance).toBe(BIG)
})

// ---------------------------------------------------------------- input validation

// Split three ways after the second pilot (PREREGISTRATION.md, Addendum 2):
// malformed text, more fraction digits than the token has, and base units
// past nat64. Each is its own test so each can be judged on what the agent
// was told (task.json `notApplicable`).
async function refusesAmounts(amounts: string[]) {
  const { world, alice, bob } = fresh()
  const tool = toolFor(world, alice)
  const to = bob.getPrincipal().toText()
  for (const amount of amounts) {
    const result = await tool.transfer({ to, amount })
    expect(result.ok, `amount ${JSON.stringify(amount)}`).toBe(false)
  }
  await sleep(300)
  // Judged on this test's recipient, as in react-wallet: a background retry
  // of an earlier test's transfer is that test's failure, not this one's.
  expect(world.ledger.attempts.filter((a) => a.to === to)).toEqual([])
  expect(world.calls("icrc1_transfer").length).toBe(
    world.ledger.attempts.length
  )
}

it("refuses_malformed_amount", () => refusesAmounts(["-1", "abc", "", "1e3"]))

it("refuses_excess_fraction_digits", () => refusesAmounts(["1.123456789"])) // 9 fraction digits

it("refuses_amount_past_nat64", () =>
  refusesAmounts([
    "184467440737.09551616", // 2^64 base units: one past nat64
    "99999999999999999999", // far past nat64
  ]))

it("refuses_invalid_recipient", async () => {
  const { world, alice } = fresh()
  const tool = toolFor(world, alice)
  for (const to of ["not-a-principal", "", "aaaaa-aa-"]) {
    const result = await tool.transfer({ to, amount: "1" })
    expect(result.ok, `recipient ${JSON.stringify(to)}`).toBe(false)
  }
  await sleep(300)
  expect(world.calls()).toHaveLength(0)
})

// ---------------------------------------------------------------- anonymous

it("no_anonymous_update", async () => {
  const { world, bob } = fresh()
  const to = bob.getPrincipal().toText()
  world.ledger.setBalance(ANONYMOUS, BIG)
  for (const tool of [
    toolFor(world),
    toolFor(world, new AnonymousIdentity()),
  ]) {
    const result = await tool.transfer({ to, amount: "1" })
    expect(result.ok).toBe(false)
  }
  await sleep(500)
  expect(world.calls()).toHaveLength(0)
})

// ---------------------------------------------------------------- classification

it("refusal_not_executed", async () => {
  const { world, alice, bob } = fresh()
  const to = bob.getPrincipal().toText()
  const refusals = [
    await toolFor(world, alice).transfer({ to, amount: "1.123456789" }),
    await toolFor(world).transfer({ to, amount: "1" }),
  ]
  for (const result of refusals) {
    expect(result.ok).toBe(false)
    expect(mayHave(result)).toBe(false)
  }
})

describe("canister Err", () => {
  const run = scenario(({ world, alice }) =>
    world.ledger.setBalance(alice.getPrincipal().toText(), 5n)
  )
  it("canister_err_classified", () => {
    expect(run.result?.ok).toBe(false)
    expect(mayHave(run.result!)).toBe(false)
  })
  it("canister_err_not_resent", () => {
    expect(run.s!.world.distinctCalls("icrc1_transfer")).toHaveLength(1)
  })
})

// Reject codes 1-3 prove the ledger never processed the call: not executed
// (re-sending is allowed, so the number of calls is not checked).
for (const code of [1, 2, 3] as const) {
  describe(`reject code ${code}`, () => {
    const run = scenario(({ world }) => {
      world.ledger.rejectTransfersWith = code
    })
    it(`reject_code_${code}_classified`, () => {
      expect(run.result?.ok).toBe(false)
      expect(mayHave(run.result!)).toBe(false)
    })
  })
}

// Reject codes 4 and 5 come from the ledger's own code, which may have
// committed state before failing: may have executed, and never re-sent.
for (const code of [4, 5] as const) {
  describe(`reject code ${code}`, () => {
    const run = scenario(({ world }) => {
      world.ledger.rejectTransfersWith = code
    })
    it(`reject_code_${code}_classified`, () => {
      expect(run.result?.ok).toBe(false)
      expect(mayHave(run.result!)).toBe(true)
    })
    it(`reject_code_${code}_not_resent`, () => {
      expect(run.s!.world.distinctCalls("icrc1_transfer")).toHaveLength(1)
    })
  })
}

// An HTTP 429 refuses the request before the replica accepts it.
describe("HTTP 429", () => {
  const run = scenario(({ world }) =>
    world.refuseCallsWith("icrc1_transfer", 429)
  )
  it("http_429_classified", () => {
    expect(run.result?.ok).toBe(false)
    expect(mayHave(run.result!)).toBe(false)
    expect(run.s!.world.ledger.attempts).toHaveLength(0)
  })
})

describe("reply lost after the ledger executed it", () => {
  const out: { s?: Setup; result?: TransferResult; after?: bigint } = {}
  beforeAll(async () => {
    const s = fresh()
    s.world.loseReplyOf("icrc1_transfer")
    const tool = toolFor(s.world, s.alice)
    const owner = s.alice.getPrincipal().toText()
    // A read before the transfer, so a tool that caches reads has cached one.
    await tool.getBalance(owner)
    out.s = s
    out.result = await tool.transfer({
      to: s.bob.getPrincipal().toText(),
      amount: "2",
    })
    await sleep(SETTLE_MS)
    out.after = await tool.getBalance(owner)
  }, 40_000)
  it("lost_reply_classified", () => {
    expect(out.result?.ok).toBe(false)
    expect(mayHave(out.result!)).toBe(true)
  })
  it("lost_reply_not_resent", () => {
    expect(out.s!.world.distinctCalls("icrc1_transfer")).toHaveLength(1)
    expect(out.s!.world.ledger.transfers).toHaveLength(1)
  })
  it("lost_reply_balance_reread", () => {
    // The ledger did execute it; a read now must show it.
    expect(out.after).toBe(BAL - 200_000_000n - LEDGER_FEE)
  })
})
