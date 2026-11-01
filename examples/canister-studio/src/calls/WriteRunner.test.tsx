// A write whose outcome is unknown, as a person meets it in MethodRunner,
// over the in-memory replica: what the page lets them send next, and what
// it says the canister did. The form and the viewers are stand-ins
// (testing/doubles.tsx) that keep to their contracts.
import { c, principal } from "@meantjs/schema"
import { encodeArgs } from "@meantjs/schema/codec"
import { ReactorProvider } from "@ic-reactor/react"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  Actor as IcpLedger,
  TransferArgs,
} from "../canisters/icp_ledger.ts"
import type { Actor as Ledger } from "../canisters/icrc1.ts"
import type { CanisterInterface } from "../interface/types.ts"
import { toHex } from "../lib/hex.ts"
import { REGISTRY } from "../lib/registry.ts"
import { ConfirmWrite } from "./ConfirmWrite.tsx"
import {
  dedupeShapeOf,
  duplicateTagOf,
  isDuplicateErr,
  knownDeduplicating,
} from "./dedupe.ts"
import { HISTORY_STORAGE_KEY, clearHistory, parseHistory } from "./history.ts"
import { MethodRunner, type MethodRunnerProps } from "./MethodRunner.tsx"
import { changeForm, formDouble } from "./testing/doubles.tsx"
import {
  CKBTC_LEDGER,
  FEE,
  ICP_LEDGER,
  SEED_1,
  SEED_2,
  createTestLedger,
  methodOf,
  runtimeInterface,
  transferArg,
  typedInterface,
  type TestClient,
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
const BOB = principal("aaaaa-aa")

let test: TestClient | undefined
beforeEach(() => {
  localStorage.clear()
  clearHistory()
  formDouble.next = []
  formDouble.last = undefined
})
afterEach(() => {
  cleanup()
  test?.client.dispose()
  test = undefined
})

function renderRunner(
  client: TestClient,
  iface: CanisterInterface,
  method: string,
  props: Omit<Partial<MethodRunnerProps>, "iface" | "method"> = {}
): void {
  test = client
  const ui: ReactElement = (
    <ReactorProvider client={() => client.client}>
      <MethodRunner {...props} iface={iface} method={methodOf(iface, method)} />
    </ReactorProvider>
  )
  render(ui)
}

const history = () => parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY))
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }))
const reviewButton = () =>
  screen.getByRole("button", { name: "Review update…" }) as HTMLButtonElement
// A new review stamps the clock: let it move.
const tick = () => new Promise((resolve) => setTimeout(resolve, 2))

/** Reviews and sends `arg`, losing the reply: the ledger runs it, the page cannot know. */
async function sendLosingTheReply(client: TestClient, arg: unknown) {
  formDouble.next = [arg]
  click("Review update…")
  client.dropNextReply()
  click("Send update")
  await screen.findByText("MAY HAVE EXECUTED", {}, patiently)
}

