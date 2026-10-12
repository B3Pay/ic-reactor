import { useEffect, useId, useRef, type JSX, type KeyboardEvent } from "react"
import { ModeBadge } from "../components/Badge.tsx"
import { MODE_LABEL } from "../components/modes.ts"
import type { CanisterInterface, MethodInfo } from "../interface/types.ts"
import { formatByteSize, formatNanos } from "../lib/format.ts"
import { toHex } from "../lib/hex.ts"
import { candidArgsText } from "../values/candid-text.ts"
import { useSha256 } from "../values/use-sha256.ts"
import {
  createdAtNanos,
  createdAtTimeOf,
  dedupeShapeOf,
  duplicateTagOf,
  knownDeduplicating,
} from "./dedupe.ts"
import { sameBytes } from "./prepare.ts"

/** A send whose outcome is unknown: its exact argument bytes and its sender. */
export interface EarlierSend {
  readonly bytes: Uint8Array
  readonly caller: string
}

export interface ConfirmWriteProps {
  iface: CanisterInterface
  method: MethodInfo
  values: readonly unknown[]
  /** The exact encoded argument bytes that will be sent. */
  bytes: Uint8Array
  /** The sender's principal text. */
  caller: string
  /**
   * Earlier sends of this method whose outcome is still unknown, with the
   * sender each went out as: the step says how this write relates to them.
   */
  earlierUnknown?: readonly EarlierSend[]
  /** A write is in flight: the step cannot send another until it settles. */
  busy?: boolean
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

function DedupeLine(props: {
  iface: CanisterInterface
  method: MethodInfo
  values: readonly unknown[]
}) {
  const shape = dedupeShapeOf(props.method)
  if (shape === undefined) {
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
        re-send would be a second write.
      </>
    )
  }
  const tag = <code className="code-inline">{duplicateTagOf(shape)}</code>
  return (
    <>
      <code className="code-inline">created_at_time</code> ={" "}
      {formatNanos(nanos)} (<span className="mono">{nanos.toString()}</span>{" "}
      ns).{" "}
      {knownDeduplicating(props.iface, props.method) ? (
        <>The same bytes sent again by the same sender answer {tag}.</>
      ) : (
        <>
          If this canister deduplicates on it, as ICRC-1 ledgers do, the same
          bytes sent again by the same sender answer {tag}; otherwise sending
          them again runs the call again.
        </>
      )}
    </>
  )
}

/**
 * The warning of a write sent while earlier sends of the method may have
 * executed. Only the same bytes, carrying a created_at_time, from the same
 * sender can be told apart from a new write: anything else runs as well if
 * one of them ran.
 */
function EarlierUnknown(props: {
  iface: CanisterInterface
  method: MethodInfo
  values: readonly unknown[]
  bytes: Uint8Array
  caller: string
  earlier: readonly EarlierSend[]
}) {
  const { iface, method, values, bytes, caller, earlier } = props
  const shape = dedupeShapeOf(method)
  const stamped = shape !== undefined && createdAtTimeOf(values[0]) !== null
  const sameArgs = earlier.filter((sent) => sameBytes(sent.bytes, bytes))
  const one = earlier.length === 1
  const ranToo = `If ${one ? "that one" : "one of them"} ran, this runs as well. Read the state back first when unsure.`
  let text: string
  if (sameArgs.length === 0) {
    text = `This is a new write, with other bytes${stamped ? " and its own created_at_time" : ""}: the canister does not take it for a re-send of ${one ? "the earlier one" : "those"}. ${ranToo}`
  } else if (!stamped) {
    text = `These are the exact bytes of an earlier send whose outcome is unknown, but ${shape === undefined ? "this method has no created_at_time" : "they carry no created_at_time"}: the canister has nothing to deduplicate on, so sending them again runs the write again. ${ranToo}`
  } else if (!sameArgs.some((sent) => sent.caller === caller)) {
    text = `These are the exact bytes of an earlier send whose outcome is unknown, but that one went out as ${sameArgs[0]!.caller} and this goes out as ${caller}: a canister that deduplicates tells senders apart, so it does not take this for a re-send. ${ranToo}`
  } else {
    const tag = duplicateTagOf(shape)
    text = knownDeduplicating(iface, method)
      ? `These are the exact bytes of an earlier send whose outcome is unknown, from the same sender: the canister answers ${tag} if that one ran, and runs this one only if it did not.`
      : `These are the exact bytes of an earlier send whose outcome is unknown, from the same sender. If this canister deduplicates them, as ICRC-1 ledgers do, it answers ${tag} if that one ran; otherwise it runs the call again.`
  }
  return (
    <div
      className="notice notice-danger call-confirm-earlier"
      role="note"
      aria-label="Earlier send unknown"
    >
      <p className="notice-title">
        {one
          ? "An earlier send of this method may have executed"
          : `${earlier.length} earlier sends of this method may have executed`}
      </p>
      <p>{text}</p>
    </div>
  )
}

/**
 * The confirm step before a write: sender, target, method, Candid text, byte
 * size and sha256 of the exact bytes, and "may execute once".
 */
export function ConfirmWrite(props: ConfirmWriteProps): JSX.Element {
  const { iface, method, values, bytes, caller, onConfirm, onCancel } = props
  const earlier = props.earlierUnknown ?? []
  const busy = props.busy === true
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
        {earlier.length > 0 && (
          <EarlierUnknown
            iface={iface}
            method={method}
            values={values}
            bytes={bytes}
            caller={caller}
            earlier={earlier}
          />
        )}
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
            <DedupeLine iface={iface} method={method} values={values} />
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
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={onConfirm}
        >
          {oneway ? "Send oneway call" : "Send update"}
        </button>
      </div>
    </section>
  )
}
