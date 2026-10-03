"use client"

// Scenarios 2 and 3: a client component that renders what the server read.
//
// Rules:
// - Reads are `useQuery(client.queryOptions(ledger, method))`, built in
//   render: the same options the server prefetched with
//   (src/server/prefetch-ledgers.ts), so the same keys, and the
//   `<HydrationBoundary>` around this card has already put their data in the
//   cache. The server render of this component and the first render of a
//   browser that is not signed in both show it; nothing is fetched on load
//   (`SERVER_DATA` keeps it fresh for a minute).
// - The values are exactly what the generated module types: `bigint` for the
//   fee and the supply, principal text for the minting account, `Uint8Array`
//   for a subaccount or a `Blob` metadata value, after the trip through JSON
//   (scenario 3). Each value shows its type at run time.
// - When the caller changes (a sign-in, scenario 9), these options are built
//   again with the new caller in their keys: the card reads everything again
//   as the new caller, and never shows the anonymous answers under them. The
//   card calls `useAuth()` for that: it renders again only when something
//   tells it to, and `useAuth()` does on every change of caller. Without it,
//   the card would keep the keys of the caller it first rendered for.
import { isReactorError } from "@ic-reactor/core"
import { useAuth, useClient } from "@ic-reactor/react"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { actor, type Actor } from "@/canisters/icrc1"
import {
  metadataText,
  principalType,
  runtimeType,
  toHex,
  tokens,
} from "@/format"
import type { LedgerRef } from "@/ledgers"
import { SERVER_DATA } from "./server-data"

export function LedgerCard({ ledger: ref }: { ledger: LedgerRef }) {
  const client = useClient()
  const { principal: caller } = useAuth()
  // `client.canister()` returns the same object for the same id: made in render.
  const ledger = client.canister<Actor>(actor, { id: ref.id })
  const name = useQuery({
    ...client.queryOptions(ledger, "icrc1_name"),
    ...SERVER_DATA,
  })
  const symbol = useQuery({
    ...client.queryOptions(ledger, "icrc1_symbol"),
    ...SERVER_DATA,
  })
  const decimals = useQuery({
    ...client.queryOptions(ledger, "icrc1_decimals"),
    ...SERVER_DATA,
  })
  const fee = useQuery({
    ...client.queryOptions(ledger, "icrc1_fee"),
    ...SERVER_DATA,
  })
  const supply = useQuery({
    ...client.queryOptions(ledger, "icrc1_total_supply"),
    ...SERVER_DATA,
  })
  const minter = useQuery({
    ...client.queryOptions(ledger, "icrc1_minting_account"),
    ...SERVER_DATA,
  })
  const metadata = useQuery({
    ...client.queryOptions(ledger, "icrc1_metadata"),
    ...SERVER_DATA,
  })
  const reads = [name, symbol, decimals, fee, supply, minter, metadata]

  const amount = (units: bigint) =>
    decimals.data === undefined || symbol.data === undefined
      ? `${units} base units`
      : tokens(units, decimals.data, symbol.data)

  // Every read came from the server's render until one is fetched here.
  const fetchedHere = reads.some((r) => r.isFetchedAfterMount)
  const loading = reads.some((r) => r.data === undefined)
  const readAt = new Date(Math.max(...reads.map((r) => r.dataUpdatedAt)))
  const failure = reads.find((r) => r.error !== null)?.error

  return (
    <section className="ledger" data-ledger={ref.id}>
      <h2>
        {ref.label} <code>{ref.id}</code>
      </h2>
      <dl>
        <Row label="Name" method="icrc1_name" value={name.data}>
          {name.data}
        </Row>
        <Row label="Symbol" method="icrc1_symbol" value={symbol.data}>
          {symbol.data}
        </Row>
        <Row label="Decimals" method="icrc1_decimals" value={decimals.data}>
          {decimals.data}
        </Row>
        <Row label="Fee" method="icrc1_fee" value={fee.data}>
          {fee.data !== undefined && amount(fee.data)}
        </Row>
        <Row
          label="Total supply"
          method="icrc1_total_supply"
          value={supply.data}
        >
          {supply.data !== undefined && amount(supply.data)}
        </Row>
        <Row
          label="Minting account"
          method="icrc1_minting_account"
          value={minter.data}
        >
          {minter.data === null
            ? "none"
            : minter.data && (
                <>
                  <code>{minter.data.owner}</code>{" "}
                  <small className="type">
                    {principalType(minter.data.owner)}
                  </small>
                  <br />
                  subaccount{" "}
                  {minter.data.subaccount === null ? (
                    "none"
                  ) : (
                    <>
                      <code>{toHex(minter.data.subaccount)}</code>{" "}
                      <Type of={minter.data.subaccount} />
                    </>
                  )}
                </>
              )}
        </Row>
        <Row label="Metadata" method="icrc1_metadata" value={metadata.data}>
          <ul className="metadata">
            {metadata.data?.map(([key, value]) => (
              <li key={key}>
                <code>{key}</code> {metadataText(value)}{" "}
                <Type of={value.value} />
              </li>
            ))}
          </ul>
        </Row>
      </dl>
      {failure && (
        <p className="error" role="alert">
          {isReactorError(failure) ? failure.kind : "error"}: {failure.message}
        </p>
      )}
      <p className="origin" data-origin={fetchedHere ? "browser" : "server"}>
        {loading ? (
          "Reading in this tab, as the current caller."
        ) : (
          <>
            {fetchedHere
              ? `Read again in this tab, as ${caller}, at `
              : "From the server's render: read on the server at "}
            <time dateTime={readAt.toISOString()}>{readAt.toISOString()}</time>.
          </>
        )}{" "}
        <button
          type="button"
          disabled={reads.some((r) => r.isFetching)}
          onClick={() =>
            void client.queryClient.invalidateQueries({
              queryKey: client.queryKey(ledger),
            })
          }
        >
          Read again in this tab
        </button>
      </p>
    </section>
  )
}

/** A read of the card: its value once there is one, else `loading`. */
function Row(props: {
  label: string
  method: string
  value: unknown
  children: ReactNode
}) {
  const { label, method, value, children } = props
  const scalar =
    typeof value === "bigint" ||
    typeof value === "number" ||
    typeof value === "string"
  return (
    <div className="kv">
      <dt>
        {label} <code>{method}</code>
      </dt>
      <dd data-read={method}>
        {value === undefined ? (
          <span className="muted">loading</span>
        ) : (
          <>
            {children}
            {scalar && (
              <>
                {" "}
                <Type of={value} />
              </>
            )}
          </>
        )}
      </dd>
    </div>
  )
}

/** The run-time type of a value, shown after it. */
const Type = ({ of }: { of: unknown }) => (
  <small className="type">{runtimeType(of)}</small>
)
