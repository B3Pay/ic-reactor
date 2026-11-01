import type { Schema } from "@meantjs/schema"
import { useMemo, type JSX, type Ref } from "react"
import type { MethodInfo } from "../interface/types.ts"
import type { CallCheck, FieldIssue } from "./engine.ts"
import type { HintResolver } from "./hints.ts"
import { MethodForm } from "./MethodForm.tsx"

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
  /** Issues from the last call (`issuesFromReactorError`). */
  externalIssues?: readonly FieldIssue[]
  onChange?(check: CallCheck): void
  /** Offers "Use mine" on principal fields. */
  callerPrincipal?: string
  /** The submit button, for a parent that hands the focus back to it. */
  submitRef?: Ref<HTMLButtonElement>
}

/**
 * A typed form for a one-argument method of a generated module, such as
 * `TypedForm<TransferArg>` with `schema={TransferArg}`: the value handed to
 * `onSubmit` is a `T`, and `bytes` is the method's exact Candid argument
 * message.
 */
export function TypedForm<T>(props: TypedFormProps<T>): JSX.Element {
  const { schema, label, initialValue, onSubmit, ...rest } = props
  const method = useMemo<MethodInfo>(
    () => ({ name: label, mode: "update", args: [schema], results: [] }),
    [schema, label]
  )
  const initialValues = useMemo(
    () => (initialValue === undefined ? undefined : [initialValue]),
    [initialValue]
  )
  return (
    <MethodForm
      {...rest}
      method={method}
      initialValues={initialValues}
      onSubmit={({ values, bytes }) =>
        // checkCall validated values[0] against `schema`, a Schema<T>, and
        // encoded it: it is a T.
        onSubmit(values[0] as T, bytes)
      }
    />
  )
}
