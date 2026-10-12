import { useClient } from "@ic-reactor/react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import type { ReactElement, ReactNode } from "react"
import { formatTokens, groupDigits } from "../../lib/format.ts"
import type { RegistryEntry } from "../../lib/registry.ts"
import { Badge } from "../Badge.tsx"
import { SectionBoundary } from "../SectionBoundary.tsx"
import { Skeleton } from "../Spinner.tsx"
import { ledgerReads, minterReads } from "./featured.ts"

// Bitcoin amounts on the minter are satoshis.
const BTC_DECIMALS = 8

/** Whole tokens, grouped: the fraction of a supply is noise on a card. */
function wholeTokens(units: bigint, decimals: number): string {
  return groupDigits(units / 10n ** BigInt(decimals))
}

/**
 * A featured canister (the three ledgers and the ckBTC minter) on the home
 * page, with live numbers. The numbers stream from the server (the loader
 * started their reads), each card suspends on its own, and a card that
 * fails says so without taking the page down.
 */
export function FeaturedLedger({
  entry,
}: {
  entry: RegistryEntry
}): ReactElement {
  const isMinter = entry.kind === "ckbtc-minter"
  return (
    <article className="card home-featured">
      <div className="card-body">
        <div className="row row-between row-nowrap">
          <h3 className="card-title">
            <Link
              to="/canister/$canisterId"
              params={{ canisterId: entry.id }}
              className="home-featured-link"
            >
              {entry.name}
            </Link>
          </h3>
          <Badge
            tone="accent"
            title="Generated at build time from a committed .did"
          >
            Typed
          </Badge>
        </div>
        <p className="text-sm muted">{entry.description}</p>
        <SectionBoundary
          label={`${entry.name} numbers`}
          fallback={<StatsSkeleton rows={3} />}
        >
          {isMinter ? (
            <MinterStats id={entry.id} />
          ) : (
            <LedgerStats id={entry.id} />
          )}
        </SectionBoundary>
        <p className="mono subtle text-xs break-all">{entry.id}</p>
      </div>
    </article>
  )
}

function LedgerStats({ id }: { id: string }): ReactElement {
  const client = useClient()
  const reads = ledgerReads(client, id)
  const symbol = useSuspenseQuery(reads.symbol).data
  const decimals = useSuspenseQuery(reads.decimals).data
  const supply = useSuspenseQuery(reads.totalSupply).data
  const fee = useSuspenseQuery(reads.fee).data
  return (
    <Stats>
      <Stat
        label="Total supply"
        value={`${wholeTokens(supply, decimals)} ${symbol}`}
        title={formatTokens(supply, decimals, symbol)}
      />
      <Stat label="Transfer fee" value={formatTokens(fee, decimals, symbol)} />
      <Stat label="Decimals" value={String(decimals)} />
    </Stats>
  )
}

function MinterStats({ id }: { id: string }): ReactElement {
  const client = useClient()
  const info = useSuspenseQuery(minterReads(client, id).info).data
  return (
    <Stats>
      <Stat
        label="Min. withdrawal"
        value={formatTokens(info.retrieve_btc_min_amount, BTC_DECIMALS, "BTC")}
      />
      <Stat
        label="Check fee"
        value={formatTokens(info.kyt_fee, BTC_DECIMALS, "BTC")}
      />
      <Stat label="Confirmations" value={String(info.min_confirmations)} />
    </Stats>
  )
}

function Stats({ children }: { children: ReactNode }): ReactElement {
  return <dl className="home-stats">{children}</dl>
}

function Stat({
  label,
  value,
  title,
}: {
  label: string
  value: string
  title?: string
}): ReactElement {
  return (
    <div className="home-stat">
      <dt className="text-xs muted">{label}</dt>
      <dd className="tabular home-stat-value" title={title}>
        {value}
      </dd>
    </div>
  )
}

function StatsSkeleton({ rows }: { rows: number }): ReactElement {
  return (
    <div className="home-stats" aria-busy="true">
      <span className="sr-only">Loading live numbers</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="home-stat">
          <Skeleton width="35%" height="0.75em" />
          <Skeleton width="40%" height="0.9em" />
        </div>
      ))}
    </div>
  )
}
