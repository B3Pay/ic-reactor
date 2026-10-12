import { isReactorError } from "@ic-reactor/core"
import { useAuth, useClient } from "@ic-reactor/react"
import { useMutation } from "@tanstack/react-query"
import { useCallback, useId, useMemo, useState, type JSX } from "react"
import { nowNanos } from "../forms/convert.ts"
import { issuesFromReactorError, type CallCheck } from "../forms/engine.ts"
import { combineHints } from "../forms/hints.ts"
import { MethodForm } from "../forms/MethodForm.tsx"
import type { MethodInfo } from "../interface/types.ts"
import type { TokenUnits } from "../lib/format.ts"
import { CallPreview } from "../values/CallPreview.tsx"
import { ReplyView } from "../values/ReplyView.tsx"
import { ConfirmWrite } from "./ConfirmWrite.tsx"
import {
  createdAtNanos,
  createdAtTimeOf,
  dedupeShapeOf,
  hasCreatedAtTime,
  hideDedupeField,
  isDuplicateErr,
  stampCreatedAtTime,
  type DedupeShape,
} from "./dedupe.ts"
import { ErrorPanel } from "./ErrorPanel.tsx"
import { addHistoryEntry, newHistoryId } from "./history.ts"
import {
  SIGN_IN_REASON,
  needsSignIn,
  submitLabelOf,
  type CallKind,
} from "./kinds.ts"
import type { PreparedCall } from "./prepare.ts"
import { historyEntryOf, type CallResult } from "./record.ts"
import { readNow } from "./read.ts"
import { suggestReadBack, type ReadBack } from "./readback.ts"
import { NoResendNotice, ReadBackPanel, ResendPanel } from "./ResendPanel.tsx"
import type { MethodRunnerProps } from "./MethodRunner.tsx"
import { ShareLink } from "./ShareLink.tsx"
import { useCanisterHandle } from "./useCanisterHandle.ts"

/** A call that went out: what was sent, as whom, and whether it re-sent an earlier one. */
interface Sent {
  readonly call: PreparedCall
  readonly caller: string
  readonly resend: boolean
}

/** Why `resendOf` offers nothing after a write whose outcome is unknown. */
function noResendReason(
  shape: DedupeShape | undefined,
  sent: Sent | undefined,
  caller: string
): string {
  if (shape === undefined) {
    return "this method has no deduplication key (created_at_time), so sending it again could run it twice."
  }
  if (sent !== undefined && createdAtTimeOf(sent.call.vars) === null) {
    return "it was sent without created_at_time, so the canister cannot tell a re-send from a new write."
  }
  if (sent !== undefined && sent.caller !== caller) {
    return `only ${sent.caller} may send it again, and the caller is now ${caller}. Sign in as the sender to get the offer back.`
  }
  return "the argument or the canister changed since it was sent."
}

/**
 * A write: an `update` or a `oneway`, confirmed first and sent once through
 * `useMutation(client.mutationOptions(…))`, whose `retry: false` is never
 * overridden. Also a query without results (`call`), which `queryOptions`
 * refuses: called through a mutation that invalidates nothing.
 */
