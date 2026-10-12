import type { ReactElement, ReactNode } from "react"

export interface NoticeProps {
  tone?: "neutral" | "info" | "warn" | "danger" | "success"
  title?: ReactNode
  /**
   * `alert` interrupts a screen reader, `status` waits its turn. Defaults to
   * `alert` for danger and `status` for the rest; `none` for static text.
   */
  role?: "alert" | "status" | "none"
  className?: string
  children?: ReactNode
}

/** A boxed message: an explanation, a warning, a failure. */
export function Notice({
  tone = "neutral",
  title,
  role,
  className,
  children,
}: NoticeProps): ReactElement {
  const resolvedRole = role ?? (tone === "danger" ? "alert" : "status")
  const classes = ["notice"]
  if (tone !== "neutral") classes.push(`notice-${tone}`)
  if (className !== undefined) classes.push(className)
  return (
    <div
      className={classes.join(" ")}
      role={resolvedRole === "none" ? undefined : resolvedRole}
    >
      {title !== undefined && <p className="notice-title">{title}</p>}
      {children}
    </div>
  )
}
