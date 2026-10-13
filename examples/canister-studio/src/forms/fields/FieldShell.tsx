import type { ReactNode } from "react"
import { useFormContext } from "../context.ts"
import { displayLabel, type FieldIssue } from "../engine.ts"

/** The attributes a control spreads to be labelled and described. */
export interface ControlA11y {
  id: string
  "aria-invalid": true | undefined
  "aria-describedby": string | undefined
  "aria-label": string | undefined
}

interface FieldShellProps {
  readonly path: string
  readonly label?: string
  /** The accessible name when there is no visible label. */
  readonly a11yLabel?: string
  /** The Candid type, shown beside the label. */
  readonly type?: string
  readonly description?: string
  /** Live facts under the control: byte counts, ranges, the decoded time. */
  readonly meta?: ReactNode
  /** Controls beside the label: a format or units toggle. */
  readonly aside?: ReactNode
  /**
   * A message that replaces the engine's parse issues here: the field parsed
   * the text itself (token units) and knows better what is wrong.
   */
  readonly parseMessage?: string
  readonly children: (a11y: ControlA11y) => ReactNode
}

/** Label, control, description, live facts and issues of one leaf field. */
export function FieldShell(props: FieldShellProps): ReactNode {
  const form = useFormContext()
  const { path, label, parseMessage } = props
  const id = form.idFor(path)
  let issues: readonly FieldIssue[] = form.issuesAt(path)
  if (parseMessage !== undefined && issues.length > 0) {
    issues = [
      { path, code: "parse", message: parseMessage },
      ...issues.filter((issue) => issue.code !== "parse"),
    ]
  }
  const metaId = `${id}-meta`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy =
    [
      props.meta !== undefined && metaId,
      props.description !== undefined && hintId,
      issues.length > 0 && errorId,
    ]
      .filter(Boolean)
      .join(" ") || undefined

  return (
    <div className="field form-field" data-path={path}>
      {(label !== undefined || props.aside !== undefined) && (
        <div className="form-field-head">
          {label !== undefined && (
            <label className="field-label" htmlFor={id}>
              {displayLabel(label)}
            </label>
          )}
          {label !== undefined && props.type !== undefined && (
            <span className="form-type">{props.type}</span>
          )}
          {props.aside !== undefined && (
            <div className="form-field-aside">{props.aside}</div>
          )}
        </div>
      )}
      {props.children({
        id,
        "aria-invalid": issues.length > 0 ? true : undefined,
        "aria-describedby": describedBy,
        "aria-label": label === undefined ? props.a11yLabel : undefined,
      })}
      {props.meta !== undefined && (
        <div id={metaId} className="field-hint form-meta">
          {props.meta}
        </div>
      )}
      {props.description !== undefined && (
        <p id={hintId} className="field-hint">
          {props.description}
        </p>
      )}
      {issues.length > 0 && (
        <ul id={errorId} className="form-issues">
          {issues.map((issue, i) => (
            <li key={i} className="field-error" data-code={issue.code}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
