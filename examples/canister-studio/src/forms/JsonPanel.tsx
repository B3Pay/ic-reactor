import type { AnyFieldSchema } from "@candid-core/schema"
import { useState, type ReactNode } from "react"
import { draftValues, pathLabel, type Draft, type DraftNote } from "./engine.ts"
import { argsToJson, parseArgsJson } from "./json.ts"

interface JsonPanelProps {
  readonly id: string
  readonly args: readonly AnyFieldSchema[]
  /** The .did's argument names, for the paths in the notes. */
  readonly argNames?: readonly (string | undefined)[]
  readonly drafts: readonly Draft[]
  /** Loads the values; returns what could not be used as given. */
  readonly onLoad: (values: unknown[]) => readonly DraftNote[]
}

/** Replaced values listed after a load, at most. */
const NOTE_LIMIT = 8

type Status =
  | { readonly kind: "error" | "ok"; readonly message: string }
  | { readonly kind: "replaced"; readonly notes: readonly DraftNote[] }

/**
 * The arguments as JSON: opened, it shows the form's values (bigints as
 * strings, blobs as hex); edited or pasted JSON loads back into the form,
 * read as tolerantly as a prefill. What it could not read as given (a
 * misspelled tag or key, a list that is not an array) is listed with what
 * replaced it, so a load never stages another call in silence.
 */
export function JsonPanel({
  id,
  args,
  argNames,
  drafts,
  onLoad,
}: JsonPanelProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [status, setStatus] = useState<Status>()

  const refresh = () => {
    setText(argsToJson(draftValues(args, drafts)))
    setStatus(undefined)
  }
  const load = () => {
    const parsed = parseArgsJson(text, args)
    if (!parsed.ok) {
      setStatus({ kind: "error", message: parsed.message })
      return
    }
    const notes = onLoad(parsed.values)
    setStatus(
      notes.length === 0
        ? { kind: "ok", message: "Loaded into the form." }
        : { kind: "replaced", notes }
    )
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus({ kind: "ok", message: "Copied." })
    } catch {
      setStatus({
        kind: "error",
        message: "The clipboard is not available here.",
      })
    }
  }

  return (
    <details
      className="disclosure form-json"
      open={open}
      onToggle={(e) => {
        const isOpen = e.currentTarget.open
        setOpen(isOpen)
        if (isOpen) refresh()
      }}
    >
      <summary>Arguments as JSON</summary>
      <div className="disclosure-body stack-sm">
        <label className="field-label" htmlFor={id}>
          An array with one value per argument
        </label>
        <textarea
          id={id}
          className="textarea mono form-json-text"
          rows={8}
          spellCheck={false}
          value={text}
          aria-describedby={`${id}-help`}
          onChange={(e) => setText(e.target.value)}
        />
        <p id={`${id}-help`} className="field-hint">
          Numbers past 2^53 may be written bare or as strings; blobs as hex or
          byte arrays; variants as {'{ "tag": …, "value": … }'} or{" "}
          {'{ "Tag": … }'}; opts as null or the value.
        </p>
        <div className="row-sm">
          <button type="button" className="btn btn-sm" onClick={load}>
            Load into the form
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={refresh}
          >
            Refresh from the form
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void copy()}
          >
            Copy
          </button>
          {status !== undefined && status.kind !== "replaced" && (
            <span
              className={
                status.kind === "error" ? "field-error" : "muted text-sm"
              }
              role={status.kind === "error" ? "alert" : "status"}
            >
              {status.message}
            </span>
          )}
        </div>
        {status?.kind === "replaced" && (
          <div className="notice notice-warn" role="status">
            <p className="notice-title">
              Loaded, but {status.notes.length}{" "}
              {status.notes.length === 1
                ? "value was not read as given"
                : "values were not read as given"}
              : check these fields before sending.
            </p>
            <ul className="list-plain stack-xs">
              {status.notes.slice(0, NOTE_LIMIT).map((note, i) => (
                <li key={i} className="text-sm">
                  <span className="mono">
                    {pathLabel(note.path, args.length, argNames)}
                  </span>
                  : {note.message}
                </li>
              ))}
              {status.notes.length > NOTE_LIMIT && (
                <li className="text-sm muted">
                  and {status.notes.length - NOTE_LIMIT} more
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}