describe("after a write whose outcome is unknown", () => {
  it("holds the form: a new review would stamp a new created_at_time, which the ledger never deduplicates", async () => {
    const ledger = createTestLedger()
    renderRunner(ledger.test, typedInterface(CKBTC_LEDGER), "icrc1_transfer")
    ledger.setBalance(SEED_1, 1_000n)
    await sendLosingTheReply(ledger.test, transferArg(BOB, 100n))
    expect(ledger.transfers).toHaveLength(1)

    expect(reviewButton().getAttribute("aria-disabled")).toBe("true")
    expect(screen.getByTestId("disabled-reason").textContent).toMatch(
      /^The last write may have executed/
    )
    fireEvent.click(reviewButton())
    expect(screen.queryByRole("region", { name: /Confirm/ })).toBeNull()
    expect(screen.getByRole("region", { name: "Safe re-send" })).toBeTruthy()

    // The explicit step out sends nothing, and only then frees the form.
    click("Start a new, different write")
    expect(ledger.callsOf("icrc1_transfer")).toBe(1)
    expect(screen.queryByRole("region", { name: "Safe re-send" })).toBeNull()
    expect(reviewButton().getAttribute("aria-disabled")).toBeNull()

    await tick()
    click("Review update…")
    const confirm = screen.getByRole("region", { name: /Confirm this update/ })
    const warning = within(confirm).getByRole("note", {
      name: "Earlier send unknown",
    })
    expect(warning.textContent).toContain(
      "An earlier send of this method may have executed"
    )
    expect(warning.textContent).toContain("This is a new write")
    // Sent now, it is a second transfer: one the reader chose, warned.
    click("Send update")
    await screen.findByText("Executed", {}, patiently)
    expect(ledger.transfers).toHaveLength(2)
    expect(ledger.balanceOf(SEED_1)).toBe(1_000n - 2n * (100n + FEE))
  })

  it("lets only the re-send go out next, so its Duplicate answer is what the page shows", async () => {
    const ledger = createTestLedger()
    renderRunner(ledger.test, typedInterface(CKBTC_LEDGER), "icrc1_transfer")
    ledger.setBalance(SEED_1, 1_000n)
    await sendLosingTheReply(ledger.test, transferArg(BOB, 100n))

    // No confirm step can open beside the offer, so no second write can
    // race the re-send.
    fireEvent.click(reviewButton())
    expect(screen.queryByRole("button", { name: "Send update" })).toBeNull()
    const offer = screen.getByRole("region", { name: "Safe re-send" })
    fireEvent.click(
      within(offer).getByRole("button", { name: "Re-send the same bytes" })
    )
    await screen.findByText("Duplicate: it had already executed", {}, patiently)
    expect(ledger.transfers).toHaveLength(1)
    expect(ledger.callsOf("icrc1_transfer")).toBe(2)
    // Settled: it ran, once. The form is free again.
    expect(reviewButton().getAttribute("aria-disabled")).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Start a new, different write" })
    ).toBeNull()
  })

  it("keeps the first send unknown after a re-send answered TooOld, with the read-back", async () => {
    const ledger = createTestLedger()
    const iface = typedInterface(CKBTC_LEDGER)
    let transfers = 0
    // An ICRC-1 ledger checks the time window before it looks for a
    // duplicate: a day later, the re-send is TooOld whatever happened.
    ledger.test.mock<Ledger>(iface.actor, CKBTC_LEDGER, {
      icrc1_transfer: () => {
        transfers += 1
        return transfers === 1
          ? { tag: "Ok", value: 0n }
          : { tag: "Err", value: { tag: "TooOld" } }
      },
      icrc1_balance_of: () => 890n,
    })
    renderRunner(ledger.test, iface, "icrc1_transfer")
    await sendLosingTheReply(ledger.test, transferArg(BOB, 100n))
    const offer = screen.getByRole("region", { name: "Safe re-send" })
    fireEvent.click(
      within(offer).getByRole("button", { name: "Re-send the same bytes" })
    )

    await screen.findByText("The re-send ran and answered Err", {}, patiently)
    expect(
      screen.queryByText("The canister decided. Nothing is pending.")
    ).toBeNull()
    expect(
      screen.queryByText("Outcome known: it ran and answered Err")
    ).toBeNull()
    expect(
      screen.getByText(
        /the canister answered the re-send TooOld, which says nothing about the first send/
      )
    ).toBeTruthy()
    expect(reviewButton().getAttribute("aria-disabled")).toBe("true")

    click("Read the state back")
    const readBack = await screen.findByRole(
      "region",
      { name: "Read back" },
      patiently
    )
    await waitFor(
      () =>
        expect(within(readBack).getByTestId("reply").textContent).toBe("890"),
      patiently
    )
    expect(
      history()
        .filter((e) => e.method === "icrc1_transfer")
        .map((e) => [e.kind, e.summary])
    ).toEqual([
      ["canister_err", 're-send: Err: {tag: "TooOld"}'],
      ["outcome_unknown", "outcome_unknown (may have executed)"],
    ])
  })

  it("reads the ICP ledger's TxDuplicate as 'it had already executed', and promises TxDuplicate", async () => {
    const ledger = createTestLedger()
    const iface = typedInterface(ICP_LEDGER)
    const seen = new Set<string>()
    let executed = 0
    ledger.test.mock<IcpLedger>(iface.actor, ICP_LEDGER, {
      transfer: (arg: TransferArgs, { caller }) => {
        const key = `${caller}|${arg.amount.e8s}|${arg.created_at_time?.timestamp_nanos}`
        if (arg.created_at_time !== null && seen.has(key)) {
          return {
            tag: "Err",
            value: { tag: "TxDuplicate", value: { duplicate_of: 7n } },
          }
        }
        seen.add(key)
        executed += 1
        return { tag: "Ok", value: 7n }
      },
    })
    renderRunner(ledger.test, iface, "transfer")
    formDouble.next = [
      {
        memo: 0n,
        amount: { e8s: 100n },
        fee: { e8s: 10_000n },
        from_subaccount: null,
        to: new Uint8Array(32),
        created_at_time: null,
      },
    ]
    click("Review update…")
    const confirm = screen.getByRole("region", { name: /Confirm this update/ })
    expect(within(confirm).getByText("TxDuplicate")).toBeTruthy()
    expect(within(confirm).queryByText("Duplicate")).toBeNull()
    ledger.test.dropNextReply()
    click("Send update")
    await screen.findByText("MAY HAVE EXECUTED", {}, patiently)
    const offer = screen.getByRole("region", { name: "Safe re-send" })
    expect(within(offer).getByText("TxDuplicate")).toBeTruthy()
    fireEvent.click(
      within(offer).getByRole("button", { name: "Re-send the same bytes" })
    )

    await screen.findByText(
      "TxDuplicate: it had already executed",
      {},
      patiently
    )
    expect(executed).toBe(1)
    expect(reviewButton().getAttribute("aria-disabled")).toBeNull()
  })

  it("words the re-send as conditional on a canister not known to deduplicate, and never says the first send had not run", async () => {
    const id = "qoctq-giaaa-aaaaa-aaaea-cai"
    const actor = c.service({
      post: c.func(
        [c.record({ body: c.text, created_at_time: c.opt(c.nat64) })],
        [c.nat],
        "update"
      ),
    })
    const client = createTestLedger().test
    let runs = 0
    // A field named created_at_time, and no deduplication at all.
    client.mock<{
      post(arg: {
        body: string
        created_at_time: bigint | null
      }): Promise<bigint>
    }>(actor, id, {
      post: () => {
        runs += 1
        return BigInt(runs)
      },
    })
    renderRunner(client, runtimeInterface(id, actor), "post")
    expect(screen.getByText(/Nothing here proves that it does\./)).toBeTruthy()
    formDouble.next = [{ body: "hello", created_at_time: null }]
    click("Review update…")
    const confirm = screen.getByRole("region", { name: /Confirm this update/ })
    expect(
      within(confirm).getByText(/If this canister deduplicates on it/)
    ).toBeTruthy()
    client.dropNextReply()
    click("Send update")
    await screen.findByText("MAY HAVE EXECUTED", {}, patiently)

    const offer = screen.getByRole("region", { name: "Safe re-send" })
    expect(offer.textContent).not.toMatch(/exactly once|runs once/)
    expect(offer.textContent).toContain(
      "if it does not, this runs the call a second time"
    )
    fireEvent.click(
      within(offer).getByRole("button", { name: "Re-send the same bytes" })
    )
    await screen.findByText("Re-sent: it executed", {}, patiently)
    expect(runs).toBe(2)
    expect(screen.queryByText(/had not run the first send/)).toBeNull()
    expect(
      screen.getByText(/the re-send that ran says nothing about the first send/)
    ).toBeTruthy()
    // Nothing settled the first send: the form stays held.
    expect(reviewButton().getAttribute("aria-disabled")).toBe("true")
  })
})

