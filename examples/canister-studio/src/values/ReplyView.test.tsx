import {
  c,
  principal,
  serviceMethods,
  type AnyFieldSchema,
} from "@meantjs/schema"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { actor as icpActor } from "../canisters/icp_ledger.ts"
import { actor as icrc1Actor } from "../canisters/icrc1.ts"
import type { MethodInfo } from "../interface/types.ts"
import { ErrValueView } from "./ErrValueView.tsx"
import { utf8Preview } from "./leaves.tsx"
import { ReplyView } from "./ReplyView.tsx"
import { renderInRouter } from "./test-router.tsx"
import { showsAmounts } from "./tree.tsx"

afterEach(cleanup)

const ICP = { decimals: 8, symbol: "ICP" } as const
const LEDGER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

function method(actor: typeof icrc1Actor, name: string): MethodInfo {
  const found = serviceMethods(actor).get(name)
  if (found === undefined) throw new Error(`no method ${name}`)
  return found
}
const icrc1 = (name: string): MethodInfo => method(icrc1Actor, name)

/** One value of `schema`, as a reply of one result: how every page views a value. */
const one = (schema: AnyFieldSchema, value: unknown) => (
  <ReplyView
    method={{ name: "value", mode: "query", args: [], results: [schema] }}
    reply={value}
  />
)

function view(name: "Tree" | "Candid" | "JSON"): void {
  fireEvent.click(screen.getByRole("button", { name }))
}

