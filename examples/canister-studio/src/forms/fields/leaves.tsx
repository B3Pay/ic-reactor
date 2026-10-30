// Editors of single values: text, bool, integers, floats, principals and
// constants. Every value is held as raw text in the draft; the engine parses.
import { isPrincipal } from "@meantjs/schema"
import { useState, type ReactNode } from "react"
import { groupDigits } from "../../lib/format.ts"
import { useFormContext, type EditorProps } from "../context.ts"
import { displayLabel, parseBigInt, typeName } from "../engine.ts"
import { knownCanisterName } from "../../lib/registry.ts"
import { FieldShell } from "./FieldShell.tsx"

const leafText = (props: EditorProps): string =>
  props.draft.k === "leaf" ? props.draft.text : ""

/** Text past this many characters starts as a multi-line box. */
const LONG_TEXT = 80

export function TextField(props: EditorProps): ReactNode {
  const form = useFormContext()
  const { path, hint, onChange } = props
  const text = leafText(props)
  // Chosen once for length: switching the element while typing would drop
  // the focus.
  const [multiline, setMultiline] = useState(
    () => hint?.widget === "textarea" || text.length > LONG_TEXT
  )
  // A line break always needs the multi-line box: an <input> shows the text
  // without it and stores that on the next keystroke. Only a value from
  // outside (a JSON import, a prefill) brings one, as an <input> takes none;
  // the box then stays, so deleting the break does not swap the element.
  const breaks = /[\r\n]/.test(text)
  if (breaks && !multiline) setMultiline(true)
  const multi = multiline || breaks
  return (
    <FieldShell
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type="text"
      description={hint?.description}
      meta={text.length > 0 ? `${text.length} characters` : undefined}
      aside={
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-pressed={multi}
          // aria-disabled, not disabled: the button keeps the focus.
          aria-disabled={breaks || undefined}
          title={breaks ? "The text has line breaks" : undefined}
          onClick={() => {
            if (!breaks) setMultiline((m) => !m)
          }}
        >
          Multi-line
        </button>
      }
    >
      {(a11y) =>
        multi ? (
          <textarea
            {...a11y}
            className="textarea"
            value={text}
            placeholder={hint?.placeholder}
            spellCheck={false}
            onChange={(e) => onChange({ k: "leaf", text: e.target.value })}
            onBlur={() => form.touch(path)}
          />
        ) : (
          <input
            {...a11y}
            className="input"
            value={text}
            placeholder={hint?.placeholder}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => onChange({ k: "leaf", text: e.target.value })}
            onBlur={() => form.touch(path)}
          />
        )
      }
    </FieldShell>
  )
}

export function BoolField(props: EditorProps): ReactNode {
  const { path, draft, onChange, hint } = props
  const value = draft.k === "bool" && draft.value
  return (
    <FieldShell
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type="bool"
      description={hint?.description}
    >
      {(a11y) => (
        <span className="row-sm">
          <input
            {...a11y}
            type="checkbox"
            role="switch"
            className="switch"
            checked={value}
            onChange={(e) => onChange({ k: "bool", value: e.target.checked })}
          />
          <span className="mono text-sm">{value ? "true" : "false"}</span>
        </span>
      )}
    </FieldShell>
  )
}

/**
 * Keeps what an integer can be typed with: digits, a sign, `_` `,` and
 * spaces as separators, and hex digits after `0x`. A bigint never goes
 * through `<input type="number">`, which would read it as a float.
 */
export function filterIntegerText(text: string): string {
  if (/^\s*[+-]?0x/i.test(text)) return text.replace(/[^0-9a-fx+\-\s_]/gi, "")
  return text.replace(/[^0-9+\-_,\s]/g, "")
}

function bigRange(primitive: string, min?: bigint, max?: bigint): string {
  if (min === undefined && max === undefined)
    return `${primitive}: any whole number`
  if (max === undefined)
    return `${primitive}: ${groupDigits(min ?? 0n)} or more`
  return `${primitive}: ${groupDigits(min ?? 0n)} to ${groupDigits(max)}`
}

export function BigIntField(
  props: EditorProps & { primitive: string; min?: bigint; max?: bigint }
): ReactNode {
  const form = useFormContext()
  const { path, hint, onChange, primitive, min, max } = props
  const text = leafText(props)
  const parsed = parseBigInt(text)
  const grouped =
    typeof parsed === "bigint" && (parsed >= 10_000n || parsed <= -10_000n)
      ? groupDigits(parsed)
      : undefined
  return (
    <FieldShell
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type={primitive}
      description={hint?.description}
      meta={
        grouped === undefined
          ? bigRange(primitive, min, max)
          : `${grouped} · ${bigRange(primitive, min, max)}`
      }
    >
      {(a11y) => (
        <input
          {...a11y}
          className="input mono"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder={hint?.placeholder ?? "0"}
          onChange={(e) =>
            onChange({ k: "leaf", text: filterIntegerText(e.target.value) })
          }
          onBlur={() => form.touch(path)}
        />
      )}
    </FieldShell>
  )
}