describe("a Duplicate answer from a canister not known to deduplicate", () => {
  it("is shown as the canister's own word and leaves the first send unknown", async () => {
    const id = "qoctq-giaaa-aaaaa-aaaea-cai"
    const actor = c.service({
      post: c.func(
        [c.record({ body: c.text, created_at_time: c.opt(c.nat64) })],
        [c.variant({ Ok: c.nat, Err: c.variant({ Duplicate: c.null }) })],
        "update"
      ),
    })
    const client = createTestLedger().test
    let runs = 0
    // Answers Duplicate to every re-send, whatever happened: a tag, not proof.
    client.mock<{
      post(arg: {
        body: string
        created_at_time: bigint | null
      }): Promise<
        | { tag: "Ok"; value: bigint }
        | { tag: "Err"; value: { tag: "Duplicate" } }
      >
    }>(actor, id, {
      post: () => {
        runs += 1
        return runs === 1
          ? { tag: "Ok", value: 1n }
          : { tag: "Err", value: { tag: "Duplicate" } }
      },
    })
    renderRunner(client, runtimeInterface(id, actor), "post")
    await sendLosingTheReply(client, {
      body: "hello",
      created_at_time: null,
    })
    const offer = screen.getByRole("region", { name: "Safe re-send" })
    fireEvent.click(
      within(offer).getByRole("button", { name: "Re-send the same bytes" })
    )
    await screen.findByText(
      "Duplicate: the canister says it had already run this",
      {},
      patiently
    )
    expect(screen.queryByText("Duplicate: it had already executed")).toBeNull()
    expect(
      screen.getByText(/that answer does not prove the first send ran/)
    ).toBeTruthy()
    // Nothing proved what the first send did: the form stays held.
    expect(reviewButton().getAttribute("aria-disabled")).toBe("true")
  })
})