export function WriteRunner(
  props: MethodRunnerProps & {
    kind: Extract<CallKind, { kind: "update" | "oneway" | "call" }>
  }
): JSX.Element {
  const { iface, method, kind, units, onShare } = props
  const client = useClient()
  const auth = useAuth()
  const can = useCanisterHandle(iface)
  const shape = dedupeShapeOf(method)
  // A replayed call that carries its own created_at_time keeps it: sent
  // again within the ledger's window, the same bytes answer Duplicate.
  const [dedupe, setDedupe] = useState(
    () => shape !== undefined && !hasCreatedAtTime(props.initialValues)
  )
  const [check, setCheck] = useState<CallCheck>()
  const [pending, setPending] = useState<{
    call: PreparedCall
    caller: string
  }>()
  const [sent, setSent] = useState<Sent>()
  const [readBackOpen, setReadBackOpen] = useState(false)
  const [notice, setNotice] = useState<string>()
  const dedupeId = useId()

  const mutation = useMutation(
    client.mutationOptions(
      can,
      method.name,
      kind.kind === "call" ? { invalidates: [] } : undefined
    )
  )
  const signedIn = auth.status === "signed-in"
  const gated = needsSignIn(kind) && !signedIn
  // Widened: a runtime interface has no typed Err arm, so the mutation types
  // its error `ReactorError<never>`, whose kind can never be canister_err.
  const error: unknown = mutation.error
  // Read in render, in a component that re-renders on caller changes
  // (useAuth): the offer exists only while the sender is the caller.
  const again =
    shape !== undefined && error !== null
      ? client.resendOf(error, can, method.name, { dedupedBy: createdAtTimeOf })
      : undefined

  const hints = useMemo(
    () => combineHints(props.hints, dedupe ? hideDedupeField : undefined),
    [props.hints, dedupe]
  )
  const onChange = useCallback((next: CallCheck) => setCheck(next), [])

  const send = async (call: PreparedCall, caller: string, resend: boolean) => {
    setSent({ call, caller, resend })
    setReadBackOpen(false)
    setNotice(undefined)
    let result: CallResult
    try {
      result = { ok: true, reply: await mutation.mutateAsync(call.vars) }
    } catch (failure) {
      result = { ok: false, error: failure }
    }
    addHistoryEntry(
      historyEntryOf(
        {
          iface,
          method,
          caller,
          bytes: call.bytes,
          result,
          note: resend ? "re-send:" : undefined,
        },
        Date.now(),
        newHistoryId()
      )
    )
  }

  const onSubmit = (submitted: PreparedCall) => {
    setNotice(undefined)
    let call = submitted
    if (shape !== undefined && dedupe) {
      const stamped = stampCreatedAtTime(method, shape, submitted, nowNanos())
      if (stamped === undefined) {
        setNotice(
          "created_at_time could not be set on these arguments: nothing was sent."
        )
        return
      }
      call = stamped
    }
    if (kind.kind === "call") {
      void send(call, client.caller(), false)
      return
    }
    if (gated) return
    setPending({ call, caller: client.caller() })
  }

  const onConfirm = () => {
    if (pending === undefined) return
    const caller = client.caller()
    if (!signedIn) {
      setPending(undefined)
      setNotice("Signed out before sending: nothing was sent.")
      return
    }
    if (caller !== pending.caller) {
      // The step showed another sender: show it again with the one it
      // would go out as.
      setPending({ ...pending, caller })
      setNotice(
        "The signed-in principal changed: check the sender, then send again."
      )
      return
    }
    setPending(undefined)
    void send(pending.call, caller, false)
  }

  const onResend = () => {
    if (again === undefined || sent === undefined) return
    // `again.arg` is the very object first sent: the mutation sends it only
    // as that write (its bytes, its canister, its sender), or refuses.
    void send({ ...sent.call, vars: again.arg }, again.from, true)
  }

  const readBack =
    sent === undefined
      ? undefined
      : suggestReadBack(iface, method, sent.call.values, sent.caller)
  const unknown = isReactorError(error) && error.mayHaveExecuted

  const openReadBack = (suggestion: ReadBack) => {
    setReadBackOpen(true)
    readNow(client, can, iface, suggestion.method, suggestion.call)
  }
  const preview =
    check?.ok === true &&
    check.values !== undefined &&
    check.bytes !== undefined
      ? { values: check.values, bytes: check.bytes }
      : undefined

  return (
    <div className="stack call-write">
      {shape !== undefined && (
        <div className="stack-xs">
          <label className="switch-label">
            <input
              type="checkbox"
              className="switch"
              checked={dedupe}
              aria-describedby={dedupeId}
              onChange={(event) => setDedupe(event.target.checked)}
            />
            Deduplicate with created_at_time
          </label>
          <p id={dedupeId} className="field-hint">
            {dedupe
              ? "Set to the current time when you review the call, so a lost reply can be re-sent safely: the canister answers Duplicate to the same bytes from the same sender."
              : "Off: created_at_time is sent as the form below has it. Left empty, a lost reply has no safe re-send."}
          </p>
        </div>
      )}
      <MethodForm
        method={method}
        hints={hints}
        initialValues={props.initialValues}
        submitLabel={submitLabelOf(kind, method.mode)}
        disabledReason={
          gated
            ? SIGN_IN_REASON
            : pending !== undefined
              ? "Confirm or cancel the call below first."
              : undefined
        }
        busy={mutation.isPending}
        externalIssues={
          error === null ? undefined : issuesFromReactorError(error)
        }
        onSubmit={onSubmit}
        onChange={onChange}
        callerPrincipal={signedIn ? auth.principal : undefined}
      />
      {notice !== undefined && (
        <p className="notice notice-warn" role="status">
          {notice}
        </p>
      )}
      {preview !== undefined && (
        <details className="disclosure">
          <summary>Preview the call</summary>
          <div className="disclosure-body">
            {shape !== undefined && dedupe && (
              <p className="text-xs muted">
                created_at_time is set to the current time when you review the
                call.
              </p>
            )}
            <CallPreview
              method={method}
              values={preview.values}
              bytes={preview.bytes}
            />
          </div>
        </details>
      )}
      <ShareLink
        canisterId={iface.canisterId}
        method={method.name}
        bytes={preview?.bytes ?? sent?.call.bytes}
        run={false}
        onShare={onShare}
      />
      {pending !== undefined && (
        <ConfirmWrite
          iface={iface}
          method={method}
          values={pending.call.values}
          bytes={pending.call.bytes}
          caller={pending.caller}
          onConfirm={onConfirm}
          onCancel={() => setPending(undefined)}
        />
      )}
      <div className="call-outcome" aria-live="polite">
        {mutation.isPending ? (
          <p className="row-sm muted" role="status">
            <span className="spinner spinner-sm" aria-hidden="true" />
            {kind.kind === "update"
              ? sent?.resend === true
                ? "Re-sending the same bytes…"
                : "Sending… waiting for the certified reply."
              : "Sending…"}
          </p>
        ) : mutation.isSuccess ? (
          <WriteSuccess
            kind={kind.kind}
            method={method}
            reply={mutation.data}
            resend={sent?.resend === true}
            units={units}
          />
        ) : error !== null ? (
          <div className="stack-sm">
            {sent?.resend === true &&
              isReactorError(error) &&
              error.kind === "canister_err" &&
              isDuplicateErr(error.err) && (
                <div className="notice notice-success" role="status">
                  <p className="notice-title">
                    Duplicate: it had already executed
                  </p>
                  <p>
                    The first send ran. The canister recognised the same bytes
                    from the same sender and ran nothing more: the write
                    happened exactly once.
                  </p>
                </div>
              )}
            <ErrorPanel
              error={error}
              method={method}
              units={units}
              onReadBack={
                unknown && readBack !== undefined
                  ? () => openReadBack(readBack)
                  : undefined
              }
            />
            {again !== undefined ? (
              <ResendPanel
                from={again.from}
                createdAt={createdAtNanos(createdAtTimeOf(again.arg))}
                busy={mutation.isPending}
                onResend={onResend}
              />
            ) : (
              unknown && (
                <NoResendNotice
                  reason={noResendReason(shape, sent, auth.principal)}
                />
              )
            )}
          </div>
        ) : null}
        {readBackOpen && readBack !== undefined && (
          <ReadBackPanel iface={iface} readBack={readBack} units={units} />
        )}
      </div>
    </div>
  )
}

function WriteSuccess(props: {
  kind: "update" | "oneway" | "call"
  method: MethodInfo
  reply: unknown
  resend: boolean
  units: TokenUnits | undefined
}): JSX.Element {
  if (props.kind === "oneway") {
    return (
      <div className="notice notice-info" role="status">
        <p className="notice-title">Sent</p>
        <p>
          Oneway calls return no reply and no outcome: nothing tells whether it
          ran.
        </p>
      </div>
    )
  }
  if (props.kind === "call") {
    return (
      <div className="notice notice-success" role="status">
        <p className="notice-title">Called</p>
        <p>The method returns nothing.</p>
      </div>
    )
  }
  return (
    <div className="stack-sm call-reply">
      <div className="notice notice-success" role="status">
        <p className="notice-title">
          {props.resend ? "Re-sent: it executed now, once" : "Executed"}
        </p>
        <p>
          {props.resend
            ? "The canister had not run the first send, so it ran this one. "
            : ""}
          Reads of this canister were invalidated for every caller, so balances
          and other reads refresh.
        </p>
      </div>
      <ReplyView
        method={props.method}
        reply={props.reply}
        units={props.units}
      />
    </div>
  )
}
