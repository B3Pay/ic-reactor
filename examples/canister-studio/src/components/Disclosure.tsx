import type { ReactElement, ReactNode } from "react"

export interface DisclosureProps {
  summary: ReactNode
  /** Text after the summary, muted (a count, a size). */
  meta?: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}

/** A native `<details>`: keyboard and screen-reader support for free. */
export function Disclosure({
  summary,
  meta,
  defaultOpen = false,
  className,
  children,
}: DisclosureProps): ReactElement {
  return (
    <details
      className={
        className === undefined ? "disclosure" : `disclosure ${className}`
      }
      open={defaultOpen}
    >
      <summary>
        <span className="grow">{summary}</span>
        {meta !== undefined && <span className="muted text-xs">{meta}</span>}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  )
}