describe("the confirm step after a write was set aside", () => {
  const dedupeSwitch = () =>
    screen.getByRole("checkbox", { name: "Deduplicate with created_at_time" })
  const earlierNote = () =>
    within(
      screen.getByRole("region", { name: /Confirm this update/ })
    ).getByRole("note", { name: "Earlier send unknown" })

  it("never promises a duplicate answer to the same bytes without created_at_time", async () => {
    const ledger = createTestLedger()
    renderRunner(ledger.test, typedInterface(CKBTC_LEDGER), "icrc1_transfer")
    ledger.setBalance(SEED_1, 1_000n)
    fireEvent.click(dedupeSwitch())
    await sendLosingTheReply(ledger.test, transferArg(BOB, 100n))
    click("Start a new, different write")

    formDouble.next = [transferArg(BOB, 100n)]
    click("Review update…")
    const note = earlierNote().textContent ?? ""
    expect(note).not.toMatch(/answers Duplicate/)
    expect(note).toContain("they carry no created_at_time")
    expect(note).toContain("sending them again runs the write again")
    click("Send update")
    await screen.findByText("Executed", {}, patiently)
    expect(ledger.transfers).toHaveLength(2)
  })

  it("never promises a duplicate answer to the same bytes from another sender", async () => {
    const ledger = createTestLedger()
    renderRunner(ledger.test, typedInterface(CKBTC_LEDGER), "icrc1_transfer")
    ledger.setBalance(SEED_1, 1_000n)
    ledger.setBalance(SEED_2, 1_000n)
    fireEvent.click(dedupeSwitch())
    // A new object each time, as the form builds: the client takes the very
    // object it offered for a re-send as that re-send.
    const stamped = () => ({ ...transferArg(BOB, 100n), created_at_time: 123n })
    await sendLosingTheReply(ledger.test, stamped())
    click("Start a new, different write")
    act(() => ledger.test.auth.switchTo(2))

    formDouble.next = [stamped()]
    click("Review update…")
    const note = earlierNote().textContent ?? ""
    expect(note).not.toMatch(/answers Duplicate/)
    expect(note).toContain(`that one went out as ${SEED_1}`)
    click("Send update")
    await screen.findByText("Executed", {}, patiently)
    expect(ledger.transfers).toHaveLength(2)
  })

  it("promises the duplicate answer only to the same stamped bytes from the same sender, which get it", async () => {
    const ledger = createTestLedger()
    renderRunner(ledger.test, typedInterface(CKBTC_LEDGER), "icrc1_transfer")
    ledger.setBalance(SEED_1, 1_000n)
    fireEvent.click(dedupeSwitch())
    const stamped = () => ({ ...transferArg(BOB, 100n), created_at_time: 123n })
    await sendLosingTheReply(ledger.test, stamped())
    click("Start a new, different write")

    formDouble.next = [stamped()]
    click("Review update…")
    expect(earlierNote().textContent).toContain(
      "the canister answers Duplicate if that one ran"
    )
    click("Send update")
    await screen.findByText("Duplicate: it had already executed", {}, patiently)
    expect(ledger.transfers).toHaveLength(1)
  })

  it("words the way out by what the method can deduplicate on", async () => {
    const id = "qoctq-giaaa-aaaaa-aaaea-cai"
    const actor = c.service({ bump: c.func([c.nat], [c.nat], "update") })
    const client = createTestLedger().test
    client.mock<{ bump(n: bigint): Promise<bigint> }>(actor, id, {
      bump: (n) => n + 1n,
    })
    renderRunner(client, runtimeInterface(id, actor), "bump")
    await sendLosingTheReply(client, 1n)
    const hint = screen.getByText(/^Sends nothing: it frees the form\./)
    expect(hint.textContent).not.toContain("its own created_at_time")
    expect(hint.textContent).toContain("This method has no created_at_time")
    click("Start a new, different write")
    formDouble.next = [1n]
    click("Review update…")
    const note = earlierNote().textContent ?? ""
    expect(note).not.toMatch(/answers Duplicate/)
    expect(note).toContain("this method has no created_at_time")
  })

  it("does not say a new write gets its own created_at_time while deduplication is off", async () => {
    const ledger = createTestLedger()
    renderRunner(ledger.test, typedInterface(CKBTC_LEDGER), "icrc1_transfer")
    ledger.setBalance(SEED_1, 1_000n)
    fireEvent.click(dedupeSwitch())
    await sendLosingTheReply(ledger.test, transferArg(BOB, 100n))
    const hint = screen.getByText(/^Sends nothing: it frees the form\./)
    expect(hint.textContent).not.toContain("gets its own created_at_time")
    expect(hint.textContent).toContain("With deduplication off")
  })
})

