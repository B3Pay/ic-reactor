import { useEffect, useRef, useState, type ReactElement } from "react"

export interface CopyButtonProps {
  /** The exact text put on the clipboard, or a function computing it on click (large values). */
  text: string | (() => string)
  /** Visible label; with `iconOnly` it becomes the accessible name. */
  label?: string
  /** The accessible name when the visible label alone is too short ("Copy principal"). */
  a11yLabel?: string
  iconOnly?: boolean
  size?: "sm" | "md"
  className?: string
}

type CopyState = "idle" | "copied" | "failed"

const RESET_AFTER_MS = 1600

/**
 * Copies `text` to the clipboard and says so for a moment. The result is
 * announced politely to screen readers.
 */
export function CopyButton({
  text,
  label = "Copy",
  a11yLabel,
  iconOnly = false,
  size = "sm",
  className,
}: CopyButtonProps): ReactElement {
  const [state, setState] = useState<CopyState>("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async (): Promise<void> => {
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(
        typeof text === "function" ? text() : text
      )
      setState("copied")
    } catch {
      // No clipboard permission (an insecure origin, a denied prompt).
      setState("failed")
    }
    timer.current = setTimeout(() => setState("idle"), RESET_AFTER_MS)
  }

  const classes = ["btn", "btn-ghost"]
  if (size === "sm") classes.push("btn-sm")
  if (iconOnly) classes.push("btn-icon")
  if (className !== undefined) classes.push(className)
  const status =
    state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""
  const name = iconOnly ? label : a11yLabel

  return (
    <>
      <button
        type="button"
        className={classes.join(" ")}
        onClick={() => void copy()}
        aria-label={name}
        title={name}
      >
        {state === "copied" ? <CheckIcon /> : <CopyIcon />}
        {!iconOnly && <span>{state === "idle" ? label : status}</span>}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </>
  )
}

function CopyIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="5"
        y="5"
        width="8.5"
        height="8.5"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M10.5 3.2V3a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10h.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CheckIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m3.5 8.5 3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
