"use client"

// Scenario 9: signing in after hydration, in the browser.
//
// Rules:
// - `useAuth()` says who calls; the server render and the hydrating first
//   render say "anonymous", so this section first renders the sign-in prompt
//   everywhere, and a tab that holds a session switches right after.
// - A read is keyed by its caller. Signed out, there is nothing to ask
//   (`skipToken` would do; here the rows are not rendered at all). Signed in,
//   each balance is `useQuery(client.queryOptions(ledger, "icrc1_balance_of",
//   account))` with keys that hold the user's principal: they are new keys,
//   empty until read as the user. Nothing read anonymously (the server's
//   render included) is reused for them, and nothing carries data across
//   keys (no `keepPreviousData`, no cross-key `initialData`).
// - A sign-in with Internet Identity happens in the browser only; on a server
//   the client never builds its auth.
import { principal } from "@candid-core/schema"
import { isReactorError } from "@ic-reactor/core"
import { useAuth, useClient } from "@ic-reactor/react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { actor, type Actor } from "@/canisters/icrc1"
import { tokens } from "@/format"
import type { LedgerRef } from "@/ledgers"
import { SERVER_DATA } from "./server-data"

export function MyBalances({ ledgers }: { ledgers: readonly LedgerRef[] }) {
  const { status, principal: caller, signIn, signOut } = useAuth()
  const [problem, setProblem] = useState<string>()
  const run = (action: () => Promise<void>) => {
    setProblem(undefined)
    action().catch((error: unknown) =>
      setProblem(error instanceof Error ? error.message : String(error))
    )
  }

  return (
    <section className="mine" data-status={status}>
      <h2>My balances</h2>
      {status === "signed-in" ? (
        <>
          <p className="muted">
            Signed in as <code>{caller}</code>. Each balance is read as you,
            under keys that hold your principal.
          </p>
          <table className="balances">
            <tbody>
              {ledgers.map((ledger) => (
                <MyBalance key={ledger.id} ledger={ledger} owner={caller} />
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => run(() => signOut())}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            {status === "expired"
              ? "Your session expired. "
              : "The server rendered this page for nobody in particular. "}
            Sign in with Internet Identity to read your own balances, in this
            tab.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => run(() => signIn())}
          >
            Sign in with Internet Identity
          </button>
        </>
      )}
      {problem && <p className="error">{problem}</p>}
    </section>
  )
}

/** The default account of `owner` on one ledger, read as the caller. */
function MyBalance({
  ledger: ref,
  owner,
}: {
  ledger: LedgerRef
  owner: string
}) {
  const client = useClient()
  const ledger = client.canister<Actor>(actor, { id: ref.id })
  const account = { owner: principal(owner), subaccount: null }
  const balance = useQuery(
    client.queryOptions(ledger, "icrc1_balance_of", account)
  )
  const decimals = useQuery({
    ...client.queryOptions(ledger, "icrc1_decimals"),
    ...SERVER_DATA,
  })
  const symbol = useQuery({
    ...client.queryOptions(ledger, "icrc1_symbol"),
    ...SERVER_DATA,
  })

  return (
    <tr data-ledger={ref.id}>
      <th scope="row">{ref.label}</th>
      <td data-field="balance">
        {balance.error ? (
          <span className="error">
            {isReactorError(balance.error) ? balance.error.kind : "error"}
          </span>
        ) : balance.data === undefined ||
          decimals.data === undefined ||
          symbol.data === undefined ? (
          <span className="muted">loading</span>
        ) : (
          tokens(balance.data, decimals.data, symbol.data)
        )}
      </td>
    </tr>
  )
}
