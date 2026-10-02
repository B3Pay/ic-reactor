// @vitest-environment jsdom
//
// Hidden acceptance tests for the react-wallet task. Condition-agnostic: they
// render `Wallet` from `src/Wallet.tsx` with a test `WalletAuth` and drive it
// only through the `data-testid`s the task prompt specifies, against the
// fake replica. Never shown to agents.
//
// Each test checks one requirement (task.json groups them). Where several
// requirements are judged from one transfer, a `describe` runs it once in
// `beforeAll` and each `it` checks one thing about it.
//
// One replica (harness/world.ts) and one auth (reset per test) per file, both
// created before the solution is imported, so a solution may keep its client
// at module scope.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createElement } from "react"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import {
  ANONYMOUS,
  NAT64_MAX,
  REMOTE_HOST,
  createWorld,
  formatE8s,
  sleep,
  type World,
} from "#harness/world"
import { LEDGER_FEE } from "#harness/fake-ledger"
import { createFakeAuth } from "#harness/fake-auth"
import { Wallet } from "../src/Wallet"

// Only balance_exact_bigint uses a balance above 2^53, so a `Number()` bug
// fails that test and no other; every other balance survives a detour
// through `number` unchanged.
const BIG = 12_345_678_901_234_567_891n
const BAL_A = 5_000_000_000n // 50.00000000
const BAL_B = 7_000_000_000n // 70.00000000
const ANON_BALANCE = 777n
const SETTLE_MS = 2_500
const WAIT = { timeout: 10_000 }
const TERMINAL = ["success", "error", "unknown"]

const auth = createFakeAuth(Ed25519KeyIdentity.generate())

interface Setup {
  world: World
  alice: Ed25519KeyIdentity
  bob: Ed25519KeyIdentity
  carol: Ed25519KeyIdentity
}

function fresh(signedIn: boolean): Setup {
  const world = createWorld()
  const alice = Ed25519KeyIdentity.generate()
  const bob = Ed25519KeyIdentity.generate()
  const carol = Ed25519KeyIdentity.generate()
  world.own(
    ...[alice, bob, carol].map((identity) => identity.getPrincipal().toText())
  )
  world.ledger.setBalance(alice.getPrincipal().toText(), BAL_A)
  world.ledger.setBalance(bob.getPrincipal().toText(), BAL_B)
  world.ledger.setBalance(ANONYMOUS, ANON_BALANCE)
  auth.reset(alice, { signedIn })
  return { world, alice, bob, carol }
}

const walletElement = (
  world: World,
  config: { host?: string; rootKey?: Uint8Array | undefined } = {}
) =>
  createElement(Wallet, {
    auth,
    config: {
      host: config.host ?? world.host,
      canisterId: world.ledgerId,
      ...("rootKey" in config
        ? config.rootKey
          ? { rootKey: config.rootKey }
          : {}
        : { rootKey: world.rootKey }),
    },
  })

const balanceText = () =>
  screen.queryByTestId("balance")?.textContent?.trim() ?? null
const status = () =>
  screen.queryByTestId("transfer-status")?.getAttribute("data-state") ?? null
const digits = (texts: Iterable<string>) =>
  [...texts].filter((text) => /\d/.test(text))

/** Records every balance text shown, by DOM mutation and by sampling. */
function watchBalance() {
  const seen = new Set<string>()
  const sample = () => {
    const text = balanceText()
    if (text !== null) seen.add(text)
  }
  sample()
  const observer = new MutationObserver(sample)
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })
  const timer = setInterval(sample, 5)
  return {
    seen,
    stop() {
      sample()
      observer.disconnect()
      clearInterval(timer)
    },
  }
}

async function submitTransfer(to: string, amount: string) {
  const toInput = screen.getByTestId("transfer-to")
  const amountInput = screen.getByTestId("transfer-amount")
  await act(async () => {
    fireEvent.change(toInput, { target: { value: to } })
  })
  await act(async () => {
    fireEvent.change(amountInput, { target: { value: amount } })
  })
  await act(async () => {
    fireEvent.click(screen.getByTestId("transfer-submit"))
  })
}

/** Submit when the form lets a user do it; a hidden or disabled form is fine. */
async function trySubmitTransfer(to: string, amount: string) {
  const submit = screen.queryByTestId("transfer-submit")
  const toInput = screen.queryByTestId("transfer-to")
  const amountInput = screen.queryByTestId("transfer-amount")
  if (!submit || !toInput || !amountInput) return
  await act(async () => {
    fireEvent.change(toInput, { target: { value: to } })
  })
  await act(async () => {
    fireEvent.change(amountInput, { target: { value: amount } })
  })
  if ((submit as HTMLButtonElement).disabled) return
  await act(async () => {
    fireEvent.click(submit)
  })
}

