// The home page, a Server Component. Per request it builds the request's
// client (scenario 1, src/server/request-client.ts), prefetches every token
// read of the three ledgers and of a canister that is not a ledger
// (src/server/prefetch-ledgers.ts), and hands the dehydrated cache to the
// client components below through <HydrationBoundary>. The cards render the
// values on the server, so the HTML has them without JavaScript (scenario
// 4); the not-a-ledger section shows its error kind (scenario 8); "My
// balances" waits for a sign-in in the browser (scenario 9).
import { HydrationBoundary } from "@tanstack/react-query"
import Link from "next/link"
import { connection } from "next/server"
import { LedgerSections } from "@/components/LedgerSections"
import { MyBalances } from "@/components/MyBalances"
import { LEDGERS, NOT_A_LEDGER, SAMPLE_OWNER } from "@/ledgers"
import { prefetchLedgers } from "@/server/prefetch-ledgers"
import { requestClient } from "@/server/request-client"

const SECTIONS = [...LEDGERS, NOT_A_LEDGER]

export default async function Home() {
  // Read mainnet when a request comes in, never while `next build` prerenders:
  // a build must not call mainnet, and its answer would be stale anyway.
  await connection()
  const { state, failures } = await prefetchLedgers(requestClient(), SECTIONS)

  return (
    <main>
      <h1>ICRC-1 ledgers, rendered on the server</h1>
      <p className="lede">
        This page read every value below on the server, as the anonymous
        principal, then handed its cache to the browser. Turn JavaScript off and
        reload: it is all in the HTML. Look up any account on the{" "}
        <Link href={`/account?owner=${SAMPLE_OWNER}`}>account page</Link>, or as
        JSON from{" "}
        <a href={`/api/balance/ICP/${SAMPLE_OWNER}`}>
          /api/balance/ICP/{SAMPLE_OWNER}
        </a>
        .
      </p>
      <HydrationBoundary state={state}>
        <LedgerSections ledgers={SECTIONS} failures={failures} />
        <MyBalances ledgers={LEDGERS} />
      </HydrationBoundary>
    </main>
  )
}
