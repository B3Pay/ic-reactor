import type { ReactNode } from "react"
import { formatNanos } from "../../lib/format.ts"
import { useFormContext, type EditorProps } from "../context.ts"
import { nanosToUtcInput, nowNanos, utcInputToNanos } from "../convert.ts"
import { FieldShell } from "./FieldShell.tsx"
import { filterIntegerText } from "./leaves.tsx"

/**
 * A time in nanoseconds since the Unix epoch (nat64): the raw number, a UTC
 * date and time picker, a "Now" button, and a switch that sets it to the
 * time of sending (on by default for `created_at_time`). The picker reads
 * and writes UTC, never the reader's zone, so the server's HTML and the
 * browser's agree.
 */
export function TimestampField(
  props: EditorProps & { primitive: string }
): ReactNode {
  const form = useFormContext()
  const { path, hint, onChange, primitive } = props
  const text = props.draft.k === "leaf" ? props.draft.text : ""
  const auto = form.isAutoNow(path)
  const ns = /^\d+$/.test(text.trim()) ? BigInt(text.trim()) : undefined
  const pickerValue = ns === undefined ? "" : (nanosToUtcInput(ns) ?? "")

  const setNow = () => onChange({ k: "leaf", text: nowNanos().toString() })

  return (
    <FieldShell
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type={primitive}
      description={hint?.description}
      meta={
        ns === undefined ? (
          auto ? (
            "Set when you send"
          ) : undefined
        ) : (
          <>
            <span className="mono">{formatNanos(ns)}</span>
            {auto && " · set again when you send"}
          </>
        )
      }
    >
      {(a11y) => (
        <div className="stack-xs">
          <div className="input-group">
            <input
              {...a11y}
              className="input mono"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              readOnly={auto}
              value={text}
              placeholder="Nanoseconds since 1970-01-01 UTC"
              onChange={(e) =>
                onChange({ k: "leaf", text: filterIntegerText(e.target.value) })
              }
              onBlur={() => form.touch(path)}
            />
            <button
              type="button"
              className="btn"
              disabled={auto}
              onClick={setNow}
            >
              Now
            </button>
          </div>
          <div className="row-sm form-timestamp-row">
            <label className="text-xs muted" htmlFor={`${a11y.id}-utc`}>
              UTC
            </label>
            <input
              id={`${a11y.id}-utc`}
              className="input form-datetime"
              type="datetime-local"
              step="0.001"
              readOnly={auto}
              value={pickerValue}
              onChange={(e) => {
                const picked = utcInputToNanos(e.target.value)
                if (picked !== undefined)
                  onChange({ k: "leaf", text: picked.toString() })
              }}
            />
            <label className="switch-label text-xs">
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={auto}
                onChange={(e) => {
                  form.setAutoNow(path, e.target.checked)
                  if (e.target.checked) setNow()
                }}
              />
              Time of sending
            </label>
          </div>
        </div>
      )}
    </FieldShell>
  )
}
