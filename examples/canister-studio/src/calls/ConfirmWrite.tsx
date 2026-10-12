import { useEffect, useId, useRef, type JSX, type KeyboardEvent } from "react"
import { ModeBadge } from "../components/Badge.tsx"
import { MODE_LABEL } from "../components/modes.ts"
import type { CanisterInterface, MethodInfo } from "../interface/types.ts"
import { formatByteSize, formatNanos } from "../lib/format.ts"
import { toHex } from "../lib/hex.ts"
import { candidArgsText } from "../values/candid-text.ts"
import { useSha256 } from "../values/use-sha256.ts"
import { createdAtNanos, createdAtTimeOf, dedupeShapeOf } from "./dedupe.ts"

export interface ConfirmWriteProps {
  iface: CanisterInterface
  method: MethodInfo
  values: readonly unknown[]
  /** The exact encoded argument bytes that will be sent. */
  bytes: Uint8Array
  /** The sender's principal text. */
  caller: string
  onConfirm(): void
  onCancel(): void
}

function argsText(
  method: MethodInfo,
  values: readonly unknown[]
): string | undefined {
  try {
    return candidArgsText(method.args, values, { width: 80 })
  } catch {
    // The hex below is the exact message either way.
    return undefined
  }
}

function DedupeLine(props: { method: MethodInfo; values: readonly unknown[] }) {
  if (dedupeShapeOf(props.method) === undefined) {
    return (
      <>
        None: this method has no{" "}
        <code className="code-inline">created_at_time</code>. If the reply is
        lost, nothing can safely send it again.
      </>
    )
  }
  const nanos = createdAtNanos(createdAtTimeOf(props.values[0]))
  if (nanos === undefined) {
    return (
      <>
        Off: <code className="code-inline">created_at_time</code> is empty, so a
        re-send would be a second transfer.
      </>
    )
  }
  return (
    <>
      <code className="code-inline">created_at_time</code> ={" "}
      {formatNanos(nanos)} (<span className="mono">{nanos.toString()}</span>{" "}
      ns). The same bytes sent again by the same sender answer{" "}
      <code className="code-inline">Duplicate</code>.
    </>
  )
}

/**
 * The confirm step before a write: sender, target, method, Candid text, byte
 * size and sha256 of the exact bytes, and "may execute once".
 */
export function ConfirmWrite(props: ConfirmWriteProps): JSX.Element {
  const { iface, method, values, bytes, caller, onConfirm, onCancel } = props
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const sha = useSha256(bytes)
  const candid = argsText(method, values)
  const oneway = method.mode === "oneway"

  // Keyboard and screen reader users land on the step that just opened.
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      onCancel()
    }
  }

  return (
    <section
      className="card call-confirm"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <div className="card-header">
        <h3 id={titleId} ref={titleRef} tabIndex={-1} className="card-title">
          Confirm this {MODE_LABEL[method.mode]}
        </h3>
        <ModeBadge mode={method.mode} />
      </div>
      <div className="card-body stack">
        <dl className="kv">
          <dt>Sender</dt>
          <dd className="mono break-all" data-testid="confirm-sender">
            {caller}
          </dd>
          <dt>Target</dt>
          <dd>
            {iface.name}{" "}
            <span className="mono break-all">{iface.canisterId}</span>
          </dd>
          <dt>Method</dt>
          <dd className="mono break-all">{method.name}</dd>
          <dt>Arguments</dt>
          <dd>
            {candid === undefined ? (
              <span className="muted">See the exact bytes below.</span>
            ) : (
              <pre className="code call-confirm-candid">{candid}</pre>
            )}
          </dd>
          <dt>Size</dt>
          <dd>
            {bytes.length < 1024
              ? `${bytes.length} bytes`
              : `${formatByteSize(bytes.length)} (${bytes.length} bytes)`}
          </dd>
          <dt>SHA-256</dt>
          <dd className="mono break-all" data-testid="confirm-sha256">
            {sha ?? "computing…"}
          </dd>
          <dt>Deduplication</dt>
          <dd>
            <DedupeLine method={method} values={values} />
          </dd>
        </dl>
        <details className="disclosure">
          <summary>Exact bytes (hex)</summary>
          <div className="disclosure-body">
            <pre className="code break-all call-confirm-hex">
              {toHex(bytes)}
            </pre>
          </div>
        </details>
        <div className="notice notice-warn" role="note">
          <p className="notice-title">
            This may execute once, and only once per send
          </p>
          <p>
            {oneway
              ? "A oneway call returns no reply and no outcome: once sent, nothing tells you whether it ran."
              : "The client never re-sends it after a failure that may have run it. If the reply is lost, the outcome is unknown: read the state back before sending it again."}
          </p>
        </div>
      </div>
      <div className="card-footer row row-end">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          {oneway ? "Send oneway call" : "Send update"}
        </button>
      </div>
    </section>
  )
}
