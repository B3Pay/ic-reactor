// Scenario 8 (with src/server/error-summary.ts): a section that failed on the
// server, rendered on the server.
//
// The page renders this in place of a ledger's card when the server's reads
// of it failed. It is a plain component (no hooks, no 'use client'), so its
// HTML is complete without JavaScript, and the failure of one canister costs
// one section: the other ledgers render as usual. The kind comes from
// `isReactorError(error)` on the server, where the error still has it.
import type { LedgerRef } from "@/ledgers"
import type { ErrorSummary } from "@/server/error-summary"

export function LedgerError(props: { ledger: LedgerRef; error: ErrorSummary }) {
  const { ledger, error } = props
  return (
    <section className="ledger failed" data-ledger={ledger.id}>
      <h2>
        {ledger.label} <code>{ledger.id}</code>
      </h2>
      <div className="error" role="alert">
        <p className="plain">
          The server&apos;s reads of this canister failed:{" "}
          <strong data-kind={error.kind}>{error.kind}</strong>
          {error.rejectCode !== undefined &&
            `, reject code ${error.rejectCode}`}
          {error.httpStatus !== undefined && `, HTTP ${error.httpStatus}`}. The
          rest of the page rendered as usual.
        </p>
        <p>{error.message}</p>
      </div>
    </section>
  )
}
