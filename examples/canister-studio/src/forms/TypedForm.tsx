// STUB (FOUNDATION): the props are the contract; B1 implements the form.
import type { Schema } from "@candid-core/schema"
import type { JSX } from "react"
import type { HintResolver } from "./hints.ts"

export interface TypedFormProps<T> {
  /** The one argument's schema, from a generated module. */
  schema: Schema<T>
  label: string
  hints?: HintResolver
  initialValue?: T
  submitLabel: string
  disabledReason?: string
  busy?: boolean
  onSubmit(value: T, bytes: Uint8Array): void
}

/** A typed form for a one-argument method of a generated module. */
export function TypedForm<T>(props: TypedFormProps<T>): JSX.Element {
  return (
    <div className="card card-inset">
      <div className="card-body">
        <p className="muted">{props.label} (form not implemented yet)</p>
      </div>
    </div>
  )
}
