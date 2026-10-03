// @vitest-environment jsdom
//
// Scenarios 2, 3, 4, 9 and 10, through the home page's tree, the way Next
// runs it: a request client prefetches and dehydrates
// (src/server/prefetch-ledgers.ts); the state crosses to the browser as JSON;
// the server renders the client components with a provider client of its
// own, to HTML; the browser hydrates that HTML with the tab's client, signed
// out or still signed in from an earlier visit. Three test clients, three
// in-memory replicas: a test can see which side sent what.
import { ReactorProvider } from "@ic-reactor/react"
import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { toHex, tokens } from "@/format"
import { LEDGERS, NOT_A_LEDGER, type LedgerRef } from "@/ledgers"
import type { ErrorSummary } from "@/server/error-summary"
import { prefetchLedgers } from "@/server/prefetch-ledgers"
import {
  ANONYMOUS,
  BALANCES,
  mockLedgers,
  requestsFor,
  SEED_1,
  tokenOf,
  type MockLedgers,
} from "@/testing/mock-ledgers"
import { LedgerSections } from "./LedgerSections"
import { MyBalances } from "./MyBalances"
import { SessionBadge } from "./SessionBadge"

const SECTIONS = [...LEDGERS, NOT_A_LEDGER]

/** The home page below the root layout: the same components, the same order. */
function Page(props: {
  test: MockLedgers
  state: DehydratedState
  failures: Readonly<Record<string, ErrorSummary>>
}) {
  return (
    <ReactorProvider client={() => props.test.client}>
      <SessionBadge />
      <HydrationBoundary state={props.state}>
        <LedgerSections ledgers={SECTIONS} failures={props.failures} />
        <MyBalances ledgers={LEDGERS} />
      </HydrationBoundary>
    </ReactorProvider>
  )
}

const tests: MockLedgers[] = []
const newClient = (options?: Parameters<typeof mockLedgers>[0]) => {
  const test = mockLedgers(options)
  tests.push(test)
  return test
}
let root: Root | undefined
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ""
  for (const test of tests.splice(0)) test.client.dispose()
  vi.restoreAllMocks()
})

/** What the server sends: the dehydrated state as JSON, and the HTML. */
async function serverRender() {
  const request = newClient()
  const { state, failures } = await prefetchLedgers(request.client, SECTIONS)
  const json = JSON.stringify(state)
  const ssr = newClient()
  const html = renderToString(
    <Page test={ssr} state={JSON.parse(json)} failures={failures} />
  )
  return { json, failures, html, ssr }
}

/**
 * Hydrates the server's HTML with a browser client, returning what React
 * reported and the cards the server's HTML had. `signedIn` is a tab that is
 * still signed in from an earlier visit: its auth knows the session before
 * the first render, as an `AuthClient` reading its stored session does.
 */
async function hydrate(
  server: Awaited<ReturnType<typeof serverRender>>,
  options: { signedIn?: boolean } = {}
) {
  const browser = newClient(options)
  const container = document.createElement("div")
  container.innerHTML = server.html
  document.body.appendChild(container)
  const servedCards = [...container.querySelectorAll("[data-ledger]")]
  const recoverable: string[] = []
  const logged = vi.spyOn(console, "error").mockImplementation(() => {})
  await act(async () => {
    root = hydrateRoot(
      container,
      <Page
        test={browser}
        state={JSON.parse(server.json)}
        failures={server.failures}
      />,
      {
        onRecoverableError: (error) =>
          recoverable.push(String((error as Error).message)),
      }
    )
  })
  // Long enough for a fetch on mount, a retry or an effect to show.
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
  return { browser, container, recoverable, logged, servedCards }
}

const card = (scope: ParentNode, ledger: LedgerRef) => {
  const section = scope.querySelector(`[data-ledger="${ledger.id}"]`)
  if (section === null) throw new Error(`no section for ${ledger.label}`)
  return section
}
const readText = (scope: ParentNode, ledger: LedgerRef, method: string) =>
  card(scope, ledger).querySelector(`[data-read="${method}"]`)?.textContent

