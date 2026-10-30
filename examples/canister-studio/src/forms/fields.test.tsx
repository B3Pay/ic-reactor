import { c, principal, serviceMethods, type AnySchema } from "@meantjs/schema"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  actor as icrc1Actor,
  type TransferArg as TransferArgValue,
} from "../canisters/icrc1.ts"
import type { MethodInfo } from "../interface/types.ts"
import { toHex } from "../lib/hex.ts"
import { heuristicHints } from "./hints.ts"
import { MethodForm, type MethodFormProps } from "./MethodForm.tsx"

const CKBTC = { decimals: 8, symbol: "ckBTC" }
const TARGET = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")
const transfer = serviceMethods(icrc1Actor).get("icrc1_transfer") as MethodInfo
const Loop: AnySchema = c.rec(() => c.record({ x: Loop }))

afterEach(cleanup)

const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } })

const method = (
  args: readonly AnySchema[],
  extra: Partial<MethodFormProps["method"]> = {}
): MethodFormProps["method"] => ({
  name: "m",
  mode: "query",
  args,
  results: [],
  ...extra,
})

function renderForm(
  props: Partial<MethodFormProps> & Pick<MethodFormProps, "method">
) {
  const onSubmit = vi.fn()
  const view = render(
    <MethodForm submitLabel="Go" onSubmit={onSubmit} {...props} />
  )
  const submitted = () =>
    (onSubmit.mock.calls[0]?.[0] as { values: unknown[] } | undefined)?.values
  return { ...view, onSubmit, submitted }
}

function openJson(container: HTMLElement): HTMLTextAreaElement {
  const details = container.querySelector(
    "details.form-json"
  ) as HTMLDetailsElement
  act(() => {
    details.open = true
    details.dispatchEvent(new Event("toggle"))
  })
  return screen.getByRole("textbox", {
    name: "An array with one value per argument",
  }) as HTMLTextAreaElement
}

describe("memo", () => {
  it.each([
    ["hex", "0a1b"],
    ["base64", "Chs="],
  ])(
    "keeps %s picked on an empty memo and sends those bytes",
    (format, typed) => {
      const { container, submitted } = renderForm({
        method: transfer,
        hints: heuristicHints({ units: CKBTC }),
        submitLabel: "Send",
      })
      fireEvent.click(screen.getByRole("switch", { name: "memo" }))
      const memo = within(
        container.querySelector(
          '[data-path="$args[0].memo"].form-field'
        ) as HTMLElement
      )
      // A memo starts as text.
      expect(
        memo.getByRole("radio", { name: "text" }).getAttribute("aria-checked")
      ).toBe("true")
      fireEvent.click(memo.getByRole("radio", { name: format }))
      expect(
        memo.getByRole("radio", { name: format }).getAttribute("aria-checked")
      ).toBe("true")
      const input = memo.getByRole("textbox", { name: "memo" })
      type(input, typed)
      expect(memo.getByText(/^2 bytes/)).toBeTruthy()
      // Cleared, it stays in the format picked.
      type(input, "")
      type(input, typed)
      expect(
        memo.getByRole("radio", { name: format }).getAttribute("aria-checked")
      ).toBe("true")

      type(screen.getByRole("combobox", { name: "owner" }), TARGET)
      type(screen.getByRole("textbox", { name: "amount" }), "1")
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
      const [value] = (submitted() ?? []) as TransferArgValue[]
      expect(value?.memo && toHex(value.memo)).toBe("0a1b")
    }
  )
})

