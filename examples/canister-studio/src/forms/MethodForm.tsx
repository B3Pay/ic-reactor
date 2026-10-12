import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react"
import type { MethodInfo } from "../interface/types.ts"
import { formatByteSize } from "../lib/format.ts"
import { KNOWN_CANISTERS } from "../lib/registry.ts"
import { FormContext, type FormContextValue } from "./context.ts"
import {
  argPath,
  checkCall,
  isAtOrBelow,
  issuesByPath,
  pathLabel,
  type CallCheck,
  type Draft,
  type FieldIssue,
} from "./engine.ts"
import { Field } from "./fields/Field.tsx"
import type { HintResolver } from "./hints.ts"
import { JsonPanel } from "./JsonPanel.tsx"
import { useMethodForm } from "./useMethodForm.ts"

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

/** Issues listed in the summary after a failed submit, at most. */
const SUMMARY_LIMIT = 8

/**
 * A DOM id for a path, unique within the form: every character outside
 * [A-Za-z0-9] is escaped, so two paths never share an id.
 */
const pathSlug = (path: string): string =>
  path.replace(/[^A-Za-z0-9]/g, (ch) => `-${ch.codePointAt(0)?.toString(16)}-`)

const issueKey = (issues: readonly FieldIssue[] | undefined): string =>
  (issues ?? [])
    .map((i) => `${i.path}\u0000${i.code}\u0000${i.message}`)
    .join("\u0001")

/** The path one step up: `$args[0].to.owner` → `$args[0].to`. */
function parentPath(path: string): string | undefined {
  const match =
    /^(.*?)(\.[A-Za-z_$][A-Za-z0-9_$]*|\[\d+\]|\["(?:[^"\\]|\\.)*"\])$/.exec(
      path
    )
  return match?.[1] === undefined || match[1] === "$" ? undefined : match[1]
}

const FOCUSABLE = "input:not([type=hidden]), select, textarea, button"

/**
 * An automatic form for every argument of a method: one editor per Candid
 * type, issues on the codec's paths (shown once a field is touched, or all of
 * them after a submit attempt), and a submit that hands over the exact values,
 * `vars` and Candid bytes it checked.
 */