export function IntegerField(
  props: EditorProps & { primitive: string; min: number; max: number }
): ReactNode {
  const form = useFormContext()
  const { path, hint, onChange, primitive, min, max } = props
  return (
    <FieldShell
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type={primitive}
      description={hint?.description}
      meta={`${primitive}: ${groupDigits(min)} to ${groupDigits(max)}`}
    >
      {(a11y) => (
        <input
          {...a11y}
          className="input mono"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={leafText(props)}
          placeholder={hint?.placeholder ?? "0"}
          onChange={(e) => onChange({ k: "leaf", text: e.target.value })}
          onBlur={() => form.touch(path)}
        />
      )}
    </FieldShell>
  )
}

export function FloatField(props: EditorProps & { bits: 32 | 64 }): ReactNode {
  const form = useFormContext()
  const { path, hint, onChange, bits } = props
  return (
    <FieldShell
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type={`float${bits}`}
      description={hint?.description}
      meta={
        bits === 32
          ? "float32: exact values only (0.5 is, 0.1 is not); NaN, Infinity and -Infinity too"
          : "float64: NaN, Infinity and -Infinity too"
      }
    >
      {(a11y) => (
        <input
          {...a11y}
          className="input mono"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={leafText(props)}
          placeholder={hint?.placeholder ?? "0.0"}
          onChange={(e) => onChange({ k: "leaf", text: e.target.value })}
          onBlur={() => form.touch(path)}
        />
      )}
    </FieldShell>
  )
}

/** A principal (or a service reference, which is one): checked as it is typed. */
export function PrincipalField(
  props: EditorProps & { service?: boolean }
): ReactNode {
  const form = useFormContext()
  const { path, hint, onChange, service = false } = props
  const text = leafText(props)
  const trimmed = text.trim()
  const valid = trimmed !== "" && isPrincipal(trimmed)
  const known = valid ? knownCanisterName(trimmed) : undefined
  const mine = form.callerPrincipal
  return (
    <FieldShell
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type={service ? "service" : "principal"}
      description={hint?.description}
      meta={
        trimmed === "" ? undefined : valid ? (
          <span className="form-status-ok">
            Valid principal
            {known !== undefined && ` · ${known}`}
            {mine !== undefined && trimmed === mine && " · you"}
          </span>
        ) : (
          "Not a principal yet"
        )
      }
    >
      {(a11y) => (
        <div className="input-group">
          <input
            {...a11y}
            className="input mono"
            list={form.datalistId}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={text}
            placeholder={
              hint?.placeholder ?? "Principal text, such as aaaaa-aa"
            }
            onChange={(e) => onChange({ k: "leaf", text: e.target.value })}
            onBlur={() => form.touch(path)}
          />
          {mine !== undefined && (
            <button
              type="button"
              className="btn"
              title={`Use your principal, ${mine}`}
              onClick={() => {
                onChange({ k: "leaf", text: mine })
                form.touch(path)
              }}
            >
              Use mine
            </button>
          )}
        </div>
      )}
    </FieldShell>
  )
}

/** null, reserved and record {}: a value with nothing to choose. */
export function FixedField(
  props: EditorProps & { what: "null" | "reserved" | "unit" }
): ReactNode {
  const { label, a11yLabel, what, schema } = props
  if (label === undefined && a11yLabel === undefined) return null
  const text = what === "unit" ? "record {}" : "null"
  return (
    <div className="field form-field form-fixed" data-path={props.path}>
      <span className="form-field-head">
        {label !== undefined && (
          <span className="field-label">{displayLabel(label)}</span>
        )}
        {label !== undefined && (
          <span className="form-type">{typeName(schema)}</span>
        )}
        <span
          className="chip mono"
          aria-label={label === undefined ? a11yLabel : undefined}
        >
          {text}
        </span>
      </span>
      {what === "reserved" && (
        <span className="field-hint">
          reserved takes any value; the form sends null.
        </span>
      )}
    </div>
  )
}

/** `empty`, or a type that only contains itself: nothing can be sent. */
export function UninhabitedField(props: EditorProps): ReactNode {
  return (
    <div className="field form-field" data-path={props.path}>
      {props.label !== undefined && (
        <span className="field-label">{displayLabel(props.label)}</span>
      )}
      <p className="notice notice-warn text-sm">
        No value exists for this type ({typeName(props.schema)}): the method
        cannot be called.
      </p>
    </div>
  )
}
