import { isPrincipal } from "@candid-core/schema"
import { useAuth, useClient } from "@ic-reactor/react"
import { skipToken, useQuery } from "@tanstack/react-query"
import { useId, useState, type ReactElement } from "react"
import { CacheKeyPanel } from "../../calls/CacheKeyPanel.tsx"
import { formatTokens } from "../../lib/format.ts"
import type { RegistryEntry } from "../../lib/registry.ts"
import { ActionButton } from "../ActionButton.tsx"
import { Notice } from "../Notice.tsx"
import { Skeleton, Spinner } from "../Spinner.tsx"
import { ledgerCanister } from "./ledgers.ts"
import type { LedgerToken } from "./LedgerSummary.tsx"

/**
 * The signed-in caller's balance on one ledger. Rendered only after
 * hydration (the page wraps it in `ClientOnly`): a server has no caller.
 *
 * The Certified switch reads through the certified twin (a replicated call
 * with a verified certificate), under a key of its own. The key itself is
 * shown, with the caller's segment highlighted.
 */
export function BalancePanel({
  entry,
  token,
}: {
  entry: RegistryEntry
  token: LedgerToken
}): ReactElement {
  const auth = useAuth()
  const client = useClient()
  const ids = useId()
  const [certified, setCertified] = useState(false)

  const signedIn = auth.status === "signed-in"
  const owner =
    signedIn && isPrincipal(auth.principal) ? auth.principal : undefined
  const account = owner === undefined ? undefined : { owner, subaccount: null }
  const ledger = ledgerCanister(client, entry.id, certified)
  const balance = useQuery(
    client.queryOptions(ledger, "icrc1_balance_of", account ?? skipToken)
  )

  if (account === undefined) {
    return (
      <Notice tone="info" title="Sign in to see your balance" role="none">
        <p>
          A balance belongs to a caller, and a server has none: the page renders
          without it, and your balance loads in your browser once you sign in.
          Reads are keyed by caller, so one principal’s balance is never shown
          to another.
        </p>
      </Notice>
    )
  }

  const key = client.queryKey(ledger, "icrc1_balance_of", account)
  return (
    <div className="stack wallet-balance">
      <div className="row row-between">
        <div className="stack-xs">
          <span className="text-xs muted">Your balance</span>
          <span className="wallet-balance-value tabular" aria-live="polite">
            {balance.data !== undefined ? (
              formatTokens(balance.data, token.decimals, token.symbol)
            ) : balance.isError ? (
              <span className="muted">Not read</span>
            ) : (
              <Skeleton width="10rem" height="1.4em" />
            )}
          </span>
        </div>
        <div className="row">
          <label className="switch-label" htmlFor={`${ids}-certified`}>
            <input
              id={`${ids}-certified`}
              type="checkbox"
              className="switch"
              checked={certified}
              onChange={(event) => setCertified(event.target.checked)}
            />
            Certified
          </label>
          <ActionButton
            className="btn btn-sm"
            onClick={() => void balance.refetch()}
            unavailable={balance.isFetching}
          >
            {balance.isFetching ? <Spinner size="sm" label="Reading" /> : null}
            Refetch
          </ActionButton>
        </div>
      </div>
      {balance.isError && (
        <Notice tone="danger" title="The balance read failed">
          <p className="break-all">{balance.error.message}</p>
        </Notice>
      )}
      <p className="text-xs muted">
        {certified
          ? "Certified: a replicated call whose answer the subnet signed, under its own key."
          : "A query: one replica’s answer, fast, not certified."}
      </p>
      <CacheKeyPanel
        queryKey={key}
        status={balance.status}
        fetching={balance.isFetching}
      />
    </div>
  )
}
