import { principal, serviceMethods } from "@candid-core/schema"
import { encodeArgs } from "@candid-core/schema/codec"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"
import { actor as icrc1Actor } from "../canisters/icrc1.ts"
import type { MethodInfo } from "../interface/types.ts"
import { fromHex, sha256Hex, toHex } from "../lib/hex.ts"
import { CallPreview } from "./CallPreview.tsx"

afterEach(cleanup)

const transfer: MethodInfo = (() => {
  const found = serviceMethods(icrc1Actor).get("icrc1_transfer")
  if (found === undefined) throw new Error("icrc1_transfer")
  return found
})()

const value = {
  to: { owner: principal("2vxsx-fae"), subaccount: null },
  fee: null,
  memo: null,
  from_subaccount: null,
  created_at_time: null,
  amount: 150_000_000n,
}

function encoded(values: readonly unknown[]): Uint8Array {
  const result = encodeArgs(transfer.args, values)
  if (!result.ok) throw new Error(result.issues[0]?.message)
  return result.bytes
}

describe("CallPreview", () => {
  it("shows the Candid text, size, SHA-256 and hex of the exact bytes", async () => {
    const bytes = encoded([value])
    render(<CallPreview method={transfer} values={[value]} bytes={bytes} />)

    const text = screen.getByLabelText("Arguments as Candid text").textContent
    expect(text).toContain("amount = 150_000_000 : nat")
    expect(text).toContain('owner = principal "2vxsx-fae"')
    expect(screen.getByText(`${bytes.length} bytes`)).toBeTruthy()
    expect(screen.getByText("icrc1_transfer")).toBeTruthy()
    expect(screen.getByText("update").className).toContain("badge-update")
    expect(
      screen.getByText(`Argument bytes (hex, ${bytes.length} bytes)`)
    ).toBeTruthy()
    expect(screen.getByText(toHex(bytes))).toBeTruthy()

    const digest = await sha256Hex(bytes)
    await waitFor(() =>
      expect(screen.getByTestId("call-sha256").textContent).toBe(digest)
    )
  })

  it("renders 'computing…' on the server, so hydration matches", () => {
    const bytes = encoded([value])
    const html = renderToString(
      <CallPreview method={transfer} values={[value]} bytes={bytes} />
    )
    expect(html).toContain("computing…")
    expect(html).toContain(toHex(bytes))
  })

  it("prints the bytes, and warns when the form's values say otherwise", () => {
    const bytes = encoded([value])
    render(
      <CallPreview
        method={transfer}
        values={[{ ...value, amount: 1n }]}
        bytes={bytes}
      />
    )
    expect(screen.getByText(/values and the encoded bytes differ/)).toBeTruthy()
    expect(
      screen.getByLabelText("Arguments as Candid text").textContent
    ).toContain("amount = 150_000_000 : nat")
  })

  it("warns when the bytes are not the method's arguments", () => {
    const empty = fromHex("4449444c0000")
    if (empty === undefined) throw new Error("hex")
    render(<CallPreview method={transfer} values={[value]} bytes={empty} />)
    expect(screen.getByText(/do not decode as icrc1_transfer/)).toBeTruthy()
  })
})
