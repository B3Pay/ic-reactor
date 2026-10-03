// Scenario 6: progressive enhancement. The lookup is a form that works
// without JavaScript and with it.
//
// `next/form` renders a plain `<form action="/account">`: without JavaScript
// the browser submits it as a GET, `/account?owner=<text>`, and this page
// renders the result on the server. With JavaScript, Next navigates to the
// same URL on the client, so the tab's client and its cache (the root
// layout's provider) stay alive. Either way the owner arrives as a search
// parameter, user input that is validated here, on the server
// (src/server/parse-owner.ts): an invalid principal is a message, not a crash
// and not a call.
//
// The plain balances are awaited by the page itself, so they are in the first
// HTML; the certified ones stream in afterwards (scenario 5,
// ./CertifiedBalances.tsx). Reading `searchParams` makes the page render per
// request: `next build` never calls mainnet for it.
import Form from "next/form"
import Link from "next/link"
import { Suspense } from "react"
import type { Principal } from "@candid-core/schema"
import { BalanceTable } from "@/components/BalanceTable"
import { LEDGERS, SAMPLE_OWNER } from "@/ledgers"
import { parseOwner } from "@/server/parse-owner"
import { readBalances } from "@/server/read-balances"
import { requestClient } from "@/server/request-client"
import { CertifiedBalances, CertifiedFallback } from "./CertifiedBalances"

export default async function AccountPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const input = parseOwner((await props.searchParams).owner)

  return (
    <main>
      <h1>Look up an account</h1>
      <p className="lede">
        The balance of a principal&apos;s default account on each ledger, read
        on the server. Try{" "}
        <Link href={`/account?owner=${SAMPLE_OWNER}`}>
          the cycles minting canister
        </Link>{" "}
        or <Link href="/account?owner=not-a-principal">a typo</Link>.
      </p>
      <Form action="/account" className="lookup">
        <label htmlFor="owner">Owner principal</label>
        <div className="row">
          <input
            id="owner"
            name="owner"
            defaultValue={input.kind === "empty" ? "" : input.text}
            placeholder={SAMPLE_OWNER}
            aria-invalid={input.kind === "invalid"}
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="primary">
            Look up
          </button>
        </div>
      </Form>
      {input.kind === "invalid" && (
        <p className="error" role="alert" data-problem="owner">
          {input.reason}
        </p>
      )}
      {input.kind === "valid" && (
        <section>
          <Balances owner={input.owner} />
          <Suspense fallback={<CertifiedFallback />}>
            <CertifiedBalances owner={input.owner} />
          </Suspense>
        </section>
      )}
    </main>
  )
}

/** The plain (query) balances: awaited, so they are part of the first HTML. */
async function Balances({ owner }: { owner: Principal }) {
  const rows = await readBalances(requestClient(), owner, LEDGERS)
  return <BalanceTable caption="Balances" section="balances" rows={rows} />
}
