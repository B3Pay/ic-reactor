import type { MethodMode } from "@candid-core/schema"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react"
import type { MethodInfo } from "../interface/types.ts"
import { groupDigits } from "../lib/format.ts"
import { Badge } from "./Badge.tsx"
import { MODE_LABEL, MODE_ORDER } from "./modes.ts"

export interface MethodListProps {
  canisterId: string
  methods: readonly MethodInfo[]
  /** The selected method's name (`?method=`). */
  selected?: string
  /** Updates the registry offers as reads (`{ update: "idempotent" }`). */
  idempotent?: readonly string[]
  /** Kept in the links, so switching methods keeps the certified choice. */
  certified?: boolean
}

type ModeFilter = "all" | MethodMode

const MODE_HEADING: Readonly<Record<MethodMode, string>> = {
  query: "Queries",
  composite_query: "Composite queries",
  update: "Updates",
  oneway: "Oneway",
}

/**
 * The canister's methods, searchable, filterable by mode and grouped by it.
 * One tab stop: arrow keys (and Home/End) move between methods, Enter in
 * the search box opens the first match.
 */
export function MethodList({
  canisterId,
  methods,
  selected,
  idempotent = [],
  certified,
}: MethodListProps): ReactElement {
  const navigate = useNavigate()
  const ids = useId()
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<ModeFilter>("all")
  const listRef = useRef<HTMLDivElement>(null)

  const presentModes = useMemo(
    () => MODE_ORDER.filter((m) => methods.some((method) => method.mode === m)),
    [methods]
  )
  const idempotentSet = useMemo(() => new Set(idempotent), [idempotent])

  const needle = query.trim().toLowerCase()
  const visible = methods.filter(
    (method) =>
      (mode === "all" || method.mode === mode) &&
      (needle === "" || method.name.toLowerCase().includes(needle))
  )
  const groups = presentModes.flatMap((m) => {
    const items = visible.filter((method) => method.mode === m)
    return items.length === 0 ? [] : [{ mode: m, items }]
  })
  const ordered = groups.flatMap((group) => group.items)
  // The one link reachable with Tab: the selected method, else the first.
  const tabStop =
    ordered.find((method) => method.name === selected)?.name ?? ordered[0]?.name

  const links = (): HTMLAnchorElement[] =>
    Array.from(
      listRef.current?.querySelectorAll<HTMLAnchorElement>(
        "a[data-method-link]"
      ) ?? []
    )

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>): void => {
    const all = links()
    if (all.length === 0) return
    const index = all.findIndex((link) => link === document.activeElement)
    let next: number | undefined
    if (event.key === "ArrowDown") next = Math.min(index + 1, all.length - 1)
    else if (event.key === "ArrowUp") next = Math.max(index - 1, 0)
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = all.length - 1
    if (next === undefined) return
    event.preventDefault()
    all[next]?.focus()
  }

  const open = (name: string): void => {
    void navigate({
      to: "/canister/$canisterId",
      params: { canisterId },
      search: { method: name, certified },
    })
  }

  return (
    <div className="method-list">
      <div className="stack-sm method-list-controls">
        <label htmlFor={`${ids}-search`} className="sr-only">
          Search methods
        </label>
        <input
          id={`${ids}-search`}
          className="input"
          type="search"
          placeholder={`Search ${groupDigits(methods.length)} methods`}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            const first = ordered[0]
            if (event.key === "Enter" && first !== undefined) {
              event.preventDefault()
              open(first.name)
            } else if (event.key === "ArrowDown") {
              event.preventDefault()
              links()[0]?.focus()
            }
          }}
          aria-controls={`${ids}-list`}
        />
        {presentModes.length > 1 && (
          <div
            className="segmented method-list-modes"
            role="radiogroup"
            aria-label="Filter by mode"
          >
            {(["all", ...presentModes] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
              >
                {m === "all" ? "All" : MODE_LABEL[m]}
              </button>
            ))}
          </div>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {groupDigits(ordered.length)} of {groupDigits(methods.length)} methods
          shown
        </p>
      </div>

      <div
        id={`${ids}-list`}
        ref={listRef}
        className="method-list-groups"
        onKeyDown={moveFocus}
      >
        {groups.length === 0 && (
          <p className="muted text-sm method-list-empty">
            No method matches “{query.trim()}”.
          </p>
        )}
        {groups.map((group) => (
          <section
            key={group.mode}
            className="method-list-group"
            aria-labelledby={`${ids}-${group.mode}`}
          >
            <h2 id={`${ids}-${group.mode}`} className="method-list-heading">
              <span>{MODE_HEADING[group.mode]}</span>
              <span className="subtle tabular">
                {groupDigits(group.items.length)}
              </span>
            </h2>
            <ul className="list-plain">
              {group.items.map((method) => {
                const isSelected = method.name === selected
                return (
                  <li key={method.name}>
                    <Link
                      to="/canister/$canisterId"
                      params={{ canisterId }}
                      search={{ method: method.name, certified }}
                      className="method-list-item"
                      data-method-link=""
                      aria-current={isSelected ? "true" : undefined}
                      tabIndex={method.name === tabStop ? 0 : -1}
                      // The workspace's own page: never "active" by path.
                      activeProps={{}}
                    >
                      <span className="mono truncate method-list-name">
                        {method.name}
                      </span>
                      <span className="row-sm row-nowrap shrink-0">
                        {idempotentSet.has(method.name) && (
                          <Badge
                            tone="info"
                            title="An update that changes nothing: offered as a read through { update: 'idempotent' }"
                          >
                            idempotent
                          </Badge>
                        )}
                        <span
                          className="subtle text-xs tabular"
                          title={`${method.args.length} ${method.args.length === 1 ? "argument" : "arguments"}, ${method.results.length} ${method.results.length === 1 ? "result" : "results"}`}
                        >
                          {method.args.length}→{method.results.length}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
