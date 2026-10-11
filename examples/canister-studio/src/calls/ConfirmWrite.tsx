// STUB (FOUNDATION): the props are the contract; B3 implements the step.
import type { JSX } from "react"
import type { CanisterInterface, MethodInfo } from "../interface/types.ts"

export interface ConfirmWriteProps {
  iface: CanisterInterface
  method: MethodInfo
  values: readonly unknown[]
  /** The exact encoded argument bytes that will be sent. */
  bytes: Uint8Array
  /** The sender's principal text. */
  caller: string
  onConfirm(): void
  onCancel(): void
}

/**
 * The confirm step before a write: sender, target, method, Candid text, byte
 * size and sha256 of the exact bytes, and "may execute once".
 */
export function ConfirmWrite(props: ConfirmWriteProps): JSX.Element {
  return (
    <div className="notice notice-warn">
      <p className="notice-title">
        Send <span className="mono">{props.method.name}</span> as{" "}
        <span className="mono">{props.caller}</span>? (not implemented yet)
      </p>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
