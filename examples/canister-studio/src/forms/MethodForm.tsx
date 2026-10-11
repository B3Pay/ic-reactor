// STUB (FOUNDATION): the props are the contract; B1 implements the form.
import type { JSX } from "react"
import type { MethodInfo } from "../interface/types.ts"
import type { CallCheck, FieldIssue } from "./engine.ts"
import type { HintResolver } from "./hints.ts"

export interface MethodFormProps {
  method: MethodInfo
  hints?: HintResolver
  /** Prefill: history, a shared link, typed defaults. */
  initialValues?: readonly unknown[]
  submitLabel: string
  /** Set to disable submitting, with the reason shown. */
  disabledReason?: string
  busy?: boolean
  /** Issues from the last call (`issuesFromReactorError`). */
  externalIssues?: readonly FieldIssue[]
  onSubmit(call: { values: unknown[]; vars: unknown; bytes: Uint8Array }): void
  onChange?(check: CallCheck): void
  /** Offers "Use mine" on principal fields. */
  callerPrincipal?: string
}

/** An automatic form for every argument of a method. */
export function MethodForm(props: MethodFormProps): JSX.Element {
  return (
    <div className="card card-inset">
      <div className="card-body">
        <p className="muted">
          Form for <span className="mono">{props.method.name}</span> (not
          implemented yet)
        </p>
      </div>
    </div>
  )
}
