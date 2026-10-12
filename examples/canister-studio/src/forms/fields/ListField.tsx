import type { AnyFieldSchema } from "@candid-core/schema"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useFormContext, type EditorProps } from "../context.ts"
import {
  childPath,
  displayLabel,
  initialDraft,
  isUninhabited,
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

/** Where the focus goes after an action removed or moved its own button. */
type FocusTarget =
  | { readonly item: number; readonly action: "up" | "down" | "remove" }
  | { readonly item: number; readonly action: "first" }
  | { readonly action: "add" }

const FOCUSABLE = "input:not([type=hidden]), select, textarea, button"

/**
 * A vec: add (one or several), remove, move up and down, paged after
 * {@link PAGE} items. Each item keeps a stable id, so moving one keeps its
 * editor state. An item with a shown issue is never left on a hidden page.
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
  // `vec Loop` with `Loop = record { x : Loop }`: only the empty list exists.
  const onlyEmpty = isUninhabited(item)

  // The summary names an issue in item 25 and a submit focuses it: the page
  // then reaches it, or neither would find a field to show it at. Latched,
  // so the item stays while the reader corrects it.
  const needed = form.lastItemWithIssue(path) + 1
  if (needed > shown) setShown(needed)
  const reach = Math.max(shown, needed)
  const visible = items.slice(0, reach)

  // A button that disables or removes itself would drop the focus to the
  // page: the focus goes to the same button of the item where it lands, the
  // next item's Remove, or Add item.
  const list = useRef<HTMLDivElement>(null)
  const focusNext = useRef<FocusTarget | undefined>(undefined)
  useEffect(() => {
    const target = focusNext.current
    const root = list.current
    if (target === undefined || root === null) return
    focusNext.current = undefined
    const selector =
      target.action === "add"
        ? '[data-list-action="add"]'
        : target.action === "first"
          ? `[data-item="${target.item}"] > :last-child`
          : `[data-item="${target.item}"] [data-list-action="${target.action}"]`
    const el = root.querySelector<HTMLElement>(selector)
    const focusable = el?.matches(FOCUSABLE)
      ? el
      : el?.querySelector<HTMLElement>(FOCUSABLE)
    focusable?.focus()
  })

  const add = (n: number) => {
    if (onlyEmpty) return
    set([...items, ...Array.from({ length: n }, fresh)])
    // A single item added at the end of a fully shown list stays in view.
    if (n === 1 && items.length === reach) setShown(reach + 1)
  }
  const move = (from: number, to: number, action: "up" | "down") => {
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    if (moved !== undefined) next.splice(to, 0, moved)
    // Moving the node can blur it; the focus follows the item.
    focusNext.current = { item: to, action }
    set(next)
  }
  const remove = (index: number, id: number) => {
    const next = items.filter((x) => x.id !== id)
    focusNext.current =
      next.length === 0
        ? { action: "add" }
        : { item: Math.min(index, next.length - 1), action: "remove" }
    set(next)
  }
  const countNumber = Number.parseInt(count, 10)
  const addMany =
    !onlyEmpty &&
    Number.isInteger(countNumber) &&
    countNumber >= 1 &&
    countNumber <= MAX_ADD
      ? countNumber
      : undefined
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
      <div ref={list} className="stack-sm">
        {items.length === 0 && (
          <p className="subtle text-sm">
            {onlyEmpty
              ? "Empty: the item type has no values, so no item can be added."
              : "Empty: no items."}
          </p>
        )}
        {visible.length > 0 && (
          <ol className="list-plain form-list-items">
            {visible.map((entry, i) => (
              <li key={entry.id} className="form-list-item" data-item={i}>
                <div className="form-list-item-head">
                  <span className="mono text-xs muted">[{i}]</span>
                  <div className="row-sm">
                    {/* aria-disabled, not disabled: the item that moves to an
                        end keeps the focus on its button. */}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      data-list-action="up"
                      aria-label={`Move ${name}[${i}] up`}
                      aria-disabled={i === 0 || undefined}
                      onClick={() => move(i, i - 1, "up")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      data-list-action="down"
                      aria-label={`Move ${name}[${i}] down`}
                      aria-disabled={i === items.length - 1 || undefined}
                      onClick={() => move(i, i + 1, "down")}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      data-list-action="remove"
                      aria-label={`Remove ${name}[${i}]`}
                      onClick={() => remove(i, entry.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <Field
                  schema={item}
                  draft={entry.draft}
                  path={childPath(path, i)}
                  a11yLabel={`${name}[${i}]`}
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
        {items.length > reach && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              // This button goes once every item shows: the focus moves to
              // the first item it revealed, where reading goes on.
              focusNext.current = { item: reach, action: "first" }
              setShown(reach + PAGE)
            }}
          >
            Show {Math.min(PAGE, items.length - reach)} more (
            {items.length - reach} hidden)
          </button>
        )}
        <div className="row-sm form-list-actions">
          <button
            type="button"
            className="btn btn-sm"
            data-list-action="add"
            disabled={onlyEmpty}
            onClick={() => add(1)}
          >
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
              disabled={onlyEmpty}
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
              onClick={() => {
                focusNext.current = { action: "add" }
                set([])
              }}
            >
              Remove all
            </button>
          )}
        </div>
      </div>
    </Group>
  )
}