describe("ReplyView", () => {
  it('says "No reply value" for a method without results', () => {
    render(
      <ReplyView
        method={{ name: "notify", mode: "oneway", args: [], results: [] }}
        reply={undefined}
      />
    )
    expect(screen.getByText(/No reply value/)).toBeTruthy()
  })

  it("shows the Ok payload an Ok/Err method resolved with", () => {
    render(
      <ReplyView method={icrc1("icrc1_transfer")} reply={1_234n} units={ICP} />
    )
    expect(screen.getByText("Ok").className).toContain("badge-ok")
    // A block index, not an amount: no units even when the ledger's are given,
    // and no "Raw amounts" switch that would change nothing.
    expect(screen.getByText("1,234")).toBeTruthy()
    expect(screen.queryByLabelText("Raw amounts")).toBeNull()

    view("Candid")
    expect(screen.getByLabelText("reply").textContent).toBe(
      "(variant { Ok = 1_234 : nat })"
    )
    view("JSON")
    expect(screen.getByLabelText("reply").textContent).toBe('"1234"')
  })

  it("formats an amount reply in units, raw on hover and on the switch", () => {
    render(
      <ReplyView
        method={icrc1("icrc1_balance_of")}
        reply={123_456_789n}
        units={ICP}
      />
    )
    const amount = screen.getByText("1.23456789 ICP")
    expect(amount.getAttribute("title")).toBe("123,456,789 base units (nat)")
    fireEvent.click(screen.getByLabelText("Raw amounts"))
    expect(screen.getByText("123,456,789")).toBeTruthy()
    expect(screen.queryByText("1.23456789 ICP")).toBeNull()
  })

  it("shows a vec of records as a table paged at 25", () => {
    const standards = Array.from({ length: 30 }, (_, i) => ({
      name: `ICRC-${i}`,
      url: `https://example.org/${i}`,
    }))
    render(
      <ReplyView
        method={icrc1("icrc1_supported_standards")}
        reply={standards}
      />
    )
    const table = screen.getByRole("table")
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent)
    // Columns follow the record's field order (Candid label-id order).
    expect(headers).toEqual(["#", "url", "name"])
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 25)
    expect(screen.getByText("30 items")).toBeTruthy()
    expect(screen.getByText("1–25 of 30")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      1 + 5
    )
    expect(screen.getByText("ICRC-29")).toBeTruthy()
    expect(screen.getByText("26–30 of 30")).toBeTruthy()
    expect(
      (screen.getByRole("button", { name: "Next" }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })

  it("shows a vec of (text, value) pairs as a key/value list", () => {
    render(
      <ReplyView
        method={icrc1("icrc1_metadata")}
        reply={[
          ["icrc1:symbol", { tag: "Text", value: "ICP" }],
          ["icrc1:fee", { tag: "Nat", value: 10_000n }],
        ]}
        units={ICP}
      />
    )
    expect(screen.queryByRole("table")).toBeNull()
    const symbol = screen.getByText("icrc1:symbol").closest("dt")
    expect(symbol?.nextElementSibling?.textContent).toContain("ICP")
    // The Nat under "icrc1:fee" is a fee: shown in the ledger's units.
    expect(screen.getByText("0.0001 ICP")).toBeTruthy()
  })

  it("renders canister text as text, never as HTML", () => {
    const { container } = render(
      <ReplyView
        method={icrc1("icrc1_name")}
        reply={'<img src="x" onerror="alert(1)">'}
      />
    )
    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText('<img src="x" onerror="alert(1)">')).toBeTruthy()
  })

  it("links a canister id to its page, and not a user's principal", async () => {
    await renderInRouter(
      <>
        <ReplyView
          method={icrc1("icrc1_minting_account")}
          reply={{ owner: principal(LEDGER_ID), subaccount: null }}
        />
        {one(c.principal, principal("2vxsx-fae"))}
      </>
    )
    const link = await screen.findByRole("link", {
      name: `Open as canister: ${LEDGER_ID}`,
    })
    expect(link.getAttribute("href")).toBe(`/canister/${LEDGER_ID}`)
    expect(screen.getAllByRole("link")).toHaveLength(1)
    expect(screen.getByText("none")).toBeTruthy()
    expect(
      screen.getAllByRole("button", { name: "Copy principal" })
    ).toHaveLength(2)
  })

  it("calls onOpenCanister instead of linking when given", () => {
    const open = vi.fn()
    render(
      <ReplyView
        method={icrc1("icrc1_minting_account")}
        reply={{ owner: principal(LEDGER_ID), subaccount: null }}
        onOpenCanister={open}
      />
    )
    fireEvent.click(
      screen.getByRole("button", { name: `Open as canister: ${LEDGER_ID}` })
    )
    expect(open).toHaveBeenCalledWith(LEDGER_ID)
  })

  it("links an archive callback to its canister's method", async () => {
    const archive = "qjdve-lqaaa-aaaaa-aaaeq-cai"
    await renderInRouter(
      <ReplyView
        method={method(icpActor, "query_blocks")}
        reply={{
          certificate: null,
          blocks: [],
          chain_length: 27_000_000n,
          first_block_index: 26_999_000n,
          archived_blocks: [
            {
              callback: { principal: principal(archive), method: "get_blocks" },
              start: 0n,
              length: 2_000n,
            },
          ],
        }}
      />
    )
    const link = await screen.findByRole("link", { name: /^Open method/ })
    expect(link.getAttribute("href")).toBe(
      `/canister/${archive}?method=get_blocks`
    )
    const headers = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .map((th) => th.textContent)
    expect(headers).toEqual(["#", "callback", "start", "length"])
    expect(screen.getByText("empty vec")).toBeTruthy()
  })

  it("shows several results as a tuple", () => {
    render(
      <ReplyView
        method={{
          name: "pair",
          mode: "query",
          args: [],
          results: [c.nat, c.text],
        }}
        reply={[1n, "x"]}
      />
    )
    expect(screen.getByText("Result 0")).toBeTruthy()
    expect(screen.getByText("Result 1")).toBeTruthy()
    view("Candid")
    expect(screen.getByLabelText("reply").textContent).toBe('(1 : nat, "x")')
  })

  it("says so when a reply does not have its type's shape", () => {
    render(<ReplyView method={icrc1("icrc1_name")} reply={5} />)
    expect(screen.getByText("expected text")).toBeTruthy()
    view("Candid")
    expect(screen.getByText(/does not have the type's shape/)).toBeTruthy()
  })

  it("renders the same HTML on the server every time", () => {
    const element = (
      <ReplyView method={icrc1("icrc1_transfer")} reply={1_234n} units={ICP} />
    )
    const first = renderToString(element)
    expect(renderToString(element)).toBe(first)
    expect(first).toContain("1,234")
  })
})

describe("showsAmounts", () => {
  it("finds the bigints a tree shows in token units", () => {
    const result = (name: string) => icrc1(name).results[0] ?? c.null
    expect(showsAmounts(result("icrc1_balance_of"), true)).toBe(true)
    expect(showsAmounts(result("icrc1_balance_of"), false)).toBe(false)
    expect(showsAmounts(result("icrc1_name"), true)).toBe(false)
    // ICRC metadata: the key of each pair is only known at run time.
    expect(showsAmounts(result("icrc1_metadata"), false)).toBe(true)
    expect(showsAmounts(c.record({ block_index: c.nat }), false)).toBe(false)
    expect(
      showsAmounts(c.record({ fee: c.opt(c.record({ e8s: c.nat64 })) }), false)
    ).toBe(true)
  })
})

describe("ErrValueView", () => {
  it("shows a canister_err payload with the Err arm's schema", () => {
    render(
      <ErrValueView
        method={icrc1("icrc1_transfer")}
        err={{ tag: "InsufficientFunds", value: { balance: 5n } }}
        units={ICP}
      />
    )
    expect(screen.getByText("Err").className).toContain("badge-err")
    expect(screen.getByText("InsufficientFunds")).toBeTruthy()
    expect(screen.getByText("balance")).toBeTruthy()
    expect(screen.getByText("0.00000005 ICP")).toBeTruthy()
    view("Candid")
    expect(screen.getByLabelText("Err payload").textContent).toBe(
      "(variant { Err = variant { InsufficientFunds = record { balance = 5 : nat } } })"
    )
  })

  it("shows a tag-only Err as its badge", () => {
    render(
      <ErrValueView
        method={icrc1("icrc1_transfer")}
        err={{ tag: "TemporarilyUnavailable" }}
      />
    )
    expect(screen.getByText("TemporarilyUnavailable")).toBeTruthy()
  })
})

describe("one value", () => {
  it("shows a blob's length, hex and printable UTF-8", () => {
    render(one(c.blob(), new TextEncoder().encode("hello")))
    expect(screen.getByText("5 bytes")).toBeTruthy()
    expect(screen.getByText("68656c6c6f")).toBeTruthy()
    expect(screen.getByText("hello")).toBeTruthy()
  })

  it("keeps a byte order mark in a blob's UTF-8 text", () => {
    expect(utf8Preview(Uint8Array.of(0xef, 0xbb, 0xbf, 0x41))).toBe("\uFEFFA")
  })

  it("marks an all-zero subaccount and shortens long blobs", () => {
    render(one(c.blob(), new Uint8Array(100)))
    expect(screen.getByText("100 bytes")).toBeTruthy()
    expect(screen.getByText("all zero")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show all 100 bytes" }))
    expect(screen.getByText("00".repeat(100))).toBeTruthy()
  })

  it("adds the UTC date to an IC timestamp", () => {
    render(
      one(c.record({ created_at_time: c.opt(c.nat64) }), {
        created_at_time: 1_760_000_000_000_000_000n,
      })
    )
    expect(screen.getByText("2025-10-09 08:53:20 UTC")).toBeTruthy()
  })

  it("shows variants as tag badges and unnamed fields by number", () => {
    render(
      one(c.record({ _7_: c.variant({ Ready: c.null, Busy: c.nat8 }) }), {
        _7_: { tag: "Busy", value: 3 },
      })
    )
    expect(screen.getByText("#7")).toBeTruthy()
    expect(screen.getByText("Busy").className).toContain("badge")
    expect(screen.getByText("3")).toBeTruthy()
  })
})
