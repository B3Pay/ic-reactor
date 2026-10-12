import type { AnyFieldSchema } from "@candid-core/schema"
import { useState, type ReactNode } from "react"
import { draftValues, type Draft } from "./engine.ts"
import { argsToJson, parseArgsJson } from "./json.ts"

interface JsonPanelProps {
  readonly id: string
  readonly args: readonly AnyFieldSchema[]
  readonly drafts: readonly Draft[]
  readonly onLoad: (values: unknown[]) => void
}

/**
 * The arguments as JSON: opened, it shows the form's values (bigints as
 * strings, blobs as hex); edited or pasted JSON loads back into the form,
 * read as tolerantly as a prefill.
 */
export function JsonPanel({
  id,
  args,
  drafts,
  onLoad,
}: JsonPanelProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [status, setStatus] = useState<{ error: boolean; message: string }>()

  const refresh = () => {
    setText(argsToJson(draftValues(args, drafts)))
    setStatus(undefined)
  }
  const load = () => {
    const parsed = parseArgsJson(text, args.length)
    if (!parsed.ok) {
      setStatus({ error: true, message: parsed.message })
      return
    }
    onLoad(parsed.values)
    setStatus({ error: false, message: "Loaded into the form." })
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus({ error: false, message: "Copied." })
    } catch {
      setStatus({
        error: true,
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
          {status !== undefined && (
            <span
              className={status.error ? "field-error" : "muted text-sm"}
              role={status.error ? "alert" : "status"}
            >
              {status.message}
            </span>
          )}
        </div>
      </div>
    </details>
  )
}
