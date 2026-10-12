import type { AnyFieldSchema } from "@candid-core/schema"
import { useState, type ReactNode } from "react"
import { useFormContext, type EditorProps } from "../context.ts"
import {
  childPath,
  displayLabel,
  initialDraft,
  newItemId,
  typeName,
  type Draft,
} from "../engine.ts"
import { Field } from "./Field.tsx"
import { Group } from "./Group.tsx"

/** Items shown at once; "Show more" reveals the next page. */
const PAGE = 20
/** The most items one "Add" adds. */
const MAX_ADD = 1_000

type Items = Extract<Draft, { k: "vec" }>["items"]

/**
 * A vec: add (one or several), remove, move up and down, paged after
 * {@link PAGE} items. Each item keeps a stable id, so moving one keeps its
 * editor state.
 */
export function ListField(
  props: EditorProps & { item: AnyFieldSchema }
): ReactNode {
  const form = useFormContext()
  const { path, onChange, item, schema } = props
  const items: Items = props.draft.k === "vec" ? props.draft.items : []
  const [shown, setShown] = useState(PAGE)
  const [count, setCount] = useState("5")
  const name = displayLabel(props.label ?? props.a11yLabel ?? "item")
  const set = (next: Items) => onChange({ k: "vec", items: next })
  const fresh = () => ({ id: newItemId(), draft: initialDraft(item) })

  const add = (n: number) => {
    set([...items, ...Array.from({ length: n }, fresh)])
    // A single item added at the end of a fully shown list stays in view.
    if (n === 1 && items.length === shown) setShown(shown + 1)
  }
  const move = (from: number, to: number) => {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    if (moved !== undefined) next.splice(to, 0, moved)
    set(next)
  }
  const countNumber = Number.parseInt(count, 10)
  const addMany =
    Number.isInteger(countNumber) && countNumber >= 1 && countNumber <= MAX_ADD
      ? countNumber
      : undefined
  const visible = items.slice(0, shown)
  const countId = `${form.idFor(path)}-count`

  return (
    <Group
      path={path}
      label={props.label}
      a11yLabel={props.a11yLabel}
      type={typeName(schema)}
      note={
        <span className="muted text-xs">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      }
      className="form-list"
    >
      <div className="stack-sm">
        {items.length === 0 && (
          <p className="subtle text-sm">Empty: no items.</p>
        )}
        {visible.length > 0 && (
          <ol className="list-plain form-list-items">
            {visible.map((entry, i) => (
              <li key={entry.id} className="form-list-item">
                <div className="form-list-item-head">
                  <span className="mono text-xs muted">[{i}]</span>
                  <div className="row-sm">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      aria-label={`Move ${name} ${i} up`}
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      aria-label={`Move ${name} ${i} down`}
                      disabled={i === items.length - 1}
                      onClick={() => move(i, i + 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Remove ${name} ${i}`}
                      onClick={() =>
                        set(items.filter((x) => x.id !== entry.id))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <Field
                  schema={item}
                  draft={entry.draft}
                  path={childPath(path, i)}
                  a11yLabel={`${name} ${i}`}
                  onChange={(next) =>
                    set(
                      items.map((x) =>
                        x.id === entry.id ? { id: x.id, draft: next } : x
                      )
                    )
                  }
                />
              </li>
            ))}
          </ol>
        )}
        {items.length > shown && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShown(shown + PAGE)}
          >
            Show {Math.min(PAGE, items.length - shown)} more (
            {items.length - shown} hidden)
          </button>
        )}
        <div className="row-sm form-list-actions">
          <button type="button" className="btn btn-sm" onClick={() => add(1)}>
            Add item
          </button>
          <span className="row-sm">
            <label className="sr-only" htmlFor={countId}>
              Items to add
            </label>
            <input
              id={countId}
              className="input form-input-narrow"
              type="number"
              min={1}
              max={MAX_ADD}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={addMany === undefined}
              onClick={() => addMany !== undefined && add(addMany)}
            >
              Add {addMany ?? "N"}
            </button>
          </span>
          {items.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => set([])}
            >
              Remove all
            </button>
          )}
        </div>
      </div>
    </Group>
  )
}
