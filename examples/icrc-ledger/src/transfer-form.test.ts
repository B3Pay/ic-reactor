import { afterEach, describe, expect, it } from "vitest"
import type { TransferArg } from "./canisters/icrc1.ts"
import { SEED_2, createSandbox, type Sandbox } from "./sandbox.ts"
import {
  readTransferForm,
  stamped,
  type TransferForm,
} from "./transfer-form.ts"

const form = (overrides: Partial<TransferForm> = {}): TransferForm => ({
  to: SEED_2,
  amount: "1.5",
  fee: "",
  ...overrides,
})

describe("reading the transfer form", () => {
  it("makes the exact argument: base units, the ledger's fee, the memo, and created_at_time left for the send to stamp", () => {
    const memo = new Uint8Array(16).fill(7)
    expect(readTransferForm(form({ to: ` ${SEED_2} ` }), 8, memo)).toEqual({
      ok: true,
      arg: {
        to: { owner: SEED_2, subaccount: null },
        amount: 150_000_000n,
        fee: null,
        memo,
        from_subaccount: null,
        created_at_time: null,
      },
    })
  })

  it("gives each transfer its own 16-byte memo", () => {
    const first = readTransferForm(form(), 8)
    const second = readTransferForm(form(), 8)
    if (!first.ok || !second.ok) throw new Error("refused")
    expect(first.arg.memo).toHaveLength(16)
    expect(second.arg.memo).toHaveLength(16)
    expect(second.arg.memo).not.toEqual(first.arg.memo)
  })

  it("keeps a typed fee, also exactly", () => {
    const read = readTransferForm(form({ amount: "0.29", fee: "0.0001" }), 8)
    expect(read.ok && [read.arg.amount, read.arg.fee]).toEqual([
      29_000_000n,
      10_000n,
    ])
  })

  it.each([
    ["to", form({ to: "not a principal" })],
    ["to", form({ to: SEED_2.toUpperCase() })],
    ["amount", form({ amount: "" })],
    ["amount", form({ amount: "1e3" })],
    ["amount", form({ amount: "1,5" })],
    ["amount", form({ amount: "-1" })],
    ["amount", form({ amount: "3.141592653" })],
    ["amount", form({ amount: "0" })],
    ["fee", form({ fee: "ten" })],
  ] as const)("refuses the %s field of %j", (field, typed) => {
    const read = readTransferForm(typed, 8)
    expect(read.ok).toBe(false)
    expect(!read.ok && read.field).toBe(field)
  })
})

describe("the time a transfer is sent with", () => {
  const made: Sandbox[] = []
  const setup = (): Sandbox => {
    const sandbox = createSandbox()
    made.push(sandbox)
    return sandbox
  }
  afterEach(() => {
    for (const sandbox of made.splice(0)) sandbox.client.dispose()
  })

  const read = (): TransferArg => {
    const result = readTransferForm(form(), 8)
    if (!result.ok) throw new Error(`refused: ${result.reason}`)
    return result.arg
  }

  it("stamps a new transfer with the time the client reads from the IC", async () => {
    const { ledger } = setup()
    // A time no `Date.now()` gives: it is not a whole millisecond.
    const asked: unknown[] = []
    const ic = {
      time: (canister: unknown) => {
        asked.push(canister)
        return Promise.resolve(1_700_000_000_123_456_789n)
      },
    }
    const arg = read()

    expect(await stamped(ic, ledger, arg)).toEqual({
      ...arg,
      created_at_time: 1_700_000_000_123_456_789n,
    })
    // The time is the ledger's subnet's, and the form's argument is left as
    // it was.
    expect(asked).toEqual([ledger])
    expect(arg.created_at_time).toBeNull()
  })

  it("reads that time from the replica, through the real client", async () => {
    const { client, ledger } = setup()
    const before = BigInt(Date.now()) * 1_000_000n
    const sent = await stamped(client, ledger, read())
    // The in-memory replica runs on this process's clock.
    expect(sent.created_at_time).toBeGreaterThanOrEqual(before)
    expect(sent.created_at_time).toBeLessThan(before + 60_000_000_000n)
  })

  it("hands back a transfer that has its time as it is, and asks for no time", async () => {
    const { ledger } = setup()
    const never = {
      time: () => Promise.reject(new Error("asked for the time")),
    }
    const sent = { ...read(), created_at_time: 5n }
    // The same object: a re-send must send the very argument that was sent.
    expect(await stamped(never, ledger, sent)).toBe(sent)
  })
})
