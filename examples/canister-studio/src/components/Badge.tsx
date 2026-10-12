import type { MethodMode } from "@candid-core/schema"
import type { ReactElement, ReactNode } from "react"
import { MODE_LABEL } from "./modes.ts"

export type BadgeTone =
  | "neutral"
  | "query"
  | "update"
  | "composite"
  | "oneway"
  | "ok"
  | "err"
  | "warn"
  | "info"
  | "certified"
  | "accent"
  | "network"

export interface BadgeProps {
  tone?: BadgeTone
  /** A leading dot in the badge's color. */
  dot?: boolean
  size?: "md" | "lg"
  /** Extra explanation, shown on hover. */
  title?: string
  className?: string
  children: ReactNode
}

/** A small status label in one of the design system's tones. */
export function Badge({
  tone = "neutral",
  dot = false,
  size = "md",
  title,
  className,
  children,
}: BadgeProps): ReactElement {
  const classes = ["badge"]
  if (tone !== "neutral") classes.push(`badge-${tone}`)
  if (dot) classes.push("badge-dot")
  if (size === "lg") classes.push("badge-lg")
  if (className !== undefined) classes.push(className)
  return (
    <span className={classes.join(" ")} title={title}>
      {children}
    </span>
  )
}

const MODE_TONE: Readonly<Record<MethodMode, BadgeTone>> = {
  query: "query",
  composite_query: "composite",
  update: "update",
  oneway: "oneway",
}

const MODE_TITLE: Readonly<Record<MethodMode, string>> = {
  query: "A read: answered by one replica, changes nothing.",
  composite_query:
    "A read that may call other canisters' queries; it has no certified path.",
  update: "A write: goes through consensus and may change state.",
  oneway: "A write sent without waiting: no reply, and no outcome to read.",
}

/** A method's mode as a colored badge. */
export function ModeBadge({
  mode,
  size,
}: {
  mode: MethodMode
  size?: "md" | "lg"
}): ReactElement {
  return (
    <Badge tone={MODE_TONE[mode]} size={size} title={MODE_TITLE[mode]}>
      {MODE_LABEL[mode]}
    </Badge>
  )
}
