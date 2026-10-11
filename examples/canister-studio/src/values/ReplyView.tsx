// STUB (FOUNDATION): the props are the contract; B2 implements the viewers.
import type { JSX } from "react"
import type { MethodInfo } from "../interface/types.ts"
import type { TokenUnits } from "../lib/format.ts"

export interface ReplyViewProps {
  method: MethodInfo
  /**
   * What the call resolved with: `undefined` for no results, the value for
   * one, the Ok payload when the one result is an Ok/Err variant, the tuple
   * for several.
   */
  reply: unknown
  units?: TokenUnits
  onOpenCanister?(id: string): void
}

/** A method's reply, viewed with its result schemas. */
export function ReplyView(props: ReplyViewProps): JSX.Element {
  return (
    <div className="muted">
      Reply of <span className="mono">{props.method.name}</span> (viewer not
      implemented yet)
    </div>
  )
}

export interface ErrValueViewProps {
  method: MethodInfo
  /** A `canister_err` ReactorError's `err` payload. */
  err: unknown
}

/** A `canister_err` payload, viewed with the Err arm's schema. */
export function ErrValueView(props: ErrValueViewProps): JSX.Element {
  return (
    <div className="muted">
      Err of <span className="mono">{props.method.name}</span> (viewer not
      implemented yet)
    </div>
  )
}