async function signedIn(s: Setup, balance = BAL_A) {
  const view = render(walletElement(s.world))
  await waitFor(() => expect(balanceText()).toBe(formatE8s(balance)), WAIT)
  return view
}

/** A test that renders: always unmounts what it rendered, pass or fail. */
function test(name: string, fn: () => Promise<void>, timeout = 30_000) {
  it(
    name,
    async () => {
      try {
        await fn()
      } finally {
        cleanup()
      }
    },
    timeout
  )
}

/**
 * One transfer of 2 tokens from Alice to Carol under an injected fault:
 * renders, submits, waits for a terminal state, settles, and records.
 */
function scenario(inject: (s: Setup) => void) {
  const out: {
    s?: Setup
    state?: string | null
    rereadAfterCall?: boolean
    shownAfter?: string | null
  } = {}
  beforeAll(async () => {
    const s = fresh(true)
    out.s = s
    await signedIn(s)
    inject(s)
    await submitTransfer(s.carol.getPrincipal().toText(), "2")
    await waitFor(() => expect(TERMINAL).toContain(status()), {
      timeout: 30_000,
    })
    await sleep(SETTLE_MS)
    out.state = status()
    const first = s.world.calls("icrc1_transfer")[0]
    out.rereadAfterCall =
      first !== undefined &&
      s.world.queries("icrc1_balance_of").some((q) => q.at > first.at)
    out.shownAfter = balanceText()
  }, 60_000)
  afterAll(() => cleanup())
  return out
}

// ---------------------------------------------------------------- basic

test("balance_shown", async () => {
  const s = fresh(true)
  await signedIn(s)
  expect(balanceText()).toBe("50.00000000")
})

test("auth_buttons", async () => {
  const s = fresh(false)
  render(walletElement(s.world))
  await sleep(200)
  expect(screen.queryByTestId("signin")).not.toBeNull()
  expect(screen.queryByTestId("signout")).toBeNull()
  await act(async () => {
    fireEvent.click(screen.getByTestId("signin"))
  })
  await waitFor(
    () => expect(screen.queryByTestId("signout")).not.toBeNull(),
    WAIT
  )
  expect(screen.queryByTestId("signin")).toBeNull()
  await act(async () => {
    fireEvent.click(screen.getByTestId("signout"))
  })
  await waitFor(
    () => expect(screen.queryByTestId("signin")).not.toBeNull(),
    WAIT
  )
  expect(screen.queryByTestId("signout")).toBeNull()
})

test("status_starts_idle", async () => {
  const s = fresh(true)
  await signedIn(s)
  expect(status()).toBe("idle")
})

test("transfer_success", async () => {
  const s = fresh(true)
  await signedIn(s)
  await submitTransfer(s.carol.getPrincipal().toText(), "1.5")
  await waitFor(() => expect(status()).toBe("success"), WAIT)
  const calls = s.world.distinctCalls("icrc1_transfer")
  expect(calls).toHaveLength(1)
  expect(calls[0].sender).toBe(s.alice.getPrincipal().toText())
  expect(s.world.ledger.balanceOf(s.carol.getPrincipal().toText())).toBe(
    150_000_000n
  )
  await waitFor(
    () =>
      expect(balanceText()).toBe(formatE8s(BAL_A - 150_000_000n - LEDGER_FEE)),
    WAIT
  )
})

test("accepts_nat64_max", async () => {
  const s = fresh(true)
  await signedIn(s)
  await trySubmitTransfer(
    s.carol.getPrincipal().toText(),
    "184467440737.09551615" // exactly 2^64 - 1 base units
  )
  await waitFor(
    () =>
      expect(s.world.ledger.attempts.map((a) => a.amount)).toEqual([NAT64_MAX]),
    WAIT
  )
})

// ---------------------------------------------------------------- root key

test("root_key_used", async () => {
  const s = fresh(true)
  await signedIn(s)
  await submitTransfer(s.carol.getPrincipal().toText(), "1")
  await waitFor(() => expect(TERMINAL).toContain(status()), WAIT)
  expect(s.world.statusRequests()).toEqual([])
})

test("root_key_not_fetched_off_local", async () => {
  const s = fresh(true)
  render(walletElement(s.world, { host: REMOTE_HOST, rootKey: undefined }))
  await sleep(3_000)
  await trySubmitTransfer(s.carol.getPrincipal().toText(), "1")
  await sleep(1_000)
  expect(s.world.statusRequests()).toEqual([])
})

