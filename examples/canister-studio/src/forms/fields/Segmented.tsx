import { useRef, type KeyboardEvent, type ReactNode } from "react"

export interface SegmentOption<T extends string> {
  readonly value: T
  readonly label: ReactNode
  readonly disabled?: boolean
  readonly title?: string
}

interface SegmentedProps<T extends string> {
  readonly id?: string
  readonly options: readonly SegmentOption<T>[]
  readonly value: T
  readonly onChange: (value: T) => void
  /** The group's accessible name. */
  readonly label: string
}

/**
 * A radio group drawn as a segmented control: one tab stop (the checked
 * option), arrow keys move the choice and skip disabled options.
 */
export function Segmented<T extends string>({
  id,
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>): ReactNode {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const checked = options.findIndex((o) => o.value === value)
  // With nothing checked, the first enabled option keeps the group reachable.
  const tabStop =
    checked !== -1 ? checked : options.findIndex((o) => !o.disabled)

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0
    if (step === 0) return
    event.preventDefault()
    for (let n = 1; n <= options.length; n++) {
      const next = (index + step * n + options.length * n) % options.length
      const option = options[next]
      if (option !== undefined && option.disabled !== true) {
        onChange(option.value)
        buttons.current[next]?.focus()
        return
      }
    }
  }

  return (
    <div id={id} className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(el) => {
            buttons.current[index] = el
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={index === tabStop ? 0 : -1}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