describe("the focus", () => {
  it("comes back to the form's button when the confirm step is cancelled or sent", async () => {
    const ledger = createTestLedger()
    renderRunner(ledger.test, typedInterface(CKBTC_LEDGER), "icrc1_transfer")
    ledger.setBalance(SEED_1, 1_000n)
    formDouble.next = [transferArg(BOB, 100n)]
    click("Review update…")
    // Escape, as a keyboard user cancels.
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), {
      key: "Escape",
    })
    expect(screen.queryByRole("region", { name: /Confirm/ })).toBeNull()
    expect(document.activeElement).toBe(reviewButton())

    await tick()
    click("Review update…")
    screen.getByRole("button", { name: "Send update" }).focus()
    click("Send update")
    expect(document.activeElement).toBe(reviewButton())
    await screen.findByText("Executed", {}, patiently)
    expect(document.activeElement).toBe(reviewButton())
  })

  it("comes back to the form's button after a re-send, or a new write is started", async () => {
    const ledger = createTestLedger()
    renderRunner(ledger.test, typedInterface(CKBTC_LEDGER), "icrc1_transfer")
    ledger.setBalance(SEED_1, 1_000n)
    await sendLosingTheReply(ledger.test, transferArg(BOB, 100n))
    const offer = screen.getByRole("region", { name: "Safe re-send" })
    ledger.test.dropNextReply()
    fireEvent.click(
      within(offer).getByRole("button", { name: "Re-send the same bytes" })
    )
    expect(document.activeElement).toBe(reviewButton())
    await screen.findByText("MAY HAVE EXECUTED", {}, patiently)

    screen.getByRole("button", { name: "Start a new, different write" }).focus()
    click("Start a new, different write")
    expect(document.activeElement).toBe(reviewButton())
  })
})