// ---------------------------------------------------------------- exactness

test("balance_exact_bigint", async () => {
  const s = fresh(true)
  s.world.ledger.setBalance(s.alice.getPrincipal().toText(), BIG)
  await signedIn(s, BIG)
  expect(balanceText()).toBe("123456789012.34567891")
})

// ---------------------------------------------------------------- input validation

// Split three ways after the second pilot (PREREGISTRATION.md, Addendum 2):
// malformed text, more fraction digits than the token has, and base units
// past nat64. Each is its own test so each can be judged on what the agent
// was told (task.json `notApplicable`).
async function refusesAmounts(amounts: string[]) {
  const s = fresh(true)
  await signedIn(s)
  const to = s.carol.getPrincipal().toText()
  for (const amount of amounts) {
    await trySubmitTransfer(to, amount)
    await sleep(300)
    expect(status(), `amount ${amount}`).not.toBe("success")
    expect(status(), `amount ${amount}`).not.toBe("pending")
  }
  await sleep(500)
  // Judged on this test's recipient: a transfer an earlier test's client is
  // still retrying in the background (as whoever is signed in now) is that
  // test's failure, not this one's.
  expect(s.world.ledger.attempts.filter((a) => a.to === to)).toEqual([])
  expect(s.world.calls("icrc1_transfer").length).toBe(
    s.world.ledger.attempts.length
  )
}

test("refuses_malformed_amount", () => refusesAmounts(["abc", "", "-1", "1e3"]))

test("refuses_excess_fraction_digits", () => refusesAmounts(["1.123456789"]))

test("refuses_amount_past_nat64", () =>
  refusesAmounts(["184467440737.09551616", "99999999999999999999"]))

test("refuses_invalid_recipient", async () => {
  const s = fresh(true)
  await signedIn(s)
  for (const to of ["not-a-principal", "aaaaa-aa-"]) {
    await trySubmitTransfer(to, "1")
    await sleep(300)
    expect(status(), `recipient ${to}`).not.toBe("success")
    expect(status(), `recipient ${to}`).not.toBe("pending")
  }
  await sleep(500)
  expect(s.world.calls()).toHaveLength(0)
})

// ---------------------------------------------------------------- anonymous

test("no_anonymous_update", async () => {
  const s = fresh(false)
  render(walletElement(s.world))
  await sleep(300)
  await trySubmitTransfer(s.carol.getPrincipal().toText(), "0.00000001")
  await sleep(700)
  // Sign in, then out again, and try once more.
  await act(async () => {
    await auth.login()
  })
  await waitFor(() => expect(balanceText()).toBe(formatE8s(BAL_A)), WAIT)
  await act(async () => {
    await auth.logout()
  })
  await sleep(100)
  await trySubmitTransfer(s.carol.getPrincipal().toText(), "0.00000001")
  await sleep(1_500)
  expect(s.world.calls().map((c) => c.sender)).not.toContain(ANONYMOUS)
  expect(s.world.calls()).toHaveLength(0)
})

// ---------------------------------------------------------------- not re-sent

test("update_not_resent_on_refetch", async () => {
  const s = fresh(true)
  const view = await signedIn(s)
  await submitTransfer(s.carol.getPrincipal().toText(), "1")
  await waitFor(() => expect(status()).toBe("success"), WAIT)
  await act(async () => {
    window.dispatchEvent(new Event("focus"))
    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("offline"))
    window.dispatchEvent(new Event("online"))
  })
  await sleep(500)
  view.unmount()
  render(walletElement(s.world))
  await sleep(300)
  await act(async () => {
    window.dispatchEvent(new Event("focus"))
    window.dispatchEvent(new Event("visibilitychange"))
  })
  await sleep(SETTLE_MS)
  expect(s.world.distinctCalls("icrc1_transfer")).toHaveLength(1)
  expect(s.world.ledger.transfers).toHaveLength(1)
})

// ---------------------------------------------------------------- outcomes

describe("canister Err", () => {
  const run = scenario(({ world, alice }) =>
    world.ledger.setBalance(alice.getPrincipal().toText(), 5n)
  )
  it("canister_err_is_error", () => expect(run.state).toBe("error"))
  it("canister_err_not_resent", () =>
    expect(run.s!.world.distinctCalls("icrc1_transfer")).toHaveLength(1))
})

