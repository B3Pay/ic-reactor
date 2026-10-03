// The ledgers of the home page, one section each: the card (a client
// component reading the hydrated cache) for a ledger the server read, and the
// server-rendered error for one whose reads failed. A plain component, so the
// page renders it and the tests render it the same way.
import type { LedgerRef } from "@/ledgers"
import type { ErrorSummary } from "@/server/error-summary"
import { LedgerCard } from "./LedgerCard"
import { LedgerError } from "./LedgerError"

export function LedgerSections(props: {
  ledgers: readonly LedgerRef[]
  failures: Readonly<Record<string, ErrorSummary>>
}) {
  return props.ledgers.map((ledger) => {
    const error = props.failures[ledger.id]
    return error === undefined ? (
      <LedgerCard key={ledger.id} ledger={ledger} />
    ) : (
      <LedgerError key={ledger.id} ledger={ledger} error={error} />
    )
  })
}
