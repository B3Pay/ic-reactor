import { useId, useState, type ReactElement, type ReactNode } from "react"
import { CopyButton } from "../components/CopyButton.tsx"

export type InspectorView = "tree" | "candid" | "json"

const VIEWS: readonly (readonly [InspectorView, string])[] = [
  ["tree", "Tree"],
  ["candid", "Candid"],
  ["json", "JSON"],
]

export interface ValueInspectorProps {
  /** Names the value in labels: "reply", "Err payload". */
  label: string
  /** The tree view, given whether token amounts show in base units. */
  renderTree(raw: boolean): ReactNode
  /** The Candid text; computed only for that view or a copy. May throw. */
  candid(): string
  /** The display JSON; computed only for that view or a copy. */
  json(): string
  /** Offer the "Raw amounts" switch (the tree formats amounts in units). */
  hasUnits?: boolean
  /** A short note under the toolbar: what the Candid text stands for. */
  candidNote?: string
}

/**
 * One value three ways (a Tree, its Candid text, display JSON) with a copy
 * button for the text. The Candid view is exact; the JSON view is lossy on
 * purpose (bigints as strings, blobs as hex).
 */
export function ValueInspector({
  label,
  renderTree,
  candid,
  json,
  hasUnits = false,
  candidNote,
}: ValueInspectorProps): ReactElement {
  const [view, setView] = useState<InspectorView>("tree")
  const [raw, setRaw] = useState(false)
  const bodyId = useId()

  return (
    <div className="value-inspector">
      <div className="value-toolbar">
        <div
          className="segmented"
          role="group"
          aria-label={`Show the ${label} as`}
        >
          {VIEWS.map(([id, title]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              aria-controls={bodyId}
              onClick={() => setView(id)}
            >
              {title}
            </button>
          ))}
        </div>
        <div className="value-toolbar-actions">
          {hasUnits && view === "tree" ? (
            <label className="switch-label text-xs">
              <input
                type="checkbox"
                className="switch"
                checked={raw}
                onChange={(event) => setRaw(event.target.checked)}
              />
              Raw amounts
            </label>
          ) : null}
          <CopyButton
            text={view === "json" ? json : candid}
            a11yLabel={
              view === "json"
                ? `Copy the ${label} as JSON`
                : `Copy the ${label} as Candid text`
            }
          />
        </div>
      </div>
      <div id={bodyId} className="value-body">
        {view === "tree" ? (
          renderTree(raw)
        ) : (
          <TextView
            compute={view === "candid" ? candid : json}
            note={view === "candid" ? candidNote : undefined}
            label={label}
          />
        )}
      </div>
    </div>
  )
}

function TextView({
  compute,
  note,
  label,
}: {
  compute: () => string
  note?: string
  label: string
}): ReactElement {
  let text: string
  try {
    text = compute()
  } catch (error) {
    return (
      <div className="notice notice-warn" role="status">
        <p className="notice-title">
          The {label} does not have the type&apos;s shape
        </p>
        <p className="mono break-all">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    )
  }
  return (
    <div className="stack-xs">
      {note === undefined ? null : <p className="subtle text-xs">{note}</p>}
      <pre className="code value-code" tabIndex={0} aria-label={label}>
        {text}
      </pre>
    </div>
  )
}
