import { useState, type ReactNode } from "react"
import { toHex } from "../../lib/hex.ts"
import { useFormContext, type EditorProps } from "../context.ts"
import { SUBACCOUNT_BYTES, subaccountFromNumber } from "../convert.ts"
import {
  formatBytes,
  parseBytes,
  typeName,
  type BytesFormat,
  type Draft,
} from "../engine.ts"
import { FieldShell } from "./FieldShell.tsx"
import { Segmented } from "./Segmented.tsx"

/** Most ICRC-1 ledgers refuse a longer memo (the standard's default limit). */
const MEMO_LIMIT = 32
/** Text past this many characters is edited in a multi-line box. */
const LONG_BYTES_TEXT = 96

const FORMATS: readonly { value: BytesFormat; label: string }[] = [
  { value: "hex", label: "hex" },
  { value: "utf8", label: "text" },
  { value: "base64", label: "base64" },
]

type BytesDraft = Extract<Draft, { k: "bytes" }>

/**
 * A blob: typed as hex, UTF-8 text or base64, with its byte count. Switching
 * the format rewrites the same bytes in the new one, and a format that cannot
 * hold them (text, for bytes that are not UTF-8) is not offered. A memo
 * starts as text; a subaccount offers "from a number" (32 bytes, big-endian).
 */
export function BytesField(props: EditorProps): ReactNode {
  const form = useFormContext()
  const { path, hint, onChange, schema } = props
  const memo = hint?.widget === "memo-text"
  const subaccount = hint?.widget === "subaccount"
  const d: BytesDraft =
    props.draft.k === "bytes"
      ? props.draft
      : { k: "bytes", text: "", format: "hex" }
  // An empty memo is typed as text; any other blob keeps its draft's format.
  const format: BytesFormat = memo && d.text === "" ? "utf8" : d.format
  const parsed = parseBytes(d.text, format)
  const bytes = typeof parsed === "string" ? undefined : parsed

  const switchFormat = (next: BytesFormat) => {
    const text = bytes === undefined ? d.text : formatBytes(bytes, next)
    if (text !== undefined) onChange({ k: "bytes", text, format: next })
  }

  const meta: ReactNode[] = []
  if (bytes !== undefined) {
    meta.push(`${bytes.length} ${bytes.length === 1 ? "byte" : "bytes"}`)
    if (memo && bytes.length > MEMO_LIMIT)
      meta.push(`more than the ${MEMO_LIMIT} most ledgers accept`)
    if (subaccount && bytes.length !== 0 && bytes.length !== SUBACCOUNT_BYTES)
      meta.push(`a subaccount is ${SUBACCOUNT_BYTES} bytes`)
    if (format !== "hex" && bytes.length > 0 && bytes.length <= 64)
      meta.push(`hex ${toHex(bytes)}`)
  }

  const long = d.text.length > LONG_BYTES_TEXT
  return (
    <FieldShell
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type={typeName(schema)}
      description={hint?.description}
      meta={meta.length > 0 ? meta.join(" · ") : undefined}
      aside={
        <Segmented<BytesFormat>
          label="Bytes typed as"
          value={format}
          onChange={switchFormat}
          options={FORMATS.map((f) => ({
            ...f,
            disabled:
              bytes !== undefined &&
              f.value !== format &&
              formatBytes(bytes, f.value) === undefined,
          }))}
        />
      }
    >
      {(a11y) => (
        <div className="stack-xs">
          {long ? (
            <textarea
              {...a11y}
              className={
                format === "utf8" ? "textarea" : "textarea mono break-all"
              }
              value={d.text}
              spellCheck={false}
              onChange={(e) =>
                onChange({ k: "bytes", text: e.target.value, format })
              }
              onBlur={() => form.touch(path)}
            />
          ) : (
            <input
              {...a11y}
              className={format === "utf8" ? "input" : "input mono"}
              value={d.text}
              autoComplete="off"
              spellCheck={false}
              placeholder={
                hint?.placeholder ??
                (format === "hex"
                  ? "hex, such as 0x0a1b"
                  : format === "utf8"
                    ? "text"
                    : "base64")
              }
              onChange={(e) =>
                onChange({ k: "bytes", text: e.target.value, format })
              }
              onBlur={() => form.touch(path)}
            />
          )}
          {subaccount && (
            <SubaccountHelper
              id={`${a11y.id}-number`}
              onBytes={(b) => {
                onChange({ k: "bytes", text: toHex(b), format: "hex" })
                form.touch(path)
              }}
            />
          )}
        </div>
      )}
    </FieldShell>
  )
}

function SubaccountHelper(props: {
  id: string
  onBytes: (bytes: Uint8Array) => void
}): ReactNode {
  const [text, setText] = useState("")
  const parsed = text.trim() === "" ? undefined : subaccountFromNumber(text)
  return (
    <div className="row-sm form-helper">
      <label className="text-xs muted" htmlFor={props.id}>
        From a number
      </label>
      <input
        id={props.id}
        className="input mono form-input-narrow"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        placeholder="1"
        aria-describedby={
          parsed?.ok === false ? `${props.id}-error` : undefined
        }
        aria-invalid={parsed?.ok === false ? true : undefined}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-sm"
        disabled={parsed?.ok !== true}
        onClick={() => {
          if (parsed?.ok === true) props.onBytes(parsed.value)
        }}
      >
        Set 32 bytes
      </button>
      {parsed?.ok === false && (
        <span id={`${props.id}-error`} className="field-error">
          {parsed.message}
        </span>
      )}
    </div>
  )
}
