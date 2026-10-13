import { useRef, type KeyboardEvent, type ReactElement } from "react"
import type { MethodInfo } from "../../interface/types.ts"
import { ModeBadge } from "../Badge.tsx"

/**
 * The playground's method list: local state, not URLs (a pasted interface
 * has no page of its own). One tab stop; arrow keys move and select.
 */
export function MethodPicker({
  methods,
  selected,
  onSelect,
}: {
  methods: readonly MethodInfo[]
  selected: string | undefined
  onSelect(name: string): void
}): ReactElement {
  const listRef = useRef<HTMLUListElement>(null)

  const move = (event: KeyboardEvent<HTMLUListElement>): void => {
    const index = methods.findIndex((method) => method.name === selected)
    let next: number | undefined
    if (event.key === "ArrowDown")
      next = Math.min(index + 1, methods.length - 1)
    else if (event.key === "ArrowUp") next = Math.max(index - 1, 0)
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = methods.length - 1
    const target = next === undefined ? undefined : methods[next]
    if (target === undefined) return
    event.preventDefault()
    onSelect(target.name)
    listRef.current
      ?.querySelectorAll<HTMLButtonElement>("button")
      [next ?? 0]?.focus()
  }

  return (
    <ul
      ref={listRef}
      className="list-plain method-list-groups"
      aria-label="Methods"
      onKeyDown={move}
    >
      {methods.map((method, i) => {
        const isSelected = method.name === selected
        return (
          <li key={method.name}>
            <button
              type="button"
              className="method-list-item"
              aria-pressed={isSelected}
              tabIndex={
                isSelected || (selected === undefined && i === 0) ? 0 : -1
              }
              onClick={() => onSelect(method.name)}
            >
              <span className="mono truncate method-list-name">
                {method.name}
              </span>
              <ModeBadge mode={method.mode} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