describe("the confirm step", () => {
  it("cannot send while a write is in flight", () => {
    const iface = typedInterface(CKBTC_LEDGER)
    const method = methodOf(iface, "icrc1_transfer")
    const values = [transferArg(BOB, 1n)]
    const encoded = encodeArgs(method.args, values)
    if (!encoded.ok) throw new Error("does not encode")
    const onConfirm = vi.fn()
    render(
      <ConfirmWrite
        iface={iface}
        method={method}
        values={values}
        bytes={encoded.bytes}
        caller={SEED_1}
        busy
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />
    )
    const send = screen.getByRole("button", {
      name: "Send update",
    }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(send)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe("what is known to deduplicate", () => {
  it("is what the registry names, never a field's name alone", () => {
    const icp = typedInterface(ICP_LEDGER)
    const ckbtc = typedInterface(CKBTC_LEDGER)
    expect(knownDeduplicating(icp, methodOf(icp, "transfer"))).toBe(true)
    expect(knownDeduplicating(icp, methodOf(icp, "icrc2_approve"))).toBe(true)
    expect(knownDeduplicating(ckbtc, methodOf(ckbtc, "icrc1_transfer"))).toBe(
      true
    )
    // send_dfx carries created_at_time, but traps on a duplicate.
    expect(knownDeduplicating(icp, methodOf(icp, "send_dfx"))).toBe(false)
    // The same ledger's interface read live (or pasted) is not the registry's.
    const pasted = runtimeInterface(CKBTC_LEDGER, ckbtc.actor)
    expect(knownDeduplicating(pasted, methodOf(pasted, "icrc1_transfer"))).toBe(
      false
    )
  })

  it("names only methods that carry created_at_time", () => {
    for (const entry of REGISTRY) {
      const iface = typedInterface(entry.id)
      for (const name of entry.dedupedMethods ?? []) {
        expect(dedupeShapeOf(methodOf(iface, name)), name).toBeDefined()
      }
    }
  })

  it("answers TxDuplicate on the ICP ledger's transfer, Duplicate elsewhere", () => {
    const icp = typedInterface(ICP_LEDGER)
    expect(duplicateTagOf(dedupeShapeOf(methodOf(icp, "transfer"))!)).toBe(
      "TxDuplicate"
    )
    expect(
      duplicateTagOf(dedupeShapeOf(methodOf(icp, "icrc1_transfer"))!)
    ).toBe("Duplicate")
    expect(isDuplicateErr({ tag: "TxDuplicate", value: {} })).toBe(true)
    expect(isDuplicateErr({ tag: "Duplicate", value: {} })).toBe(true)
    expect(isDuplicateErr({ tag: "TooOld" })).toBe(false)
  })
})

describe("reads", () => {
  it("records a read run at once (a shared link, a quick read, a replay) exactly once", async () => {
    const ledger = createTestLedger()
    const iface = typedInterface(CKBTC_LEDGER)
    const account = { owner: principal(SEED_1), subaccount: null }
    ledger.setBalance(SEED_1, 5n)
    renderRunner(ledger.test, iface, "icrc1_balance_of", {
      initialValues: [account],
      autoRun: true,
    })
    await waitFor(
      () => expect(screen.getByTestId("reply").textContent).toBe("5"),
      patiently
    )
    const encoded = encodeArgs(methodOf(iface, "icrc1_balance_of").args, [
      account,
    ])
    if (!encoded.ok) throw new Error("does not encode")
    await waitFor(() => expect(history()).toHaveLength(1))
    expect(history()[0]).toMatchObject({
      method: "icrc1_balance_of",
      caller: SEED_1,
      outcome: "ok",
      summary: "ok: 5",
      argsHex: toHex(encoded.bytes),
    })

    // A refetch is a read of its own: one more entry, not two.
    ledger.setBalance(SEED_1, 6n)
    click("Refetch")
    await waitFor(
      () => expect(screen.getByTestId("reply").textContent).toBe("6"),
      patiently
    )
    await waitFor(() => expect(history()).toHaveLength(2))
    expect(history().map((e) => e.summary)).toEqual(["ok: 6", "ok: 5"])
  })

  it("links to the arguments of the result on screen, not to the form's edits since", async () => {
    const ledger = createTestLedger()
    const iface = typedInterface(CKBTC_LEDGER)
    const method = methodOf(iface, "icrc1_balance_of")
    const shared: string[] = []
    renderRunner(ledger.test, iface, "icrc1_balance_of", {
      onShare: (url) => shared.push(url),
    })
    const alice = { owner: principal(SEED_1), subaccount: null }
    const bob = { owner: BOB, subaccount: null }
    const hexOf = (value: unknown) => {
      const encoded = encodeArgs(method.args, [value])
      if (!encoded.ok) throw new Error("does not encode")
      return toHex(encoded.bytes)
    }

    formDouble.next = [alice]
    click("Run query")
    await waitFor(
      () => expect(screen.getByTestId("reply").textContent).toBe("0"),
      patiently
    )
    act(() => changeForm([bob]))
    click("Copy link to this result")
    expect(shared).toHaveLength(1)
    expect(shared[0]).toContain(hexOf(alice))
    expect(shared[0]).not.toContain(hexOf(bob))
  })

  it("names a link made before anything ran for what it is: the form's arguments, not a result", () => {
    const ledger = createTestLedger()
    renderRunner(ledger.test, typedInterface(CKBTC_LEDGER), "icrc1_balance_of")
    act(() => changeForm([{ owner: principal(SEED_1), subaccount: null }]))
    expect(
      screen.queryByRole("button", { name: "Copy link to this result" })
    ).toBeNull()
    expect(
      screen.getByRole("button", { name: "Copy link to run these arguments" })
    ).toBeTruthy()
  })
})
