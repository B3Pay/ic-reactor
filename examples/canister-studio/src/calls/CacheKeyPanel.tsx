import type { QueryKey } from "@tanstack/react-query"
import type { JSX } from "react"

export interface CacheKeyPanelProps {
  /** The read's key, as `client.queryKey()` / `readQueryOptions()` build it. */
  queryKey: QueryKey
  /** TanStack Query's view of that key, when the panel shows a live read. */
  status?: "pending" | "success" | "error"
  fetching?: boolean
}

// `["ic-reactor", network, caller, canisterId, method, args…]`, plus
// "certified" for the certified twin. The positions are ic-reactor's; the
// panel only names them.

interface Segment {
  readonly name: string
  readonly value: string
  readonly note?: string
}

function segmentsOf(key: QueryKey): Segment[] {
  const parts = key.map((part) =>
    typeof part === "string" ? part : JSON.stringify(part)
  )
  const [root, network, caller, canister, method, ...rest] = parts
  const segments: Segment[] = []
  const push = (name: string, value: string | undefined, note?: string) => {
    if (value !== undefined) segments.push({ name, value, note })
  }
  push("root", root)
  push("network", network)
  push(
    "caller",
    caller,
    "Each principal has its own entries: one caller's answer is never served to another."
  )
  push("canister", canister)
  push("method", method)
  const certified = rest[rest.length - 1] === "certified"
  const args = certified ? rest.slice(0, -1) : rest
  if (args[0] === "$skip") {
    push("args", "$skip", "Nothing submitted yet: the read is skipped.")
  } else if (args[0] === "$invalid") {
    push("args", args.slice(1).join(" "), "These arguments do not encode.")
  } else {
    push("args", args[0], "The hex of the Candid encoding of the arguments.")
  }
  if (certified) {
    push(
      "certified",
      "certified",
      "The certified twin keeps entries of its own."
    )
  }
  return segments
}

/**
 * A read's live query key, segment by segment, with the caller segment
 * highlighted: the key is how ic-reactor keeps principals apart in one
 * cache, and why nothing writes it by hand.
 */
export function CacheKeyPanel(props: CacheKeyPanelProps): JSX.Element {
  const segments = segmentsOf(props.queryKey)
  return (
    <details className="disclosure call-cache" open>
      <summary>
        Query key
        {props.status !== undefined && (
          <span className="badge">
            {props.fetching === true ? "fetching" : props.status}
          </span>
        )}
      </summary>
      <div className="disclosure-body">
        <ol className="list-plain call-key" aria-label="Query key segments">
          {segments.map((segment) => (
            <li
              key={segment.name}
              className={
                segment.name === "caller"
                  ? "call-key-segment call-key-caller"
                  : "call-key-segment"
              }
            >
              <span className="call-key-name">{segment.name}</span>
              <code className="call-key-value mono break-all">
                {segment.value}
              </code>
              {segment.note !== undefined && (
                <span className="call-key-note subtle">{segment.note}</span>
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs muted">
          Built by <code className="code-inline">client.queryKey()</code>, never
          by hand: a key written by hand leaves the caller out.
        </p>
      </div>
    </details>
  )
}
