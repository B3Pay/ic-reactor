// MethodRunner as a person uses it, over the in-memory replica. The form and
// the viewers are stand-ins (testing/doubles.tsx) that keep to their
// contracts, so these tests watch the calls: what is sent, as whom, how
// often, and what the page says about it.
import { principal } from "@candid-core/schema"
import { ReactorProvider } from "@ic-reactor/react"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sha256Hex } from "../lib/hex.ts"
import { HISTORY_STORAGE_KEY, clearHistory, parseHistory } from "./history.ts"
import { SIGN_IN_REASON } from "./kinds.ts"
import { MethodRunner, type MethodRunnerProps } from "./MethodRunner.tsx"
import { formDouble } from "./testing/doubles.tsx"
import {
  CKBTC_LEDGER,
  CKBTC_MINTER,
  FEE,
  SEED_1,
  SEED_2,
  createTestLedger,
  methodOf,
  transferArg,
  typedInterface,
  type TestLedger,
} from "./testing/fixtures.ts"

vi.mock("../forms/MethodForm.tsx", () => import("./testing/doubles.tsx"))
vi.mock("../values/ReplyView.tsx", () => import("./testing/doubles.tsx"))
vi.mock("../values/CallPreview.tsx", () => import("./testing/doubles.tsx"))
vi.mock("../values/candid-text.ts", () => import("./testing/doubles.tsx"))
vi.mock("../forms/engine.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../forms/engine.ts")>()),
  issuesFromReactorError: (await import("./testing/doubles.tsx"))
    .issuesFromReactorError,
}))

const patiently = { timeout: 10_000 }
const ledgerIface = typedInterface(CKBTC_LEDGER)
const BOB = principal("aaaaa-aa")

let ledger: TestLedger | undefined
beforeEach(() => {
  localStorage.clear()
  clearHistory()
  formDouble.next = []
  formDouble.last = undefined
})
afterEach(() => {
  cleanup()
  ledger?.test.client.dispose()
  ledger = undefined
})

function renderRunner(
  props: Omit<Partial<MethodRunnerProps>, "iface" | "method"> & {
    method: string
  },
  options: { signedIn?: boolean; iface?: MethodRunnerProps["iface"] } = {}
): TestLedger {
  const made = createTestLedger({ signedIn: options.signedIn })
  ledger = made
  const iface = options.iface ?? ledgerIface
  const ui: ReactElement = (
    <ReactorProvider client={() => made.test.client}>
      <MethodRunner
        {...props}
        iface={iface}
        method={methodOf(iface, props.method)}
      />
    </ReactorProvider>
  )
  render(ui)
  return made
}

const history = () => parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY))
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }))