// Reject codes 1-3 prove the ledger never processed the call: it failed.
// (Re-sending is allowed, so the number of calls is not checked.)
for (const code of [1, 2, 3] as const) {
  describe(`reject code ${code}`, () => {
    const run = scenario(({ world }) => {
      world.ledger.rejectTransfersWith = code
    })
    it(`reject_code_${code}_is_error`, () => expect(run.state).toBe("error"))
  })
}

// Reject codes 4 and 5 come from the ledger's own code, which may have
// committed state before failing: unknown, never re-sent, balance re-read.
for (const code of [4, 5] as const) {
  describe(`reject code ${code}`, () => {
    const run = scenario(({ world }) => {
      world.ledger.rejectTransfersWith = code
    })
    it(`reject_code_${code}_is_unknown`, () =>
      expect(run.state).toBe("unknown"))
    it(`reject_code_${code}_not_resent`, () =>
      expect(run.s!.world.distinctCalls("icrc1_transfer")).toHaveLength(1))
    if (code === 5) {
      it("reject_code_5_rereads_balance", () =>
        expect(run.rereadAfterCall).toBe(true))
    }
  })
}

// An HTTP 429 refuses the request before the replica accepts it: it failed.
describe("HTTP 429", () => {
  const run = scenario(({ world }) =>
    world.refuseCallsWith("icrc1_transfer", 429)
  )
  it("http_429_is_error", () => {
    expect(run.state).toBe("error")
    expect(run.s!.world.ledger.attempts).toHaveLength(0)
  })
})

describe("reply lost after the ledger executed it", () => {
  const run = scenario(({ world }) => world.loseReplyOf("icrc1_transfer"))
  it("lost_reply_is_unknown", () => expect(run.state).toBe("unknown"))
  it("lost_reply_not_resent", () => {
    expect(run.s!.world.distinctCalls("icrc1_transfer")).toHaveLength(1)
    expect(run.s!.world.ledger.transfers).toHaveLength(1)
  })
  it("lost_reply_rereads_balance", () => {
    // The ledger did execute it; the wallet must have gone and looked.
    expect(run.rereadAfterCall).toBe(true)
    expect(run.shownAfter).toBe(formatE8s(BAL_A - 200_000_000n - LEDGER_FEE))
  })
})

// ---------------------------------------------------------------- identities

test("no_stale_balance_after_sign_in", async () => {
  const s = fresh(false)
  s.world.ledger.balanceDelayMs = (owner) =>
    owner === s.alice.getPrincipal().toText() ? 400 : 0
  const watch = watchBalance()
  render(walletElement(s.world))
  await sleep(500)
  await act(async () => {
    fireEvent.click(screen.getByTestId("signin"))
  })
  await waitFor(() => expect(balanceText()).toBe(formatE8s(BAL_A)), WAIT)
  watch.stop()
  expect(digits(watch.seen)).toEqual([formatE8s(BAL_A)])
})

test("no_stale_balance_after_identity_switch", async () => {
  const s = fresh(true)
  await signedIn(s)
  s.world.ledger.balanceDelayMs = (owner) =>
    owner === s.bob.getPrincipal().toText() ? 400 : 0
  await act(async () => {
    auth.switchTo(s.bob)
  })
  // From the moment the switch has been handled, only Bob's balance may show.
  const watch = watchBalance()
  await waitFor(() => expect(balanceText()).toBe(formatE8s(BAL_B)), WAIT)
  watch.stop()
  expect(digits(watch.seen)).toEqual([formatE8s(BAL_B)])
})

test("no_stale_balance_inflight_switch", async () => {
  const s = fresh(true)
  // Alice's read is still in flight when the switch happens, and lands
  // while Bob's is still loading.
  s.world.ledger.balanceDelayMs = (owner) =>
    owner === s.alice.getPrincipal().toText()
      ? 500
      : owner === s.bob.getPrincipal().toText()
        ? 1_200
        : 0
  render(walletElement(s.world))
  await sleep(100)
  await act(async () => {
    auth.switchTo(s.bob)
  })
  const watch = watchBalance()
  await waitFor(() => expect(balanceText()).toBe(formatE8s(BAL_B)), WAIT)
  await sleep(300)
  watch.stop()
  expect(digits(watch.seen)).toEqual([formatE8s(BAL_B)])
})

test("no_balance_after_sign_out", async () => {
  const s = fresh(true)
  await signedIn(s)
  await act(async () => {
    fireEvent.click(screen.getByTestId("signout"))
  })
  const watch = watchBalance()
  await waitFor(
    () => expect(screen.queryByTestId("signin")).not.toBeNull(),
    WAIT
  )
  await sleep(500)
  watch.stop()
  expect(digits(watch.seen)).toEqual([])
})
