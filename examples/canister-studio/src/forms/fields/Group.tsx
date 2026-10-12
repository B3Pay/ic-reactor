import { useState, type ReactNode } from "react"
import { useFormContext } from "../context.ts"
import { displayLabel } from "../engine.ts"

interface GroupProps {
  readonly path: string
  readonly label?: string
  readonly a11yLabel?: string
  /** The Candid type, shown in the legend. */
  readonly type: string
  /** Beside the type in the legend: an item count. */
  readonly note?: ReactNode
  readonly className?: string
  readonly children: ReactNode
}

/**
 * The frame of a composite value. With a label, a fieldset whose legend
 * collapses it (it opens by itself when a submit attempt finds an issue
 * inside); without one (an opt's value, a lone argument), a plain group
 * named for assistive technology.
 */
export function Group(props: GroupProps): ReactNode {
  const form = useFormContext()
  const { path, label, className = "" } = props
  const [collapsed, setCollapsed] = useState(false)
  if (label === undefined) {
    return (
      <div
        className={`form-group ${className}`}
        role="group"
        aria-label={props.a11yLabel}
        data-path={path}
      >
        {props.children}
      </div>
    )
  }
  const bodyId = `${form.idFor(path)}-body`
  const issueInside = form.hasIssueBelow(path)
  const hidden = collapsed && !(form.showAll && issueInside)
  return (
    <fieldset className={`fieldset form-group ${className}`} data-path={path}>
      <legend className="form-legend">
        <button
          type="button"
          className="form-legend-toggle"
          aria-expanded={!hidden}
          aria-controls={bodyId}
          onClick={() => setCollapsed(!hidden)}
        >
          <span className="form-chevron" aria-hidden="true" />
          {displayLabel(label)}
        </button>
        <span className="form-type">{props.type}</span>
        {props.note}
        {hidden && issueInside && (
          <span className="badge badge-err">issue inside</span>
        )}
      </legend>
      <div id={bodyId} className="form-group-body" hidden={hidden}>
        {props.children}
      </div>
    </fieldset>
  )
}