describe("the server's HTML", () => {
  it("shows every prefetched value, with the types it was read as, and no script run", async () => {
    const { html, ssr } = await serverRender()
    // innerHTML runs no script: this is what a browser without JavaScript shows.
    const page = document.createElement("div")
    page.innerHTML = html

    for (const ledger of LEDGERS) {
      const token = tokenOf(ledger)
      expect(readText(page, ledger, "icrc1_name")).toContain(
        `${token.name}, read by ${ANONYMOUS}`
      )
      expect(readText(page, ledger, "icrc1_total_supply")).toBe(
        `${tokens(token.supply, token.decimals, token.symbol)} bigint`
      )
      expect(readText(page, ledger, "icrc1_fee")).toBe(
        `${tokens(token.fee, token.decimals, token.symbol)} bigint`
      )
      expect(readText(page, ledger, "icrc1_minting_account")).toBe(
        `${token.minter.owner} principal text` +
          `subaccount ${toHex(token.minter.subaccount ?? new Uint8Array())} Uint8Array(32)`
      )
      expect(readText(page, ledger, "icrc1_metadata")).toContain(
        `test:blob 0x${toHex(token.blob)} Uint8Array(${token.blob.length})`
      )
      expect(readText(page, ledger, "icrc1_metadata")).toContain(
        `test:int ${-(2n ** 64n)} bigint`
      )
      expect(
        card(page, ledger)
          .querySelector("[data-origin]")
          ?.getAttribute("data-origin")
      ).toBe("server")
    }
    expect(
      card(page, NOT_A_LEDGER).querySelector("[data-kind]")?.textContent
    ).toBe("rejected")
    expect(page.querySelector(".pill")?.textContent).toBe("anonymous")
    // The server render of the client components read nothing itself.
    expect(ssr.requests).toEqual([])
  })
})

describe("the browser's first render", () => {
  it("matches the server's HTML and reads nothing, for a visitor who is not signed in", async () => {
    const server = await serverRender()

    const { browser, container, recoverable, logged } = await hydrate(server)

    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    expect(browser.requests).toEqual([])
    // The DOM is still the server's, node for node (both parsed the same way).
    const served = document.createElement("div")
    served.innerHTML = server.html
    expect(container.innerHTML).toBe(served.innerHTML)
  })
})

describe("a reload in a tab that is still signed in", () => {
  it("hydrates the server's HTML from the server's data, then reads every card again as the user", async () => {
    const server = await serverRender()

    const { browser, container, recoverable, logged, servedCards } =
      await hydrate(server, { signedIn: true })

    // The hydrating render built the anonymous keys the server filled, so it
    // matched the HTML: React reported nothing and kept the server's nodes.
    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    expect(servedCards.length).toBe(SECTIONS.length)
    for (const node of servedCards) expect(node.isConnected).toBe(true)
    // Right after it, the tab shows its session, and every card reads its
    // own keys as the user. The anonymous reads the server made are not sent
    // again, by anyone.
    await waitFor(() => {
      for (const ledger of LEDGERS) {
        expect(readText(container, ledger, "icrc1_name")).toContain(
          `read by ${SEED_1}`
        )
      }
    })
    expect(container.querySelector(".pill")?.textContent).toMatch(
      /^signed in: psith…4ae$/
    )
    expect(
      browser.requests.filter(({ caller }) => caller === ANONYMOUS)
    ).toEqual([])
    expect(requestsFor(browser, "icrc1_name")).toHaveLength(LEDGERS.length)
    for (const node of servedCards) expect(node.isConnected).toBe(true)
  })
})

describe("signing in after hydration", () => {
  it("reads every card again as the new caller, and signing out shows the anonymous answers again", async () => {
    const server = await serverRender()
    const { browser, container } = await hydrate(server)

    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Internet Identity" })
    )

    await waitFor(() => {
      for (const ledger of LEDGERS) {
        expect(readText(container, ledger, "icrc1_name")).toContain(
          `read by ${SEED_1}`
        )
      }
    })
    // Every read the browser sent was signed by the new caller: the
    // anonymous answers were neither re-read nor reused for it.
    const sent = browser.requests.filter(({ endpoint }) => endpoint === "query")
    expect(new Set(sent.map(({ caller }) => caller))).toEqual(new Set([SEED_1]))
    expect(requestsFor(browser, "icrc1_name")).toHaveLength(LEDGERS.length)
    await waitFor(() =>
      expect(
        container.querySelector(`.mine [data-ledger="${LEDGERS[0]!.id}"]`)
          ?.textContent
      ).toBe(`ICP${tokens(BALANCES.get(SEED_1) ?? 0n, 8, "ICP")}`)
    )
    expect(container.querySelector(".pill")?.textContent).toMatch(
      /^signed in: psith…4ae$/
    )

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))

    await waitFor(() =>
      expect(readText(container, LEDGERS[0]!, "icrc1_name")).toContain(
        `read by ${ANONYMOUS}`
      )
    )
    // The anonymous answers came from the cache the server filled.
    expect(
      browser.requests.filter(({ caller }) => caller === ANONYMOUS)
    ).toEqual([])
  })
})
