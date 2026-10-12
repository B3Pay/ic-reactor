// Editors of composite values. The draft is finite (an opt's value exists
// only while it is switched on, a variant's payload only for arms visited),
// so a recursive type grows one level per user action and never needs lazy
// nodes.
import type { AnyFieldSchema } from "@candid-core/schema"
import { useState, type ReactNode } from "react"
import { useFormContext, type EditorProps } from "../context.ts"
import { nowNanos } from "../convert.ts"
import {
  childPath,
  displayLabel,
  fillNanos,
  getOwn,
  initialDraft,
  isOptional,
  isUnsetTime,
  orderFields,
  selectArm,
  typeName,
  withOwn,
  type ArmControl,
  type Draft,
} from "../engine.ts"
import type { FieldHint } from "../hints.ts"
import { Field } from "./Field.tsx"
import { FieldShell } from "./FieldShell.tsx"
import { Group } from "./Group.tsx"
import { Segmented } from "./Segmented.tsx"

// ---------------------------------------------------------------------------
// opt
// ---------------------------------------------------------------------------

/** What an opt's value inherits from the opt's hint: how to edit, not how to label. */
const innerHint = (hint: FieldHint | undefined): FieldHint | undefined =>
  hint === undefined
    ? undefined
    : {
        ...hint,
        label: undefined,
        description: undefined,
        nowByDefault: undefined,
      }

/**
 * An optional value: a switch, and the value while it is on. Off sends null;
 * the value typed so far is kept for when it is switched on again. A boxed
 * opt (`opt opt T`, `opt null`) nests: its value is at `.some`.
 */
