import {
  useId,
  useRef,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react"

export interface TabItem<K extends string> {
  key: K
  label: ReactNode
  /** Disabled tabs stay visible and say why (on hover). */
  disabledReason?: string
}

export interface TabsProps<K extends string> {
  tabs: readonly TabItem<K>[]
  selected: K
  onSelect(key: K): void
  /** Names the tab list for screen readers. */
  label: string
  /** The selected tab's panel. */
  children: ReactNode
}

/**
 * WAI-ARIA tabs: one tab stop for the list, arrow keys (and Home/End) move
 * between tabs and select them, the panel is labelled by its tab. Ids come
 * from `useId`, so the server and the browser render the same markup.
 */
export function Tabs<K extends string>({
  tabs,
  selected,
  onSelect,
  label,
  children,
}: TabsProps<K>): ReactElement {
  const base = useId()
  const refs = useRef(new Map<K, HTMLButtonElement>())
  const enabled = tabs.filter((tab) => tab.disabledReason === undefined)

  const move = (event: KeyboardEvent<HTMLDivElement>): void => {
    const index = enabled.findIndex((tab) => tab.key === selected)
    let next: number | undefined
    if (event.key === "ArrowRight") next = (index + 1) % enabled.length
    else if (event.key === "ArrowLeft")
      next = (index - 1 + enabled.length) % enabled.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = enabled.length - 1
    const target = next === undefined ? undefined : enabled[next]
    if (target === undefined) return
    event.preventDefault()
    onSelect(target.key)
    refs.current.get(target.key)?.focus()
  }

  return (
    <div className="ui-tabs">
      <div className="tabs" role="tablist" aria-label={label} onKeyDown={move}>
        {tabs.map((tab) => {
          const isSelected = tab.key === selected
          return (
            <button
              key={tab.key}
              ref={(node) => {
                if (node === null) refs.current.delete(tab.key)
                else refs.current.set(tab.key, node)
              }}
              type="button"
              role="tab"
              className="tab"
              id={`${base}-tab-${tab.key}`}
              aria-selected={isSelected}
              aria-controls={`${base}-panel`}
              tabIndex={isSelected ? 0 : -1}
              disabled={tab.disabledReason !== undefined}
              title={tab.disabledReason}
              onClick={() => onSelect(tab.key)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div
        className="tab-panel"
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${selected}`}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  )
}
