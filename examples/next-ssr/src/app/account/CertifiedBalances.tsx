// Scenario 5: a slower section, streamed in with Suspense.
//
// The /account page waits for the plain balances, which are in the first
// HTML it sends, and renders this inside <Suspense>: React sends the fallback
// with the rest of the page, then streams this section into the same response
// once its reads are done. A certified read is a replicated call that goes
// through consensus, a second or two on mainnet: the section worth streaming.
//
// Why an awaited async Server Component, and not `useSuspenseQuery` in a
// client component over a server prefetch that is not awaited (TanStack
// Query's dehydration of pending queries)? Both stream, and both keep bigints
// exact: TanStack runs the client's serializer on a pending query's result
// too. But with this library the Server Component is the one that holds up:
// - A failure stays on the server, where `isReactorError` reads its kind into
//   the row (src/server/read-balances.ts). A pending query that fails reaches
//   the browser as an error TanStack redacts unless told otherwise, and React
//   carries no error's fields from the server to the browser: no kind there.
// - Its HTML does not depend on who the browser is signed in as. The browser
//   keys every read by its own caller, so a signed-in visitor would never use
//   the promise the server dehydrated for the anonymous caller, and would read
//   everything again.
// It gets the request's client from `requestClient()`, the same one the page
// used, so `icrc1_decimals` and `icrc1_symbol` are not read twice.
import type { Principal } from "@candid-core/schema"
import { BalanceTable } from "@/components/BalanceTable"
import { LEDGERS } from "@/ledgers"
import { readBalances } from "@/server/read-balances"
import { requestClient } from "@/server/request-client"

export async function CertifiedBalances({ owner }: { owner: Principal }) {
  const rows = await readBalances(requestClient(), owner, LEDGERS, {
    certified: true,
  })
  return (
    <BalanceTable
      caption="Certified balances: replicated reads, streamed in"
      section="certified"
      rows={rows}
    />
  )
}

/** What the page shows until the certified balances arrive. */
export function CertifiedFallback() {
  return (
    <p className="muted" data-section="certified-fallback">
      Reading certified balances through consensus…
      <noscript>
        {" "}
        This section streams in after the rest of the page, and showing it takes
        JavaScript. The balances above are in the HTML as it is.
      </noscript>
    </p>
  )
}
