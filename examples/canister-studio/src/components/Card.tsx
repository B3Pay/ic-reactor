import type { ReactElement, ReactNode } from "react"

export interface CardProps {
  /** Heading text; with `actions` it forms the card header. */
  title?: ReactNode
  subtitle?: ReactNode
  /** Controls at the right of the header. */
  actions?: ReactNode
  footer?: ReactNode
  /** A recessed card (nested panels, previews). */
  inset?: boolean
  /** The heading level of `title`, so a page keeps its outline. */
  headingLevel?: 2 | 3 | 4
  className?: string
  /** Labels the card as a region when it has a title. */
  id?: string
  children?: ReactNode
}

/** The design system's card: optional header, body and footer. */
export function Card({
  title,
  subtitle,
  actions,
  footer,
  inset = false,
  headingLevel = 3,
  className,
  id,
  children,
}: CardProps): ReactElement {
  const Heading = `h${headingLevel}` as const
  const headingId = id === undefined ? undefined : `${id}-title`
  const classes = ["card"]
  if (inset) classes.push("card-inset")
  if (className !== undefined) classes.push(className)
  const hasHeader =
    title !== undefined || subtitle !== undefined || actions !== undefined
  return (
    <section
      className={classes.join(" ")}
      id={id}
      aria-labelledby={title === undefined ? undefined : headingId}
    >
      {hasHeader && (
        <div className="card-header">
          <div className="stack-xs grow">
            {title !== undefined && (
              <Heading className="card-title" id={headingId}>
                {title}
              </Heading>
            )}
            {subtitle !== undefined && (
              <p className="card-subtitle">{subtitle}</p>
            )}
          </div>
          {actions !== undefined && <div className="row">{actions}</div>}
        </div>
      )}
      {children !== undefined && <div className="card-body">{children}</div>}
      {footer !== undefined && <div className="card-footer">{footer}</div>}
    </section>
  )
}
