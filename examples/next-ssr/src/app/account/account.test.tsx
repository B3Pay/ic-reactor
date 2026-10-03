// Scenarios 5 and 6: the /account page, rendered to a stream by React's
// server renderer, as Next renders it to HTML. The request's client is a test
// client; `next/form` (which needs Next's router) is its plain `<form>`.
//
// - The owner comes from the search parameters and is validated on the
//   server: a typo is a message, not a call.
// - The plain balances are in the first HTML React sends, with the fallback
//   of the certified section; the certified balances come later in the same
//   response. The test holds the certified reads until it has read the first
//   part, so the order is the page's, not a race.
// - What a browser without JavaScript shows is the HTML with no script run:
//   the balances, and the fallback's <noscript> note.
import { principal } from "@candid-core/schema"
import { JSDOM } from "jsdom"
import type { ComponentProps } from "react"
import { renderToReadableStream } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { tokens } from "@/format"
import { LEDGERS, SAMPLE_OWNER } from "@/ledgers"
import {
  BALANCES,
  mockLedgers,
  requestsFor,
  tokenOf,
  type MockLedgers,
} from "@/testing/mock-ledgers"
import AccountPage from "./page"

const request = vi.hoisted(() => ({
  test: undefined as MockLedgers | undefined,
  /** Releases the certified reads; set while they are held. */
  release: undefined as (() => void) | undefined,
}))

vi.mock("next/form", () => ({
  default: (props: ComponentProps<"form">) => <form {...props} />,
}))
vi.mock("@/server/request-client", () => ({
  requestClient: () => {
    if (request.test === undefined) throw new Error("no request client")
    return request.test.client
  },
}))
// The real reads, with the certified ones held until the test releases them.
vi.mock("@/server/read-balances", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/read-balances")>()
  return {
    ...real,
    readBalances: async (...args: Parameters<typeof real.readBalances>) => {
      if (args[3]?.certified === true) {
        await new Promise<void>((resolve) => {
          request.release = resolve
        })
      }
      return real.readBalances(...args)
    },
  }
})

afterEach(() => {
  request.test?.client.dispose()
  request.test = undefined
  request.release = undefined
})

const decoder = new TextDecoder()

/** Renders the page for `owner`; returns the stream's reader once the shell is ready. */
async function renderPage(owner?: string) {
  request.test = mockLedgers()
  const stream = await renderToReadableStream(
    <AccountPage
      searchParams={Promise.resolve(owner === undefined ? {} : { owner })}
    />
  )
  const reader = stream.getReader()
  const read = async () => {
    let html = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return html
      html += decoder.decode(value, { stream: true })
    }
  }
  return { reader, read }
}

/** The text a browser without JavaScript shows of `html`. */
function withoutJavaScript(html: string) {
  const { document } = new JSDOM(html).window
  for (const hidden of document.querySelectorAll(
    "script, template, [hidden]"
  )) {
    hidden.remove()
  }
  return document
}

describe("/account", () => {
  it("sends the plain balances first, then streams the certified ones in", async () => {
    const { reader, read } = await renderPage(SAMPLE_OWNER)

    // The shell: everything outside <Suspense>.
    const first = await reader.read()
    const shell = decoder.decode(first.value)
    expect(shell).toContain('data-section="balances"')
    expect(shell).toContain('data-section="certified-fallback"')
    expect(shell).not.toContain('data-section="certified"')
    expect(requestsFor(request.test!, "icrc1_balance_of")).toHaveLength(
      LEDGERS.length
    )

    request.release?.()
    const rest = await read()
    expect(rest).toContain('data-section="certified"')

    // The certified reads were replicated calls; the plain ones, queries.
    expect(
      requestsFor(request.test!, "icrc1_balance_of").map(
        ({ endpoint }) => endpoint
      )
    ).toEqual([...LEDGERS.map(() => "query"), ...LEDGERS.map(() => "call")])

    const page = withoutJavaScript(shell + rest)
    const owned = BALANCES.get(principal(SAMPLE_OWNER)) ?? 0n
    for (const ledger of LEDGERS) {
      const { decimals, symbol } = tokenOf(ledger)
      expect(
        page.querySelector(
          `[data-section="balances"] [data-ledger="${ledger.id}"] [data-field="balance"]`
        )?.textContent
      ).toBe(tokens(owned, decimals, symbol))
    }
    // Without JavaScript the streamed section stays hidden; the fallback says so.
    expect(page.querySelector('[data-section="certified"]')).toBeNull()
    expect(
      page.querySelector('[data-section="certified-fallback"]')?.textContent
    ).toContain("showing it takes JavaScript")
  })

  it("refuses a typo with a message, keeps it in the field, and calls nothing", async () => {
    const { read } = await renderPage("not-a-principal")

    const page = withoutJavaScript(await read())

    expect(page.querySelector('[data-problem="owner"]')?.textContent).toContain(
      '"not-a-principal" is not a principal'
    )
    expect(page.querySelector("input")?.getAttribute("value")).toBe(
      "not-a-principal"
    )
    expect(page.querySelector("form")?.getAttribute("action")).toBe("/account")
    expect(request.test!.requests).toEqual([])
  })

  it("shows only the form when no owner is asked for", async () => {
    const { read } = await renderPage()

    const page = withoutJavaScript(await read())

    expect(page.querySelector("form input[name=owner]")).not.toBeNull()
    expect(page.querySelector("table")).toBeNull()
    expect(request.test!.requests).toEqual([])
  })
})
