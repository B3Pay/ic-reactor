import type { ReactElement } from "react"
import { Skeleton, Spinner } from "../Spinner.tsx"

/**
 * Shown while a canister's interface loads (after the router's pending
 * delay): a cold load reads certified metadata and compiles it, which can
 * take a few seconds.
 */
export function CanisterPending(): ReactElement {
  return (
    <div className="page canister-page" aria-busy="true">
      <div className="stack-sm">
        <Skeleton width="min(320px, 70%)" height="2rem" />
        <Skeleton width="min(260px, 60%)" height="1rem" />
      </div>
      <div className="row text-sm muted">
        <Spinner size="sm" label="Loading the interface" />
        <span>Reading the certified interface and compiling it…</span>
      </div>
      <div className="layout-sidebar">
        <div className="sidebar stack-sm">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} height="1.6rem" />
          ))}
        </div>
        <div className="content stack">
          <Skeleton height="8rem" />
          <Skeleton height="12rem" />
        </div>
      </div>
    </div>
  )
}
