import { useClient } from "@ic-reactor/react"
import { useQuery } from "@tanstack/react-query"
import type { JSX } from "react"
import { ActionButton } from "../components/ActionButton.tsx"
import type { CanisterInterface } from "../interface/types.ts"
import type { TokenUnits } from "../lib/format.ts"
import { formatNanos } from "../lib/format.ts"
import { ReplyView } from "../values/ReplyView.tsx"
import { ErrorPanel } from "./ErrorPanel.tsx"
import { readQueryOptions } from "./query-options.ts"
import { readNow } from "./read.ts"
import type { ReadBack } from "./readback.ts"
import { useCanisterHandle } from "./useCanisterHandle.ts"

export interface ResendPanelProps {
  /** The principal the offer holds the write to (`resend.from`). */
  from: string
  /** The write's `created_at_time`, in nanoseconds. */
  createdAt?: bigint
  /**
   * Whether the canister is known to deduplicate this method
   * (`knownDeduplicating`). Otherwise the offer is worded as conditional:
   * a `created_at_time` field alone proves nothing.
   */
  known: boolean
  /** The Err tag a duplicate is answered with (`duplicateTagOf`). */
  duplicateTag: string
  busy?: boolean
  onResend(): void
}

/**
 * The offer `client.resendOf()` made: the same bytes, to the same canister,
 * as the same sender, which a deduplicating canister runs at most once.
 */
export function ResendPanel(props: ResendPanelProps): JSX.Element {
  const tag = <code className="code-inline">{props.duplicateTag}</code>
  const sender = <span className="mono break-all">{props.from}</span>
  return (
    <div
      className="notice notice-info call-resend"
      role="region"
      aria-label="Safe re-send"
    >
      <p className="notice-title">
        {props.known
          ? "Re-send safely"
          : "Re-send, if the canister deduplicates"}
      </p>
      <p>
        The write carries <code className="code-inline">created_at_time</code>
        {props.createdAt !== undefined && (
          <> ({formatNanos(props.createdAt)})</>
        )}
        {props.known ? (
          <>
            , and this canister runs a transaction at most once per sender.
            Sending the same bytes again as {sender} either runs it now, if the
            first send never ran, or answers {tag}, if it already did: it never
            runs twice. Past the canister&apos;s deduplication window (a day on
            most ledgers) the re-send is refused as too old, which says nothing
            about the first send.
          </>
        ) : (
          <>
            . If this canister deduplicates on it, as ICRC-1 ledgers do, sending
            the same bytes again as {sender} either runs it now, if the first
            send never ran, or answers {tag}, if it already did. Nothing here
            proves that it does: if it does not, this runs the call a second
            time. Read the state back first when unsure.
          </>
        )}
      </p>
      <div className="row">
        <ActionButton
          className="btn btn-primary btn-sm"
          unavailable={props.busy === true}
          onClick={props.onResend}
        >
          {props.busy === true ? "Re-sending…" : "Re-send the same bytes"}
        </ActionButton>
      </div>
    </div>
  )
}

/** Why no safe re-send is offered while a write's outcome is unknown. */
export function NoResendNotice(props: {
  reason: string
  /** Given when nothing else on the page offers the read-back. */
  onReadBack?(): void
}): JSX.Element {
  return (
    <div className="notice notice-warn call-no-resend" role="note">
      <p className="notice-title">Outcome unknown: read the state back first</p>
      <p>No safe re-send: {props.reason}</p>
      {props.onReadBack !== undefined && (
        <div className="row">
          <button
            type="button"
            className="btn btn-sm"
            onClick={props.onReadBack}
          >
            Read the state back
          </button>
        </div>
      )}
    </div>
  )
}

export interface ReadBackPanelProps {
  iface: CanisterInterface
  readBack: ReadBack
  units?: TokenUnits
}

/**
 * Reads the state a write with an unknown outcome would have changed. The
 * failed write already invalidated the canister's reads; the runner starts
 * the read when the reader asks for it (`readNow`, so it is in the history),
 * and this panel observes it.
 */
export function ReadBackPanel(props: ReadBackPanelProps): JSX.Element {
  const { iface, readBack, units } = props
  const client = useClient()
  const can = useCanisterHandle(iface)
  const read = useQuery(
    readQueryOptions(client, can, readBack.method, readBack.call.vars)
  )
  return (
    <section className="card card-inset call-readback" aria-label="Read back">
      <div className="card-header">
        <h4 className="card-title">
          Read back: <span className="mono">{readBack.method.name}</span>
        </h4>
        <ActionButton
          className="btn btn-sm btn-ghost"
          unavailable={read.isFetching}
          onClick={() =>
            readNow(client, can, iface, readBack.method, readBack.call)
          }
        >
          {read.isFetching ? "Reading…" : "Read again"}
        </ActionButton>
      </div>
      <div className="card-body stack-sm">
        <p className="muted text-sm">{readBack.label}</p>
        {read.error !== null ? (
          <ErrorPanel
            error={read.error}
            method={readBack.method}
            units={units}
          />
        ) : read.data === undefined ? (
          <p className="row-sm muted" role="status">
            <span className="spinner spinner-sm" aria-hidden="true" /> Reading…
          </p>
        ) : (
          <ReplyView method={readBack.method} reply={read.data} units={units} />
        )}
      </div>
    </section>
  )
}
