import { useState, type JSX } from "react"
import { argsFitInUrl, sharedCallUrl } from "./share.ts"

export interface ShareLinkProps {
  canisterId: string
  method: string
  /** The arguments to share; the button is disabled until there are some. */
  bytes: Uint8Array | undefined
  /** Whether the link runs the read when opened (reads only). */
  run: boolean
  certified?: boolean
  /** Given: handed the link (a path). Absent: the absolute URL is copied. */
  onShare?(url: string): void
}

/** "Copy link": the call as a URL, so someone else opens it filled in (and run, for a read). */
export function ShareLink(props: ShareLinkProps): JSX.Element {
  const { canisterId, method, bytes, run, certified, onShare } = props
  const [status, setStatus] = useState<string>()
  const tooLarge = bytes !== undefined && !argsFitInUrl(bytes)

  const share = async () => {
    if (bytes === undefined) return
    const url = sharedCallUrl(canisterId, method, bytes, run, { certified })
    if (onShare !== undefined) {
      onShare(url)
      setStatus("Link ready.")
      return
    }
    try {
      await navigator.clipboard.writeText(
        new URL(url, window.location.href).href
      )
      setStatus("Link copied.")
    } catch {
      setStatus("Could not copy: the browser refused clipboard access.")
    }
  }

  return (
    <div className="row-sm call-share">
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        disabled={bytes === undefined}
        onClick={() => void share()}
      >
        {run ? "Copy link to this result" : "Copy link to this call"}
      </button>
      <span className="text-xs muted" role="status" aria-live="polite">
        {tooLarge
          ? "The arguments are too large for a link: it opens the method unfilled."
          : status}
      </span>
    </div>
  )
}