export function OptField(
  props: EditorProps & { boxed: boolean; inner: AnyFieldSchema }
): ReactNode {
  const form = useFormContext()
  const { schema, path, hint, onChange, boxed, inner } = props
  const d: Extract<Draft, { k: "opt" }> =
    props.draft.k === "opt" ? props.draft : { k: "opt", present: false }
  const name = props.label ?? props.a11yLabel ?? "value"
  const switchId = `${form.idFor(path)}-present`
  const bodyId = `${form.idFor(path)}-some`
  const innerDraft = d.inner ?? initialDraft(inner)

  const toggle = (on: boolean) => {
    if (on && hint?.nowByDefault === true && isUnsetTime(innerDraft)) {
      onChange(fillNanos(schema, d, nowNanos()))
      form.setAutoNow(path, true)
      return
    }
    onChange({ k: "opt", present: on, inner: innerDraft })
  }

  return (
    <div className="form-opt" data-path={path} data-present={d.present}>
      <div className="form-field-head">
        <label className="switch-label" htmlFor={switchId}>
          <input
            id={switchId}
            type="checkbox"
            role="switch"
            className="switch"
            checked={d.present}
            aria-controls={d.present ? bodyId : undefined}
            onChange={(e) => toggle(e.target.checked)}
          />
          <span className="field-label">
            {hint?.nowByDefault === true
              ? `Deduplicate with ${displayLabel(name)}`
              : displayLabel(name)}
          </span>
        </label>
        <span className="form-type">{typeName(schema)}</span>
        {!d.present && <span className="chip mono">null</span>}
      </div>
      {hint?.description !== undefined && (
        <p className="field-hint">{hint.description}</p>
      )}
      {d.present && (
        <div id={bodyId} className="form-opt-body">
          <Field
            schema={inner}
            draft={innerDraft}
            path={boxed ? childPath(path, "some") : path}
            fieldKey={boxed ? undefined : props.fieldKey}
            a11yLabel={boxed ? `${name} (some)` : name}
            inheritedHint={boxed ? undefined : innerHint(hint)}
            onChange={(next) =>
              onChange({ k: "opt", present: true, inner: next })
            }
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// record
// ---------------------------------------------------------------------------

/**
 * A record: required fields first, then the optional ones, which fold into
 * an "Optional fields" disclosure when the record also has required ones.
 */
export function RecordField(
  props: EditorProps & {
    fields: readonly (readonly [string, AnyFieldSchema])[]
  }
): ReactNode {
  const form = useFormContext()
  const { path, onChange, fields } = props
  const values = props.draft.k === "record" ? props.draft.fields : {}
  const [optionalOpen, setOptionalOpen] = useState(false)
  const ordered = orderFields(fields)
  const required = ordered.filter(([, s]) => !isOptional(s))
  const optional = ordered.filter(([, s]) => isOptional(s))
  const folded = required.length > 0 && optional.length > 0

  const field = ([key, schema]: readonly [string, AnyFieldSchema]) => (
    <Field
      key={key}
      schema={schema}
      draft={getOwn(values, key) ?? initialDraft(schema)}
      path={childPath(path, key)}
      fieldKey={key}
      label={key}
      onChange={(next) =>
        onChange({ k: "record", fields: withOwn(values, key, next) })
      }
    />
  )

  const setCount = optional.filter(([key]) => {
    const sub = getOwn(values, key)
    return sub?.k === "opt" && sub.present
  }).length
  const issueInOptional =
    form.showAll &&
    optional.some(([key]) => form.hasIssueBelow(childPath(path, key)))

  return (
    <Group
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type="record"
      className="form-record"
    >
      <div className="stack">
        {required.map(field)}
        {folded ? (
          <details
            className="disclosure form-optional"
            open={optionalOpen || issueInOptional}
            onToggle={(e) => setOptionalOpen(e.currentTarget.open)}
          >
            <summary>
              Optional fields{" "}
              <span className="muted">
                ({optional.length}
                {setCount > 0 && `, ${setCount} set`})
              </span>
            </summary>
            <div className="disclosure-body stack">{optional.map(field)}</div>
          </details>
        ) : (
          optional.map(field)
        )}
      </div>
    </Group>
  )
}

// ---------------------------------------------------------------------------
// tuple
// ---------------------------------------------------------------------------

export function TupleField(
  props: EditorProps & { elements: readonly AnyFieldSchema[] }
): ReactNode {
  const { path, onChange, elements } = props
  const items = props.draft.k === "tuple" ? props.draft.items : []
  const at = (i: number, schema: AnyFieldSchema): Draft =>
    items[i] ?? initialDraft(schema)
  return (
    <Group
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type={typeName(props.schema)}
      className="form-tuple"
    >
      <div className="stack">
        {elements.map((schema, i) => (
          <Field
            key={i}
            schema={schema}
            draft={at(i, schema)}
            path={childPath(path, i)}
            label={String(i)}
            onChange={(next) =>
              onChange({
                k: "tuple",
                items: elements.map((s, j) => (j === i ? next : at(j, s))),
              })
            }
          />
        ))}
      </div>
    </Group>
  )
}

// ---------------------------------------------------------------------------
// variant
// ---------------------------------------------------------------------------

/** Arms up to this many are a segmented control; more are a select. */
const SEGMENTED_ARMS = 4

/**
 * A variant: pick an arm (segmented control or select; arms whose payload
 * has no value are disabled), then edit its payload. Each arm visited keeps
 * its payload while another is picked.
 */
export function VariantField(
  props: EditorProps & { arms: readonly ArmControl[] }
): ReactNode {
  const form = useFormContext()
  const { schema, path, onChange, arms } = props
  const d: Extract<Draft, { k: "variant" }> =
    props.draft.k === "variant"
      ? props.draft
      : { k: "variant", tag: arms[0]?.tag ?? "", payloads: {} }
  const tagPath = childPath(path, "tag")
  const pickerId = form.idFor(tagPath)
  const arm = arms.find((a) => a.tag === d.tag)
  const name = props.label ?? props.a11yLabel ?? "variant"
  const pick = (tag: string) => {
    onChange(selectArm(schema, d, tag))
    form.touch(tagPath)
  }
  const tagIssues = form.issuesAt(tagPath)

  return (
    <Group
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type="variant"
      className="form-variant"
    >
      <div className="stack-sm">
        {arms.length <= SEGMENTED_ARMS ? (
          <Segmented<string>
            id={pickerId}
            label={`${displayLabel(name)}: arm`}
            value={d.tag}
            onChange={pick}
            options={arms.map((a) => ({
              value: a.tag,
              label: displayLabel(a.tag),
              disabled: a.uninhabited,
              title: a.uninhabited ? "No value exists for this arm" : undefined,
            }))}
          />
        ) : (
          <select
            id={pickerId}
            className="select form-arm-select"
            aria-label={`${displayLabel(name)}: arm`}
            value={d.tag}
            onChange={(e) => pick(e.target.value)}
          >
            {arms.map((a) => (
              <option key={a.tag} value={a.tag} disabled={a.uninhabited}>
                {displayLabel(a.tag)}
                {a.uninhabited ? " (no value exists)" : ""}
              </option>
            ))}
          </select>
        )}
        {tagIssues.length > 0 && (
          <ul className="form-issues">
            {tagIssues.map((issue, i) => (
              <li key={i} className="field-error">
                {issue.message}
              </li>
            ))}
          </ul>
        )}
        {arm !== undefined && !arm.tagOnly && (
          <div className="form-arm-body">
            <Field
              schema={arm.schema}
              draft={getOwn(d.payloads, arm.tag) ?? initialDraft(arm.schema)}
              path={childPath(path, "value")}
              a11yLabel={`${displayLabel(arm.tag)} value`}
              onChange={(next) =>
                onChange({ ...d, payloads: withOwn(d.payloads, arm.tag, next) })
              }
            />
          </div>
        )}
      </div>
    </Group>
  )
}

// ---------------------------------------------------------------------------
// func reference
// ---------------------------------------------------------------------------

/** A func reference: a canister and one of its methods. */
export function FuncField(props: EditorProps & { mode: string }): ReactNode {
  const form = useFormContext()
  const { path, onChange, mode } = props
  const d: Extract<Draft, { k: "func" }> =
    props.draft.k === "func"
      ? props.draft
      : { k: "func", principal: "", method: "" }
  const principalPath = childPath(path, "principal")
  const methodPath = childPath(path, "method")
  return (
    <Group
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type={mode === "update" ? "func" : `func ${mode}`}
      className="form-func"
    >
      <div className="grid-2 form-func-grid">
        <FieldShell path={principalPath} label="principal" type="principal">
          {(a11y) => (
            <input
              {...a11y}
              className="input mono"
              list={form.datalistId}
              autoComplete="off"
              spellCheck={false}
              value={d.principal}
              placeholder="Canister id"
              onChange={(e) => onChange({ ...d, principal: e.target.value })}
              onBlur={() => form.touch(principalPath)}
            />
          )}
        </FieldShell>
        <FieldShell path={methodPath} label="method" type="text">
          {(a11y) => (
            <input
              {...a11y}
              className="input mono"
              autoComplete="off"
              spellCheck={false}
              value={d.method}
              placeholder="Method name"
              onChange={(e) => onChange({ ...d, method: e.target.value })}
              onBlur={() => form.touch(methodPath)}
            />
          )}
        </FieldShell>
      </div>
    </Group>
  )
}
