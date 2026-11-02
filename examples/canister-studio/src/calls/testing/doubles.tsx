// Test-only stand-ins for the form and the viewers, so the call layer's tests
// exercise the calls and not another area's rendering. Each keeps to its
// module's exported contract; the tests `vi.mock` the real modules with this
// one.
import { encodeArgs } from "@meantjs/schema/codec"
import { isReactorError } from "@ic-reactor/core"
import type { JSX } from "react"
import type { FieldIssue } from "../../forms/engine.ts"
import type { MethodFormProps } from "../../forms/MethodForm.tsx"
import { toVars } from "../../lib/reactor.ts"
import type { CallPreviewProps } from "../../values/CallPreview.tsx"
import type {
  ErrValueViewProps,
  ReplyViewProps,
} from "../../values/ReplyView.tsx"
import { shortValue } from "../record.ts"

/** What the next click on the form double submits, and the props it last got. */
export const formDouble: {
  next: readonly unknown[]
  last: MethodFormProps | undefined
} = { next: [], last: undefined }

export function MethodForm(props: MethodFormProps): JSX.Element {
  formDouble.last = props
  // As the real form: aria-disabled, never disabled, so it can hold the
  // focus a parent hands back to it (`submitRef`).
  const blocked = props.disabledReason !== undefined || props.busy === true
  const submit = () => {
    if (blocked) return
    const values = [...formDouble.next]
    const encoded = encodeArgs(props.method.args, values)
    props.onSubmit({
      values,
      vars: toVars(values),
      // Arguments that do not encode reach the client as they are, so the
      // tests can watch it refuse them (`invalid_args`).
      bytes: encoded.ok ? encoded.bytes : new Uint8Array(),
    })
  }
  return (
    <div data-testid="form">
      <p data-testid="disabled-reason">{props.disabledReason ?? ""}</p>
      <p data-testid="external-issues">
        {(props.externalIssues ?? []).map((issue) => issue.path).join(" ")}
      </p>
      <button
        ref={props.submitRef}
        type="button"
        aria-disabled={blocked || undefined}
        onClick={submit}
      >
        {props.submitLabel}
      </button>
    </div>
  )
}

/**
 * Hands the last rendered form's `onChange` the check of `values`, as the
 * real form does on every edit. Call it inside `act()`.
 */
export function changeForm(values: readonly unknown[]): void {
  const props = formDouble.last
  if (props === undefined) throw new Error("No form was rendered")
  const encoded = encodeArgs(props.method.args, [...values])
  props.onChange?.(
    encoded.ok
      ? {
          ok: true,
          values: [...values],
          vars: toVars(values),
          bytes: encoded.bytes,
          issues: [],
        }
      : { ok: false, issues: [] }
  )
}

export function ReplyView(props: ReplyViewProps): JSX.Element {
  return <output data-testid="reply">{shortValue(props.reply)}</output>
}

export function ErrValueView(props: ErrValueViewProps): JSX.Element {
  return <output data-testid="err-value">{shortValue(props.err)}</output>
}

export function CallPreview(props: CallPreviewProps): JSX.Element {
  return <output data-testid="preview">{props.bytes.length} bytes</output>
}

export function candidArgsText(
  _args: unknown,
  values: readonly unknown[]
): string {
  return `(${values.map(shortValue).join(", ")})`
}

export function candidText(_schema: unknown, value: unknown): string {
  return shortValue(value)
}

/** The engine's `issuesFromReactorError`, as its contract says it behaves. */
export function issuesFromReactorError(error: unknown): FieldIssue[] {
  return isReactorError(error) && error.kind === "invalid_args"
    ? (error.issues ?? []).map((issue) => ({ ...issue }))
    : []
}
