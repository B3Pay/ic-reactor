// Scenario 4: the signed-in account's ICP balance, kept current.
//
// - `useQuery(client.queryOptions(ledger, "icrc1_balance_of", account))`:
//   the key holds the caller, so each account's balance is cached apart.
// - `skipToken` while nobody is signed in: there is no account to read yet,
//   so nothing is sent (no placeholder account, no `owner!`).
// - `refetchInterval` spread onto the client's options ("spread to add
//   options"), so ICP sent from `pnpm faucet` shows up by itself.
import { principal } from "@candid-core/schema"
import { useAuth, useClient } from "@ic-reactor/react"
import { skipToken, useQuery } from "@tanstack/react-query"
import { ErrorNote } from "./ErrorNote.tsx"
import { showAmount, useToken } from "./token.ts"
import { useCanisters } from "./use-canisters.ts"

export function Balance({ refreshMs = 3_000 }: { refreshMs?: number }) {
  const client = useClient()
  const { ledger } = useCanisters()
  const { status, principal: caller } = useAuth()
  const token = useToken()
  const signedIn = status === "signed-in"
  const balance = useQuery({
    ...client.queryOptions(
      ledger,
      "icrc1_balance_of",
      signedIn ? { owner: principal(caller), subaccount: null } : skipToken
    ),
    refetchInterval: refreshMs,
  })

  return (
    <section aria-labelledby="balance">
      <p className="scenario">Scenario 4</p>
      <h2 id="balance">Balance</h2>
      {!signedIn ? (
        <p className="muted" data-testid="balance">
          Sign in to see a balance: the read waits (skipToken) until there is an
          account.
        </p>
      ) : balance.isError ? (
        <ErrorNote error={balance.error} />
      ) : (
        <>
          <p className="big" data-testid="balance">
            {balance.data === undefined || token === undefined
              ? "…"
              : showAmount(balance.data, token)}
          </p>
          <p className="muted">
            Read again every {refreshMs / 1000} s. Top it up from another
            terminal and watch it change:
          </p>
          <pre>pnpm faucet {caller}</pre>
        </>
      )}
    </section>
  )
}
