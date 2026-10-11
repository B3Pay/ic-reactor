// STUB (FOUNDATION): the props are the contract; B3 implements the runner.
import type { JSX } from "react"
import type { HintResolver } from "../forms/hints.ts"
import type { CanisterInterface, MethodInfo } from "../interface/types.ts"
import type { TokenUnits } from "../lib/format.ts"

export interface MethodRunnerProps {
  iface: CanisterInterface
  method: MethodInfo
  /** Prefill (history, a shared link). */
  initialValues?: readonly unknown[]
  /** Read at once with `initialValues` (a shared query link with `run=1`). */
  autoRun?: boolean
  /** Use the certified twin for queries. */
  certified?: boolean
  hints?: HintResolver
  units?: TokenUnits
  onShare?(url: string): void
}

/**
 * The composite every method page uses: MethodForm, the call (query, update,
 * oneway, idempotent read), ReplyView, errors, safe re-send, the cache panel,
 * the share link and history.
 */
export function MethodRunner(props: MethodRunnerProps): JSX.Element {
  return (
    <div className="card">
      <div className="card-body">
        <p className="muted">
          Runner for <span className="mono">{props.method.name}</span> (not
          implemented yet)
        </p>
      </div>
    </div>
  )
}
