import { useClient } from "@ic-reactor/react"
import { useSuspenseQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { formatTokens } from "../../lib/format.ts"
import type { RegistryEntry } from "../../lib/registry.ts"
import { ledgerMetaReads } from "./ledgers.ts"

/** A ledger's token, as its own replies give it (never the registry hint). */
export interface LedgerToken {
  name: string
  symbol: string
  decimals: number
  fee: bigint
}

/**
 * Reads the ledger's token metadata (suspends; server-rendered through the
 * loader's prefetch) and hands it to `children`: the units every amount on
 * the page is parsed and shown with.
 */
export function WithLedgerToken({
  entry,
  children,
}: {
  entry: RegistryEntry
  children(token: LedgerToken): ReactElement
}): ReactElement {
  const client = useClient()
  const reads = ledgerMetaReads(client, entry.id)
  const token: LedgerToken = {
    name: useSuspenseQuery(reads.name).data,
    symbol: useSuspenseQuery(reads.symbol).data,
    decimals: useSuspenseQuery(reads.decimals).data,
    fee: useSuspenseQuery(reads.fee).data,
  }
  return children(token)
}

/** The ledger's token at a glance. */
export function LedgerSummary({
  entry,
  token,
}: {
  entry: RegistryEntry
  token: LedgerToken
}): ReactElement {
  return (
    <dl className="kv kv-compact wallet-summary">
      <dt>Token</dt>
      <dd>
        {token.name} <span className="muted">({token.symbol})</span>
      </dd>
      <dt>Decimals</dt>
      <dd className="tabular">{token.decimals}</dd>
      <dt>Transfer fee</dt>
      <dd className="tabular">
        {formatTokens(token.fee, token.decimals, token.symbol)}
      </dd>
      <dt>Ledger</dt>
      <dd className="mono break-all">{entry.id}</dd>
    </dl>
  )
}