export function MethodForm(props: MethodFormProps): JSX.Element {
  const {
    method,
    hints,
    initialValues,
    submitLabel,
    disabledReason,
    busy = false,
    externalIssues,
    onSubmit,
    onChange,
    callerPrincipal,
  } = props
  const baseId = useId()
  const form = useMethodForm(method, initialValues, hints)
  const { state } = form
  const args = method.args
  const argCount = args.length

  // Typing in a big argument stays responsive: the check runs on a deferred
  // copy (drafts and their schemas together), and submit re-checks the
  // current drafts.
  const deferred = useDeferredValue(state)
  const check = useMemo(
    () => checkCall(deferred.args, deferred.drafts),
    [deferred.args, deferred.drafts]
  )
  const issues = useMemo(() => issuesByPath(check.issues), [check])

  // The last call's issues show until the next edit, or until new ones come.
  const externalKey = issueKey(externalIssues)
  const [dismissedKey, setDismissedKey] = useState<string>()
  const lastCall: readonly FieldIssue[] =
    externalKey !== "" && externalKey !== dismissedKey
      ? (externalIssues ?? [])
      : []
  const external = issuesByPath(lastCall)
  const edit = (index: number, draft: Draft) => {
    if (lastCall.length > 0) setDismissedKey(externalKey)
    form.setArg(index, draft)
  }

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => {
    onChangeRef.current?.(check)
  }, [check])

  const idFor = (path: string) => `${baseId}${pathSlug(path)}`
  const datalistId = `${baseId}-canisters`

  const focusField = (path: string) => {
    for (let p: string | undefined = path; p !== undefined; p = parentPath(p)) {
      const el = document.getElementById(idFor(p))
      const target = el?.matches(FOCUSABLE)
        ? el
        : el?.querySelector<HTMLElement>(FOCUSABLE)
      if (target) {
        target.focus()
        return
      }
    }
  }
  useEffect(() => {
    if (state.focusPath === undefined) return
    focusField(state.focusPath)
    form.focused()
  })

  const context: FormContextValue = {
    idFor,
    hint: ({ path, key, schema }) =>
      hints?.({ path, key, schema, method: method.name }),
    issuesAt(path) {
      const own =
        state.showAll || state.touched.has(path) ? (issues.get(path) ?? []) : []
      const last = external.get(path) ?? []
      return last.length === 0 ? own : [...own, ...last]
    },
    hasIssueBelow(path) {
      for (const key of issues.keys())
        if (isAtOrBelow(key, path) && (state.showAll || state.touched.has(key)))
          return true
      for (const key of external.keys()) if (isAtOrBelow(key, path)) return true
      return false
    },
    touch: form.touch,
    showAll: state.showAll,
    callerPrincipal,
    datalistId,
    isAutoNow: form.isAutoNow,
    setAutoNow: form.setAutoNow,
  }

  const blocked =
    busy || disabledReason !== undefined || check.uninhabited === true
  const first = check.issues[0]
  const reason =
    disabledReason ??
    (check.uninhabited === true
      ? "This method cannot be called: an argument's type has no values."
      : first !== undefined
        ? `${pathLabel(first.path, argCount)}: ${first.message}${
            check.issues.length > 1
              ? ` (and ${check.issues.length - 1} more)`
              : ""
          }`
        : check.bytes !== undefined
          ? `Ready: ${formatByteSize(check.bytes.length)} of Candid arguments.`
          : undefined)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (blocked) return
    const result = form.submit()
    if (result.ok && result.values !== undefined && result.bytes !== undefined)
      onSubmit({
        values: result.values,
        vars: result.vars,
        bytes: result.bytes,
      })
  }

  const summary = state.showAll ? check.issues : []
  const listed = [...summary, ...lastCall].slice(0, SUMMARY_LIMIT)

  return (
    <FormContext.Provider value={context}>
      <form
        className="form"
        noValidate
        aria-label={`Arguments of ${method.name}`}
        onSubmit={submit}
      >
        <datalist id={datalistId}>
          {KNOWN_CANISTERS.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </datalist>
        <fieldset className="form-fields" disabled={busy}>
          {argCount === 0 && (
            <p className="muted text-sm">This method takes no arguments.</p>
          )}
          {args.map((schema, i) => (
            <Field
              key={i}
              schema={schema}
              draft={state.drafts[i] ?? { k: "uninhabited" }}
              path={argPath(i)}
              label={argCount > 1 ? `arg${i}` : undefined}
              a11yLabel={argCount === 1 ? "Argument" : undefined}
              onChange={(draft) => edit(i, draft)}
            />
          ))}
        </fieldset>
        {listed.length > 0 && (
          <div className="notice notice-danger form-summary" role="alert">
            <p className="notice-title">
              {summary.length > 0
                ? `${summary.length} ${summary.length === 1 ? "field needs" : "fields need"} attention`
                : "The last call refused these arguments"}
            </p>
            <ul className="list-plain stack-xs">
              {listed.map((issue, i) => (
                <li key={i} className="text-sm">
                  <button
                    type="button"
                    className="form-summary-link mono"
                    onClick={() => form.focusOn(issue.path)}
                  >
                    {pathLabel(issue.path, argCount)}
                  </button>
                  : {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="form-footer">
          <div className="row form-submit-row">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={blocked}
              aria-describedby={
                reason === undefined ? undefined : `${baseId}-reason`
              }
            >
              {busy && (
                <span className="spinner spinner-sm" aria-hidden="true" />
              )}
              {submitLabel}
            </button>
            {reason !== undefined && (
              <p
                id={`${baseId}-reason`}
                className={
                  disabledReason !== undefined || check.ok
                    ? "form-reason muted"
                    : "form-reason form-reason-issue"
                }
              >
                {reason}
              </p>
            )}
          </div>
          <div className="row-sm form-tools">
            <JsonPanel
              id={`${baseId}-json`}
              args={args}
              drafts={state.drafts}
              onLoad={form.load}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={form.reset}
            >
              Reset
            </button>
          </div>
        </div>
      </form>
    </FormContext.Provider>
  )
}
