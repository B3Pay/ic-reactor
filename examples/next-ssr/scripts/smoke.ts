// Scenario 4: the pages render with JavaScript disabled. Checks a running
// production server (`pnpm build && pnpm start`) against mainnet, reading each
// page the way a browser with JavaScript off sees it: the HTML as it arrives,
// no script run, nothing that a script would reveal. Also checks the account
// lookup and its streamed section (scenarios 5 and 6), the error section
// (scenario 8) and the JSON route (scenario 7).
//
//   pnpm smoke                          # http://localhost:3011
//   pnpm smoke http://localhost:3001    # another server, such as `pnpm dev`
//
// Node strips the types itself (22.18 or newer). It calls mainnet, so it is
// not part of `pnpm test`.
import assert from "node:assert/strict"
import { createClient, formatUnits } from "@ic-reactor/core"
import { JSDOM } from "jsdom"
import { actor, type Actor } from "../src/canisters/icrc1.ts"
import { LEDGERS, NOT_A_LEDGER, SAMPLE_OWNER } from "../src/ledgers.ts"

const base = process.argv[2] ?? "http://localhost:3011"
const mainnet = createClient({ network: "ic", identity: "anonymous" })

/** The page at `path` as a browser without JavaScript shows it. */
async function withoutJavaScript(path: string) {
  const response = await fetch(new URL(path, base))
  assert.equal(response.status, 200, `GET ${path}`)
  const { document } = new JSDOM(await response.text()).window
  for (const node of document.querySelectorAll("script, template, [hidden]")) {
    node.remove()
  }
  return document
}

// The home page: every ledger's values are in the HTML, and they are
// mainnet's, read again here directly.
const home = await withoutJavaScript("/")
for (const ref of LEDGERS) {
  const ledger = mainnet.canister<Actor>(actor, { id: ref.id })
  const [name, symbol, decimals, fee, minter] = await Promise.all([
    ledger.icrc1_name(),
    ledger.icrc1_symbol(),
    ledger.icrc1_decimals(),
    ledger.icrc1_fee(),
    ledger.icrc1_minting_account(),
  ])
  const card = home.querySelector(`[data-ledger="${ref.id}"]`)
  const read = (method: string) =>
    card?.querySelector(`[data-read="${method}"]`)?.textContent ?? ""
  assert.equal(read("icrc1_name"), `${name} string`)
  assert.equal(read("icrc1_symbol"), `${symbol} string`)
  assert.equal(read("icrc1_decimals"), `${decimals} number`)
  assert.equal(
    read("icrc1_fee"),
    `${formatUnits(fee, decimals)} ${symbol} bigint`
  )
  assert.match(
    read("icrc1_total_supply"),
    new RegExp(`^\\d+(\\.\\d+)? ${symbol} bigint$`)
  )
  assert.ok(
    read("icrc1_minting_account").startsWith(`${minter?.owner} principal text`)
  )
  const origin = card?.querySelector("[data-origin]")
  assert.equal(origin?.getAttribute("data-origin"), "server")
  console.log(
    `${ref.label.padEnd(6)} ${read("icrc1_total_supply").replace(/ bigint$/, "")}, fee ${read("icrc1_fee").replace(/ bigint$/, "")}, ${origin?.textContent?.replace(/ Read again in this tab$/, "")}`
  )
}
const failed = home.querySelector(
  `[data-ledger="${NOT_A_LEDGER.id}"] [data-kind]`
)
assert.equal(failed?.textContent, "rejected")
console.log(
  `${NOT_A_LEDGER.label}: ${failed?.textContent}, rendered by the server`
)
assert.equal(home.querySelector(".pill")?.textContent, "anonymous")

// The account page: the plain balances are in the first part of the
// response; the certified ones arrive later in the same response.
const started = Date.now()
const response = await fetch(new URL(`/account?owner=${SAMPLE_OWNER}`, base))
assert.equal(response.status, 200)
let html = ""
const arrivals: Record<string, number> = {}
const decoder = new TextDecoder()
for await (const chunk of response.body ?? []) {
  html += decoder.decode(chunk, { stream: true })
  for (const marker of ["balances", "certified-fallback", "certified"]) {
    if (
      arrivals[marker] === undefined &&
      html.includes(`data-section="${marker}"`)
    ) {
      arrivals[marker] = Date.now() - started
    }
  }
}
assert.ok(arrivals.balances !== undefined && arrivals.certified !== undefined)
assert.ok(
  arrivals.certified > arrivals.balances,
  "the certified balances stream in after the plain ones"
)
console.log(
  `/account: balances at ${arrivals.balances} ms, certified balances streamed in at ${arrivals.certified} ms`
)
const account = new JSDOM(html).window.document
const visible = (section: string) => {
  const table = account.querySelector(`[data-section="${section}"]`)
  return table !== null && table.closest("[hidden]") === null
}
assert.ok(visible("balances"), "the plain balances show without JavaScript")
assert.ok(
  !visible("certified"),
  "the streamed section needs JavaScript to show"
)
const icp = account.querySelector(
  `[data-section="balances"] [data-ledger="${LEDGERS[0]?.id}"] [data-field="balance"]`
)?.textContent
assert.match(icp ?? "", /^\d+(\.\d+)? ICP$/)
console.log(`/account: ${SAMPLE_OWNER} holds ${icp}`)

// A typo in the search parameter is a message in the page.
const typo = await withoutJavaScript("/account?owner=not-a-principal")
const problem = typo.querySelector('[data-problem="owner"]')?.textContent ?? ""
assert.match(problem, /"not-a-principal" is not a principal/)
assert.equal(typo.querySelector("table"), null)
console.log(`/account?owner=not-a-principal: ${problem.slice(0, 40)}…`)

// The route handler.
const api = async (path: string) => {
  const reply = await fetch(new URL(path, base))
  return {
    status: reply.status,
    body: (await reply.json()) as Record<string, unknown>,
  }
}
const ok = await api(`/api/balance/ckBTC/${SAMPLE_OWNER}`)
assert.equal(ok.status, 200)
assert.equal(
  ok.body.balance,
  formatUnits(BigInt(String(ok.body.baseUnits)), Number(ok.body.decimals))
)
console.log(
  `/api/balance/ckBTC/${SAMPLE_OWNER}: ${ok.status} ${JSON.stringify(ok.body)}`
)
const bad = await api("/api/balance/ICP/not-a-principal")
assert.equal(bad.status, 400)
console.log(
  `/api/balance/ICP/not-a-principal: ${bad.status} ${JSON.stringify(bad.body)}`
)
const notALedger = await api(`/api/balance/${NOT_A_LEDGER.id}/${SAMPLE_OWNER}`)
assert.equal(notALedger.status, 502)
console.log(
  `/api/balance/${NOT_A_LEDGER.id}/…: ${notALedger.status} kind ${JSON.stringify((notALedger.body.error as { kind?: string }).kind)}`
)

console.log("smoke: every check passed")
