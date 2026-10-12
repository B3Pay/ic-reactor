import {
  c,
  principal,
  serviceMethods,
  type AnySchema,
} from "@candid-core/schema"
import { encodeArgs } from "@candid-core/schema/codec"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  actor as icrc1Actor,
  TransferArg,
  type TransferArg as TransferArgValue,
} from "../canisters/icrc1.ts"
import type { MethodInfo } from "../interface/types.ts"
import { toHex } from "../lib/hex.ts"
import { heuristicHints } from "./hints.ts"
import { MethodForm } from "./MethodForm.tsx"
import { TypedForm } from "./TypedForm.tsx"

const CKBTC = { decimals: 8, symbol: "ckBTC" }
const ME = "2vxsx-fae"
const TARGET = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")

function icrc1Method(name: string): MethodInfo {
  const m = serviceMethods(icrc1Actor).get(name)
  if (m === undefined) throw new Error(`no ${name}`)
  return m
}
const transfer = icrc1Method("icrc1_transfer")

const at = (iso: string) => BigInt(Date.parse(iso)) * 1_000_000n
const MOUNTED = "2026-10-12T02:31:05.123Z"
const SENT = "2026-10-12T02:32:00.000Z"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } })

describe("MethodForm", () => {
  it("fills an ICRC-1 transfer and submits the exact value and bytes", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(MOUNTED))
    const onSubmit = vi.fn()
    render(
      <MethodForm
        method={transfer}
        hints={heuristicHints({ units: CKBTC })}
        submitLabel="Send"
        callerPrincipal={ME}
        onSubmit={onSubmit}
      />
    )

    type(screen.getByRole("combobox", { name: "owner" }), TARGET)
    type(screen.getByRole("textbox", { name: "amount" }), "1.5")
    expect(
      screen.getByText("= 150,000,000 base units (nat, 8 decimals)")
    ).toBeTruthy()

    // created_at_time was switched on after mount, at the time of mounting.
    const dedupe = screen.getByRole("switch", {
      name: "Deduplicate with created_at_time",
    })
    expect((dedupe as HTMLInputElement).checked).toBe(true)
    const time = screen.getByRole("textbox", {
      name: "created_at_time",
    }) as HTMLInputElement
    expect(time.value).toBe(at(MOUNTED).toString())

    // A memo typed as text goes out as its UTF-8 bytes.
    fireEvent.click(screen.getByRole("switch", { name: "memo" }))
    type(screen.getByRole("textbox", { name: "memo" }), "hi")
    expect(screen.getByText(/^2 bytes/)).toBeTruthy()

    vi.setSystemTime(new Date(SENT))
    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    const expected: TransferArgValue = {
      to: { owner: TARGET, subaccount: null },
      fee: null,
      memo: Uint8Array.of(0x68, 0x69),
      from_subaccount: null,
      // Set again when sending, not left at the time of mounting.
      created_at_time: at(SENT),
      amount: 150_000_000n,
    }
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const call = onSubmit.mock.calls[0]?.[0] as {
      values: unknown[]
      vars: unknown
      bytes: Uint8Array
    }
    expect(call.values).toEqual([expected])
    expect(call.vars).toEqual(expected)
    const encoded = encodeArgs([TransferArg], [expected])
    expect(encoded.ok && toHex(call.bytes)).toBe(
      encoded.ok && toHex(encoded.bytes)
    )
    expect(toHex(call.bytes)).toBe(
      "4449444c066c06fbca0101c6fcb60204ba89e5c20402a2de94eb060282f3f3910c05d8a3" +
        "8ca80d7d6c02b3b0dac30368ad86ca8305026e036d7b6e7d6e780100010a000000000000" +
        "0002010100000102686900010040fa8b6ea7dd1880a3c347"
    )
    expect(time.value).toBe(at(SENT).toString())
  })

  it("names what is wrong, refuses to submit, and focuses the field", () => {
    const onSubmit = vi.fn()
    render(
      <MethodForm
        method={transfer}
        hints={heuristicHints({ units: CKBTC })}
        submitLabel="Send"
        onSubmit={onSubmit}
      />
    )
    const owner = screen.getByRole("combobox", { name: "owner" })
    // Untouched: no field error yet, but the reason beside the button says it.
    expect(screen.queryByText("required")).toBeNull()
    expect(screen.getByText("to.owner: required")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toContain(
      "1 field needs attention"
    )
    expect(screen.getByText("required")).toBeTruthy()
    expect(owner.getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(owner)
  })

  it("refuses an amount it cannot hold exactly, never rounding", () => {
    const onSubmit = vi.fn()
    render(
      <MethodForm
        method={transfer}
        hints={heuristicHints({ units: CKBTC })}
        submitLabel="Send"
        callerPrincipal={ME}
        onSubmit={onSubmit}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Use mine" }))
    const amount = screen.getByRole("textbox", { name: "amount" })
    type(amount, "1.123456789")
    fireEvent.blur(amount)
    expect(
      screen.getByText(
        /has 9 fraction digits, more than the token's 8 decimals/
      )
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(onSubmit).not.toHaveBeenCalled()

    // The raw toggle edits base units directly.
    fireEvent.click(screen.getByRole("radio", { name: "base units" }))
    type(screen.getByRole("textbox", { name: "amount" }), "7")
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const [{ values }] = onSubmit.mock.calls[0] as [
      { values: TransferArgValue[] },
    ]
    expect(values[0]?.amount).toBe(7n)
    expect(values[0]?.to.owner).toBe(ME)
  })

  it("shows the last call's issues at their fields until the next edit", () => {
    render(
      <MethodForm
        method={transfer}
        submitLabel="Send"
        externalIssues={[
          {
            path: "$args[0].to.owner",
            code: "invalid_type",
            message: "expected a Principal",
          },
        ]}
        onSubmit={() => {}}
      />
    )
    expect(screen.getAllByText("expected a Principal").length).toBeGreaterThan(
      0
    )
    type(screen.getByRole("combobox", { name: "owner" }), TARGET)
    expect(screen.queryByText("expected a Principal")).toBeNull()
  })

  it("disables submitting with a reason, and while busy", () => {
    const { rerender } = render(
      <MethodForm
        method={transfer}
        submitLabel="Send"
        disabledReason="Sign in to send writes"
        onSubmit={() => {}}
      />
    )
    const button = screen.getByRole("button", { name: "Send" })
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(screen.getByText("Sign in to send writes")).toBeTruthy()
    rerender(
      <MethodForm
        method={transfer}
        submitLabel="Send"
        busy
        onSubmit={() => {}}
      />
    )
    expect(
      screen.getByRole("button", { name: "Send" }).getAttribute("aria-disabled")
    ).toBe("true")
    // A disabled fieldset disables every control inside it.
    expect(
      screen.getByRole("combobox", { name: "owner" }).matches(":disabled")
    ).toBe(true)
  })

  it("picks variant arms with the keyboard and pages long vecs", () => {
    const method: MethodInfo = {
      name: "m",
      mode: "update",
      args: [c.variant({ A: c.nat, B: c.text, C: c.null }), c.vec(c.nat8)],
      results: [],
    }
    const onSubmit = vi.fn()
    render(
      <MethodForm method={method} submitLabel="Call" onSubmit={onSubmit} />
    )
    const radios = screen.getAllByRole("radio")
    const checked = radios.find(
      (r) => r.getAttribute("aria-checked") === "true"
    )
    if (checked === undefined) throw new Error("an arm is picked")
    fireEvent.keyDown(checked, { key: "ArrowRight" })
    const now = screen
      .getAllByRole("radio")
      .find((r) => r.getAttribute("aria-checked") === "true")
    expect(now).not.toBe(checked)
    expect(document.activeElement).toBe(now)

    type(screen.getByRole("spinbutton", { name: "Items to add" }), "25")
    fireEvent.click(screen.getByRole("button", { name: "Add 25" }))
    expect(screen.getByText("25 items")).toBeTruthy()
    expect(
      screen.getAllByRole("button", { name: /^Remove argument 2\[/ }).length
    ).toBe(20)
    fireEvent.click(screen.getByRole("button", { name: /Show 5 more/ }))
    expect(
      screen.getAllByRole("button", { name: /^Remove argument 2\[/ }).length
    ).toBe(25)
    fireEvent.click(screen.getByRole("button", { name: "Call" }))
    const [{ values }] = onSubmit.mock.calls[0] as [{ values: unknown[] }]
    expect((values[1] as number[]).length).toBe(25)
  })

  it("marks a method whose argument has no values as not callable", () => {
    const Loop: AnySchema = c.rec(() => c.record({ next: Loop }))
    const onSubmit = vi.fn()
    render(
      <MethodForm
        method={{ name: "spin", mode: "update", args: [Loop], results: [] }}
        submitLabel="Call"
        onSubmit={onSubmit}
      />
    )
    expect(screen.getByText(/No value exists for this type/)).toBeTruthy()
    const button = screen.getByRole("button", { name: "Call" })
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(
      screen.getByText(
        "This method cannot be called: an argument's type has no values."
      )
    ).toBeTruthy()
  })

  it("loads arguments from JSON", () => {
    const onSubmit = vi.fn()
    const { container } = render(
      <MethodForm method={transfer} submitLabel="Send" onSubmit={onSubmit} />
    )
    const details = container.querySelector(
      "details.form-json"
    ) as HTMLDetailsElement
    act(() => {
      details.open = true
      details.dispatchEvent(new Event("toggle"))
    })
    const box = screen.getByRole("textbox", {
      name: "An array with one value per argument",
    })
    expect((box as HTMLTextAreaElement).value).toContain('"amount": "0"')
    type(
      box,
      JSON.stringify([
        {
          to: { owner: TARGET, subaccount: null },
          fee: null,
          memo: null,
          from_subaccount: null,
          created_at_time: "1760236265123456789",
          amount: "12345678901234567890",
        },
      ])
    )
    fireEvent.click(screen.getByRole("button", { name: "Load into the form" }))
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    const [{ values }] = onSubmit.mock.calls[0] as [
      { values: TransferArgValue[] },
    ]
    expect(values[0]?.amount).toBe(12345678901234567890n)
    expect(values[0]?.created_at_time).toBe(1760236265123456789n)
  })

  it("renders the same HTML on the server and hydrates without a mismatch", async () => {
    const element = (
      <MethodForm
        method={transfer}
        hints={heuristicHints({ units: CKBTC })}
        submitLabel="Send"
        callerPrincipal={ME}
        onSubmit={() => {}}
      />
    )
    const html = renderToString(element)
    expect(renderToString(element)).toBe(html)
    const container = document.createElement("div")
    container.innerHTML = html
    document.body.append(container)
    const errors: unknown[] = []
    await act(async () => {
      hydrateRoot(container, element, {
        onRecoverableError: (e) => errors.push(e),
      })
    })
    expect(errors).toEqual([])
    container.remove()
  })
})

describe("TypedForm", () => {
  it("hands onSubmit a typed value and the method's argument bytes", () => {
    const initial: TransferArgValue = {
      to: { owner: TARGET, subaccount: null },
      fee: 10n,
      memo: null,
      from_subaccount: null,
      created_at_time: 1n,
      amount: 5n,
    }
    const onSubmit =
      vi.fn<(value: TransferArgValue, bytes: Uint8Array) => void>()
    render(
      <TypedForm<TransferArgValue>
        schema={TransferArg}
        label="Transfer"
        initialValue={initial}
        submitLabel="Send"
        onSubmit={onSubmit}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    const [value, bytes] = onSubmit.mock.calls[0] ?? []
    expect(value).toEqual(initial)
    const encoded = encodeArgs([TransferArg], [initial])
    expect(encoded.ok && bytes).toEqual(encoded.ok && encoded.bytes)
  })
})
