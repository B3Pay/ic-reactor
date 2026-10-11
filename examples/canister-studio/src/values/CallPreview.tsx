// STUB (FOUNDATION): the props are the contract; B2 implements the preview.
import type { JSX } from "react"
import type { MethodInfo } from "../interface/types.ts"

export interface CallPreviewProps {
  method: MethodInfo
  values: readonly unknown[]
  /** The exact encoded argument bytes. */
  bytes: Uint8Array
}

/** A call's Candid text, its hex bytes (collapsible), size and sha256. */
export function CallPreview(props: CallPreviewProps): JSX.Element {
  return (
    <div className="muted">
      Preview of <span className="mono">{props.method.name}</span>:{" "}
      {props.bytes.length} bytes (not implemented yet)
    </div>
  )
}
