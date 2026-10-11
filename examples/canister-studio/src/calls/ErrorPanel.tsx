// STUB (FOUNDATION): the props are the contract; B3 implements the panel.
import type { JSX } from "react"
import type { MethodInfo } from "../interface/types.ts"

export interface ErrorPanelProps {
  error: unknown
  method?: MethodInfo
  /** Offered when a write's outcome is unknown and no safe re-send exists. */
  onReadBack?(): void
}

/**
 * A failed call: kind, code, whether it may have executed, reject details,
 * the canister's Err payload and what the error means.
 */
export function ErrorPanel(props: ErrorPanelProps): JSX.Element {
  const message =
    props.error instanceof Error ? props.error.message : String(props.error)
  return (
    <div className="notice notice-danger" role="alert">
      <p className="notice-title">Call failed</p>
      <p>{message}</p>
    </div>
  )
}
