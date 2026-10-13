import type { ReactElement, ReactNode } from "react"
import { formatByteSize } from "../lib/format.ts"
import { CopyButton } from "./CopyButton.tsx"
import { downloadText } from "./download.ts"

export interface CodeProps {
  /** The text, rendered as text (never as HTML). */
  text: string
  /** A label above the block ("candid", "typescript"). */
  label?: ReactNode
  /** Shows the UTF-8 size next to the label. */
  showSize?: boolean
  copy?: boolean
  /** Offers a download of exactly `text`. */
  download?: { filename: string; type?: string }
  /** Wrap long lines instead of scrolling sideways. */
  wrap?: boolean
  /** A CSS length; the block scrolls past it. */
  maxHeight?: string
  /** Accessible name of the block, for long code a reader can skip. */
  ariaLabel?: string
}

const encoder = new TextEncoder()

/** A code block with an optional toolbar: label, size, copy, download. */
export function Code({
  text,
  label,
  showSize = false,
  copy = true,
  download,
  wrap = false,
  maxHeight,
  ariaLabel,
}: CodeProps): ReactElement {
  const hasToolbar =
    label !== undefined || showSize || copy || download !== undefined
  return (
    <div className="ui-code">
      {hasToolbar && (
        <div className="ui-code-toolbar">
          <span className="row-sm">
            {label !== undefined && (
              <span className="ui-code-label">{label}</span>
            )}
            {showSize && (
              <span className="subtle text-xs tabular">
                {formatByteSize(encoder.encode(text).length)}
              </span>
            )}
          </span>
          <span className="row-sm">
            {copy && <CopyButton text={text} />}
            {download !== undefined && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  downloadText(download.filename, text, download.type)
                }
              >
                <DownloadIcon />
                <span>Download</span>
              </button>
            )}
          </span>
        </div>
      )}
      <pre
        className={wrap ? "code code-wrap" : "code"}
        style={maxHeight === undefined ? undefined : { maxHeight }}
        tabIndex={0}
        aria-label={ariaLabel}
      >
        {text}
      </pre>
    </div>
  )
}

function DownloadIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 2.5v8m0 0 3-3m-3 3-3-3M3 13.5h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
