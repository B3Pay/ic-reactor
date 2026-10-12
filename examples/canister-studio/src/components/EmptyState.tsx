import type { ReactElement, ReactNode } from "react"

export interface EmptyStateProps {
  /** A short code above the title ("404"). */
  code?: string
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  /** `h1` on a page of its own (not found), `h2` inside a page. */
  headingLevel?: 1 | 2 | 3
  role?: "alert" | "status"
}

/** A centered, dashed panel for "nothing here (yet)" and "not found". */
export function EmptyState({
  code,
  title,
  children,
  actions,
  headingLevel = 2,
  role,
}: EmptyStateProps): ReactElement {
  const Heading = `h${headingLevel}` as const
  return (
    <section className="empty-state" role={role}>
      {code !== undefined && <p className="empty-state-code mono">{code}</p>}
      <Heading>{title}</Heading>
      {children !== undefined && (
        <div className="muted stack-sm">{children}</div>
      )}
      {actions !== undefined && <div className="row">{actions}</div>}
    </section>
  )
}