describe("blobs", () => {
  it("switches bytes with a byte order mark to text without dropping it", () => {
    const { submitted } = renderForm({
      method: method([c.blob()]),
      initialValues: [Uint8Array.of(0xef, 0xbb, 0xbf, 0x41)],
    })
    fireEvent.click(screen.getByRole("radio", { name: "text" }))
    expect(screen.getByText("4 bytes · hex efbbbf41")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Go" }))
    expect(toHex(submitted()?.[0] as Uint8Array)).toBe("efbbbf41")
  })

  it("shows a line break in a multi-line box, never a one-line input", () => {
    renderForm({
      method: method([c.record({ b: c.blob() })]),
      initialValues: [{ b: new TextEncoder().encode("a\nb") }],
    })
    fireEvent.click(screen.getByRole("radio", { name: "text" }))
    const box = screen.getByRole("textbox", { name: "b" })
    expect(box.tagName).toBe("TEXTAREA")
    expect((box as HTMLTextAreaElement).value).toBe("a\nb")
  })

  it("keeps the caret when typing swaps the input for a multi-line box", () => {
    renderForm({ method: method([c.record({ b: c.blob() })]) })
    const input = screen.getByRole("textbox", { name: "b" })
    input.focus()
    type(input, "ab".repeat(49))
    const box = screen.getByRole("textbox", { name: "b" })
    expect(box.tagName).toBe("TEXTAREA")
    expect(document.activeElement).toBe(box)
  })
})

describe("text", () => {
  it("shows JSON text with a line break in a multi-line box and sends it whole", () => {
    const { container, submitted } = renderForm({
      method: method([c.record({ t: c.text })]),
    })
    type(openJson(container), JSON.stringify([{ t: "line1\nline2" }]))
    fireEvent.click(screen.getByRole("button", { name: "Load into the form" }))
    const box = screen.getByRole("textbox", { name: "t" })
    expect(box.tagName).toBe("TEXTAREA")
    type(box, "line1\nline2!")
    fireEvent.click(screen.getByRole("button", { name: "Go" }))
    expect(submitted()).toEqual([{ t: "line1\nline2!" }])
  })
})

describe("token amounts", () => {
  it.each([
    ["1,000,000", "0.01"],
    ["0x5f5e100", "1"],
  ])("shows raw %s in token units as %s", (raw, shown) => {
    renderForm({ method: transfer, hints: heuristicHints({ units: CKBTC }) })
    fireEvent.click(screen.getByRole("radio", { name: "base units" }))
    type(screen.getByRole("textbox", { name: "amount" }), raw)
    fireEvent.click(screen.getByRole("radio", { name: "ckBTC" }))
    expect(
      (screen.getByRole("textbox", { name: "amount" }) as HTMLInputElement)
        .value
    ).toBe(shown)
  })
})

describe("argument labels", () => {
  it("labels a lone argument, with its type", () => {
    const { container } = renderForm({ method: method([c.nat64]) })
    expect(screen.getByLabelText("argument").tagName).toBe("INPUT")
    expect(container.querySelector(".form-type")?.textContent).toBe("nat64")
  })

  it("labels arguments by their .did names, else by their position", () => {
    renderForm({
      method: method([c.nat], { argNames: ["sequence_number"] }),
    })
    expect(screen.getByLabelText("sequence_number")).toBeTruthy()
    cleanup()
    renderForm({ method: method([c.nat, c.principal]) })
    expect(screen.getByLabelText("argument 1")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Go" }))
    // The summary names the argument as its label does.
    expect(screen.getByRole("alert").textContent).toContain(
      "argument 2: required"
    )
  })
})

describe("long vecs", () => {
  const vecMethod = method([c.record({ to: c.vec(c.principal) })])
  const thirty = () => {
    const values = Array.from({ length: 30 }, () => TARGET as string)
    values[25] = "nope"
    return [{ to: values }]
  }

  it("shows an issue past the first page, and focuses it on submit", () => {
    const { container, onSubmit } = renderForm({
      method: vecMethod,
      initialValues: thirty(),
    })
    fireEvent.click(screen.getByRole("button", { name: "Go" }))
    expect(onSubmit).not.toHaveBeenCalled()
    const item = container.querySelector<HTMLInputElement>(
      '[data-path="$args[0].to[25]"] input'
    )
    expect(item?.getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(item)
    expect(container.querySelectorAll(".field-error").length).toBe(1)

    // The summary's link lands there too.
    screen.getByRole("button", { name: "Go" }).focus()
    fireEvent.click(screen.getByRole("button", { name: "to[25]" }))
    expect(document.activeElement).toBe(item)

    // Corrected, it stays where the reader is typing.
    type(item!, TARGET as string)
    const after = container.querySelector<HTMLInputElement>(
      '[data-path="$args[0].to[25]"] input'
    )
    expect(after).toBe(item)
    expect(after?.getAttribute("aria-invalid")).not.toBe("true")
    expect(document.activeElement).toBe(item)
    expect(
      screen.getByRole("button", { name: /Show 4 more \(4 hidden\)/ })
    ).toBeTruthy()
  })
})

describe("types with no values", () => {
  it("offers no switch, item or arm a value of one would need", () => {
    renderForm({
      method: method([c.record({ o: c.opt(Loop), n: c.nat })]),
    })
    const o = screen.getByRole("switch", { name: "o" }) as HTMLInputElement
    expect(o.disabled).toBe(true)
    fireEvent.click(o)
    expect(o.checked).toBe(false)
    cleanup()
    renderForm({ method: method([c.vec(Loop)]) })
    const add = screen.getByRole("button", {
      name: "Add item",
    }) as HTMLButtonElement
    expect(add.disabled).toBe(true)
  })

  it("loads JSON for one as the value that exists, and lists what it replaced", () => {
    const { container, submitted } = renderForm({
      method: method([c.variant({ a: c.nat, loop: Loop })]),
    })
    type(openJson(container), '[{"loop": {}}]')
    fireEvent.click(screen.getByRole("button", { name: "Load into the form" }))
    expect(screen.getByText(/1 value was not read as given/)).toBeTruthy()
    expect(
      screen.getByText(/the arm "loop" has no values; the default arm is used/)
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Go" }))
    expect(submitted()).toEqual([{ tag: "a", value: 0n }])
  })
})

describe("JSON import", () => {
  it("says which values it replaced rather than 'Loaded into the form.'", () => {
    const { container } = renderForm({
      method: method([
        c.variant({
          Approve: c.record({ amount: c.nat }),
          Transfer: c.record({ amount: c.nat }),
        }),
      ]),
    })
    type(openJson(container), '{"Tranfser": {"amount": "5"}}')
    fireEvent.click(screen.getByRole("button", { name: "Load into the form" }))
    expect(screen.queryByText("Loaded into the form.")).toBeNull()
    expect(
      screen.getByText(
        /unknown variant tag "Tranfser"; the default arm is used/
      )
    ).toBeTruthy()
  })
})

describe("keyboard focus", () => {
  it("keeps the focus on the submit button while a call is in flight", () => {
    const props = {
      method: transfer,
      submitLabel: "Send",
      onSubmit: () => {},
    } satisfies MethodFormProps
    const { rerender } = render(<MethodForm {...props} />)
    const button = screen.getByRole("button", { name: "Send" })
    button.focus()
    rerender(<MethodForm {...props} busy />)
    // A disabled button drops the focus to the page; aria-disabled keeps it.
    expect((button as HTMLButtonElement).disabled).toBe(false)
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(document.activeElement).toBe(button)
  })

  it("moves the focus from a field to the submit button before the call starts", () => {
    // Enter in a field submits, and the call disables the fields: a browser
    // drops the focus of a field the moment its fieldset is disabled, so it
    // must be on the button by the time the parent hears of the submit.
    let focusedAtSubmit: Element | null = null
    const { container } = renderForm({
      method: method([c.nat]),
      initialValues: [5n],
      onSubmit: () => {
        focusedAtSubmit = document.activeElement
      },
    })
    const field = container.querySelector<HTMLInputElement>(
      "fieldset.form-fields input"
    )!
    field.focus()
    fireEvent.submit(field.form!)
    expect(focusedAtSubmit).toBe(screen.getByRole("button", { name: "Go" }))

    // A submit refused for an issue leaves the focus to the issue.
    type(field, "x")
    field.focus()
    focusedAtSubmit = null
    fireEvent.submit(field.form!)
    expect(focusedAtSubmit).toBeNull()
    expect(document.activeElement).toBe(field)
  })

  it("hands the submit button to a parent that restores the focus", () => {
    const ref = { current: null as HTMLButtonElement | null }
    render(
      <MethodForm
        method={transfer}
        submitLabel="Send"
        submitRef={ref}
        onSubmit={() => {}}
      />
    )
    expect(ref.current).toBe(screen.getByRole("button", { name: "Send" }))
  })

  it("keeps the focus on a vec's buttons as items move and go", () => {
    const { container } = renderForm({
      method: method([c.record({ xs: c.vec(c.nat) })]),
      initialValues: [{ xs: [1n, 2n, 3n] }],
    })
    // Each item's buttons: move up, move down, remove.
    const buttons = (i: number) =>
      within(
        container.querySelectorAll<HTMLElement>(".form-list-item")[i] ??
          document.body
      ).getAllByRole("button") as HTMLButtonElement[]
    const input = (i: number) =>
      container.querySelectorAll<HTMLInputElement>(".form-list-item input")[i]

    const down = buttons(1)[1] as HTMLButtonElement
    down.focus()
    fireEvent.click(down)
    // The item is now last: its "down" is dimmed, not disabled, and focused.
    const moved = buttons(2)[1] as HTMLButtonElement
    expect(input(2)?.value).toBe("2")
    expect(document.activeElement).toBe(moved)
    expect(moved.getAttribute("aria-disabled")).toBe("true")
    expect(moved.disabled).toBe(false)
    fireEvent.click(moved)
    expect(input(2)?.value).toBe("2")

    // Removing the last item focuses the one before it; removing all, Add.
    fireEvent.click(buttons(2)[2] as HTMLButtonElement)
    expect(document.activeElement).toBe(buttons(1)[2])
    fireEvent.click(screen.getByRole("button", { name: "Remove all" }))
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Add item" })
    )
  })

  it("moves the focus to the first item 'Show more' revealed", () => {
    const { container } = renderForm({
      method: method([c.record({ xs: c.vec(c.nat) })]),
      initialValues: [{ xs: Array.from({ length: 25 }, (_, i) => BigInt(i)) }],
    })
    fireEvent.click(screen.getByRole("button", { name: /Show 5 more/ }))
    expect(document.activeElement).toBe(
      container.querySelector('[data-path="$args[0].xs[20]"] input')
    )
  })
})
