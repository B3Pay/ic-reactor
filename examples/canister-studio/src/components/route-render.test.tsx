// @vitest-environment node
// Pages rendered as the server renders them: the app's own router and routes
// over a test client, so what is checked is the HTML a reader (or curl) gets.
import { createTestClient } from "@ic-reactor/core/testing"
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"
import {
  actor as icrc1Actor,
  type Actor as Ledger,
} from "../canisters/icrc1.ts"
import { getRouter } from "../router.tsx"
import { WALLET_LEDGERS } from "./wallet/ledgers.ts"

let test: ReturnType<typeof createTestClient> | undefined
afterEach(() => {
  test?.client.dispose()
  test = undefined
})

async function renderPage(url: string): Promise<string> {
  test = createTestClient({ network: "ic", signedIn: false })
  for (const entry of Object.values(WALLET_LEDGERS)) {
    test.mock<Ledger>(icrc1Actor, entry.id, {
      icrc1_name: () => entry.name,
      icrc1_symbol: () => "TOK",
      icrc1_decimals: () => 8,
      icrc1_fee: () => 10n,
    })
  }
  const router = getRouter(test.client)
  router.update({
    ...router.options,
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}

/** The labels of the links in `html`'s `nav` of class `navClass` marked current. */
function currentIn(html: string, navClass: string): string[] {
  const nav = new RegExp(
    `<nav[^>]*class="[^"]*${navClass}[^"]*"[^>]*>([\\s\\S]*?)</nav>`
  ).exec(html)
  if (nav === null) throw new Error(`no nav .${navClass}`)
  return [...(nav[1] ?? "").matchAll(/<a([^>]*)>([^<]*)<\/a>/g)]
    .filter(([, attrs]) => attrs?.includes('aria-current="page"'))
    .map(([, , label]) => label ?? "")
}

describe("the wallet's ledger picker", () => {
  it.each([
    ["/wallet", "ICP"],
    ["/wallet?ledger=ckbtc", "ckBTC"],
    ["/wallet?ledger=cketh", "ckETH"],
  ])("marks one ledger current on %s", async (url, label) => {
    expect(currentIn(await renderPage(url), "wallet-ledgers")).toEqual([label])
  })
})

describe("the interface tool tabs", () => {
  const page = "/canister/ryjl3-tyaaa-aaaaa-aaaba-cai/interface"
  it.each([
    [page, "Candid"],
    [`${page}?tab=typescript`, "TypeScript"],
    [`${page}?tab=project`, "Project"],
    [`${page}?tab=compatibility`, "Compatibility"],
  ])("marks one tab current on %s", async (url, label) => {
    expect(currentIn(await renderPage(url), "iface-tabs")).toEqual([label])
  })
})
