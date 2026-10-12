import type { ReactElement } from "react"

/** A spinner with a label for screen readers. */
export function Spinner({
  size = "md",
  label = "Loading",
}: {
  size?: "sm" | "md"
  label?: string
}): ReactElement {
  return (
    <span className="row-sm row-nowrap" role="status">
      <span
        className={size === "sm" ? "spinner spinner-sm" : "spinner"}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** A shimmering placeholder line, `width` as any CSS length. */
export function Skeleton({
  width = "100%",
  height = "1em",
}: {
  width?: string
  height?: string
}): ReactElement {
  return (
    <span className="skeleton" style={{ width, height }} aria-hidden="true" />
  )
}