describe("writes", () => {
  it("disables writes while signed out, and sends nothing", () => {
    const made = renderRunner({ method: "icrc1_transfer" }, { signedIn: false })
    expect(screen.getByTestId("disabled-reason").textContent).toBe(
      SIGN_IN_REASON
    )
    expect(
      screen.getByRole("button", { name: "Review update…" })
    ).toHaveProperty("disabled", true)
    expect(made.callsOf("icrc1_transfer")).toBe(0)
  })

  it("shows the sender and the exact bytes, then sends once, stamped, and records hex", async () => {
    const made = renderRunner({ method: "icrc1_transfer" })
    made.setBalance(SEED_1, 1_000n)
    formDouble.next = [transferArg(BOB, 100n)]
    click("Review update…")

    const confirm = screen.getByRole("region", { name: /Confirm this update/ })
    expect(within(confirm).getByTestId("confirm-sender").textContent).toBe(
      SEED_1
    )
    expect(within(confirm).getByText(CKBTC_LEDGER)).toBeTruthy()
    expect(made.callsOf("icrc1_transfer")).toBe(0)
    // The digest shown is the digest of the bytes that will be sent.
    const hexBytes = within(confirm).getByText(/^4449444c/).textContent ?? ""
    const bytes = Uint8Array.from(hexBytes.match(/../g) ?? [], (h) =>
      Number.parseInt(h, 16)
    )
    const digest = await sha256Hex(bytes)
    await waitFor(() =>
      expect(within(confirm).getByTestId("confirm-sha256").textContent).toBe(
        digest
      )
    )

    click("Send update")
    await screen.findByText("Executed", {}, patiently)
    expect(screen.getByTestId("reply").textContent).toBe("0")
    expect(made.transfers).toHaveLength(1)
    expect(made.transfers[0]?.created_at_time).not.toBeNull()
    expect(made.balanceOf(SEED_1)).toBe(1_000n - 100n - FEE)
    const [entry] = history()
    expect(entry).toMatchObject({
      method: "icrc1_transfer",
      outcome: "ok",
      caller: SEED_1,
      argsHex: hexBytes,
    })
  })

  it("sends created_at_time as the form has it when deduplication is off", async () => {
    const made = renderRunner({ method: "icrc1_transfer" })
    made.setBalance(SEED_1, 1_000n)
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Deduplicate with created_at_time" })
    )
    formDouble.next = [transferArg(BOB, 1n)]
    click("Review update…")
    const confirm = screen.getByRole("region", { name: /Confirm this update/ })
    expect(within(confirm).getByText(/Off: /)).toBeTruthy()
    click("Send update")
    await screen.findByText("Executed", {}, patiently)
    expect(made.transfers[0]?.created_at_time).toBeNull()
  })

  it("after a lost reply, says it may have executed and re-sends the same bytes: Duplicate", async () => {
    const made = renderRunner({ method: "icrc1_transfer" })
    made.setBalance(SEED_1, 1_000n)
    formDouble.next = [transferArg(BOB, 100n)]
    click("Review update…")
    made.test.dropNextReply()
    click("Send update")

    await screen.findByText("MAY HAVE EXECUTED", {}, patiently)
    expect(screen.getByRole("alert").getAttribute("data-kind")).toBe(
      "outcome_unknown"
    )
    const offer = screen.getByRole("region", { name: "Safe re-send" })
    expect(within(offer).getByText(SEED_1)).toBeTruthy()
    fireEvent.click(
      within(offer).getByRole("button", { name: "Re-send the same bytes" })
    )

    await screen.findByText("Duplicate: it had already executed", {}, patiently)
    expect(screen.getByTestId("err-value").textContent).toBe(
      '{tag: "Duplicate", value: {duplicate_of: 0}}'
    )
    expect(made.transfers).toHaveLength(1)
    expect(
      history().map((e) => [e.outcome, e.kind, e.mayHaveExecuted])
    ).toEqual([
      ["canister_err", "canister_err", false],
      ["error", "outcome_unknown", true],
    ])
    expect(history()[0]?.argsHex).toBe(history()[1]?.argsHex)
  })

  it("offers no re-send to another caller, and reads the sender's balance back instead", async () => {
    const made = renderRunner({ method: "icrc1_transfer" })
    made.setBalance(SEED_1, 1_000n)
    formDouble.next = [transferArg(BOB, 100n)]
    click("Review update…")
    made.test.dropNextReply()
    click("Send update")
    await screen.findByRole("region", { name: "Safe re-send" }, patiently)

    made.test.auth.switchTo(2)
    await screen.findByText(/No safe re-send: only/, {}, patiently)
    expect(screen.queryByRole("region", { name: "Safe re-send" })).toBeNull()
    expect(
      screen.getByText(new RegExp(`the caller is now ${SEED_2}`))
    ).toBeTruthy()

    click("Read the state back")
    const readBack = await screen.findByRole(
      "region",
      { name: "Read back" },
      patiently
    )
    await waitFor(
      () =>
        expect(within(readBack).getByTestId("reply").textContent).toBe(
          String(1_000n - 100n - FEE)
        ),
      patiently
    )
    // The read-back is a call too: the history has it, as the new caller.
    await waitFor(() =>
      expect(history()[0]).toMatchObject({
        method: "icrc1_balance_of",
        caller: SEED_2,
        outcome: "ok",
      })
    )
  })

  it("shows a canister_err with the canister's Err payload, as an answer, not a failure to retry", async () => {
    renderRunner({ method: "icrc1_transfer" })
    formDouble.next = [transferArg(BOB, 5_000n)]
    click("Review update…")
    click("Send update")
    await screen.findByText(
      "Outcome known: it ran and answered Err",
      {},
      patiently
    )
    expect(screen.getByTestId("err-value").textContent).toBe(
      '{tag: "InsufficientFunds", value: {balance: 0}}'
    )
    expect(screen.queryByText(/No safe re-send/)).toBeNull()
  })

  it("hands invalid_args issues back to the form, and sends nothing", async () => {
    const made = renderRunner({ method: "icrc1_transfer" })
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Deduplicate with created_at_time" })
    )
    formDouble.next = [{ ...transferArg(BOB, 1n), amount: "lots" }]
    click("Review update…")
    click("Send update")
    await screen.findByText("Certainly not executed", {}, patiently)
    expect(screen.getByRole("alert").getAttribute("data-kind")).toBe(
      "invalid_args"
    )
    expect(screen.getByTestId("external-issues").textContent).toBe(
      "$args[0].amount"
    )
    expect(made.callsOf("icrc1_transfer")).toBe(0)
  })

  it("re-asks when the signed-in principal changed while the step was open", async () => {
    const made = renderRunner({ method: "icrc1_transfer" })
    formDouble.next = [transferArg(BOB, 1n)]
    click("Review update…")
    made.test.auth.switchTo(2)
    click("Send update")
    await screen.findByText(/The signed-in principal changed/, {}, patiently)
    expect(screen.getByTestId("confirm-sender").textContent).toBe(SEED_2)
    expect(made.callsOf("icrc1_transfer")).toBe(0)
  })
})

