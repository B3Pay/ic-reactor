import { principal } from "@meantjs/schema"
import { createTestClient } from "@ic-reactor/core/testing"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Actor as Ledger } from "../canisters/icrc1.ts"
import { ErrorPanel } from "./ErrorPanel.tsx"
import { prepareCall } from "./prepare.ts"
import { canisterOf } from "./useCanisterHandle.ts"
import {
  CKBTC_LEDGER,
  methodOf,
  transferArg,
  typedInterface,
} from "./testing/fixtures.ts"

vi.mock("../values/ReplyView.tsx", () => import("./testing/doubles.tsx"))

const iface = typedInterface(CKBTC_LEDGER)
const transfer = methodOf(iface, "icrc1_transfer")

let dispose: (() => void) | undefined
afterEach(() => {
  cleanup()
  dispose?.()
})

/** The error a transfer meets when the ledger rejects it with `code`. */
async function rejectedWith(code: 3 | 5): Promise<unknown> {
  const test = createTestClient({ network: "ic" })
  dispose = () => test.client.dispose()
  test.mock<Ledger>(iface.actor, CKBTC_LEDGER, {
    icrc1_transfer: () =>
      test.reject(code, `refused with ${code}: the whole reason`),
  })
  const call = prepareCall(transfer, [transferArg(principal("aaaaa-aa"), 1n)])
  try {
    await test.client
      .mutationOptions(canisterOf(test.client, iface), transfer.name)
      .mutationFn(call?.vars)
  } catch (error) {
    return error
  }
  throw new Error("the transfer was not rejected")
}

describe("ErrorPanel", () => {
  it("says a trapped write MAY HAVE EXECUTED, with the reject code and the full reject text", async () => {
    const onReadBack = vi.fn()
    render(
      <ErrorPanel
        error={await rejectedWith(5)}
        method={transfer}
        onReadBack={onReadBack}
      />
    )
    expect(screen.getByText("MAY HAVE EXECUTED")).toBeTruthy()
    expect(
      screen.getByText(
        /5 CANISTER_ERROR: The canister rejected or trapped, maybe after changing state/
      )
    ).toBeTruthy()
    expect(
      screen.getByText(/refused with 5: the whole reason/, { selector: "dd" })
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Read the state back" }))
    expect(onReadBack).toHaveBeenCalledOnce()
  })

  it("says a reject code 3 certainly did not execute, and offers no read-back", async () => {
    render(
      <ErrorPanel
        error={await rejectedWith(3)}
        method={transfer}
        onReadBack={() => {}}
      />
    )
    expect(screen.getByText("Certainly not executed")).toBeTruthy()
    expect(
      screen.getByText(/Rejected before any canister code ran/)
    ).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: "Read the state back" })
    ).toBeNull()
  })

  it("never says a re-send that did not run settled anything, and keeps the read-back", async () => {
    const onReadBack = vi.fn()
    render(
      <ErrorPanel
        error={await rejectedWith(3)}
        method={transfer}
        earlierUnknown
        onReadBack={onReadBack}
      />
    )
    expect(
      screen.getByText("The re-send certainly did not execute")
    ).toBeTruthy()
    expect(
      screen.getByText(/the first send, which may still have executed/)
    ).toBeTruthy()
    expect(screen.queryByText("Certainly not executed")).toBeNull()
    expect(screen.queryByText(/fix what is wrong and send again/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Read the state back" }))
    expect(onReadBack).toHaveBeenCalledOnce()
  })

  it("shows anything else as an unexpected error, as text", () => {
    render(<ErrorPanel error={new TypeError("<b>not markup</b>")} />)
    expect(screen.getByText("Unexpected error")).toBeTruthy()
    expect(screen.getByText("<b>not markup</b>")).toBeTruthy()
  })
})