describe("reads", () => {
  it("reads on submit, keyed by the caller, and the certified twin under its own key", async () => {
    const made = renderRunner({ method: "icrc1_balance_of" })
    made.setBalance(SEED_1, 77n)
    const key = screen.getByRole("list", { name: "Query key segments" })
    expect(within(key).getByText("$skip")).toBeTruthy()

    formDouble.next = [{ owner: principal(SEED_1), subaccount: null }]
    click("Run query")
    await waitFor(
      () => expect(screen.getByTestId("reply").textContent).toBe("77"),
      patiently
    )
    const caller = within(key).getByText(SEED_1).closest("li")
    expect(caller?.className).toContain("call-key-caller")
    expect(history()[0]).toMatchObject({
      method: "icrc1_balance_of",
      outcome: "ok",
      summary: "ok: 77",
    })

    fireEvent.click(screen.getByRole("checkbox", { name: "Certified" }))
    await screen.findByText("certified", { selector: "code" }, patiently)
    await waitFor(
      () => expect(screen.getByTestId("reply").textContent).toBe("77"),
      patiently
    )
    expect(
      made.test.requests.some(
        (r) => r.endpoint === "call" && r.methodName === "icrc1_balance_of"
      )
    ).toBe(true)
  })

  it("runs a shared link's read at once, and never a write", async () => {
    const account = { owner: principal(SEED_1), subaccount: null }
    const made = renderRunner({
      method: "icrc1_balance_of",
      initialValues: [account],
      autoRun: true,
    })
    made.setBalance(SEED_1, 5n)
    await waitFor(
      () => expect(screen.getByTestId("reply").textContent).toBe("5"),
      patiently
    )
    cleanup()
    made.test.client.dispose()

    const writer = renderRunner({
      method: "icrc1_transfer",
      initialValues: [transferArg(BOB, 1n)],
      autoRun: true,
    })
    expect(screen.queryByRole("region", { name: /Confirm/ })).toBeNull()
    expect(writer.callsOf("icrc1_transfer")).toBe(0)
  })

  it("reads an idempotent update only for a signed-in caller", async () => {
    const minter = typedInterface(CKBTC_MINTER)
    renderRunner(
      { method: "get_btc_address" },
      { iface: minter, signedIn: false }
    )
    expect(screen.getByTestId("disabled-reason").textContent).toBe(
      SIGN_IN_REASON
    )
    cleanup()
    ledger?.test.client.dispose()

    renderRunner({ method: "get_btc_address" }, { iface: minter })
    formDouble.next = [{ owner: null, subaccount: null }]
    click("Get (idempotent update)")
    await waitFor(
      () =>
        expect(screen.getByTestId("reply").textContent).toBe(
          `"bc1q-${SEED_1}"`
        ),
      patiently
    )
  })
})
