import { isReactorError } from "@ic-reactor/core"
import { useAuth, useClient } from "@ic-reactor/react"
import { useMutation } from "@tanstack/react-query"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react"
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
  duplicateTagIn,
  duplicateTagOf,
  hasCreatedAtTime,
  hideDedupeField,
  isDuplicateErr,
  knownDeduplicating,
  resendLeftOpen,
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
import { sameBytes, type PreparedCall } from "./prepare.ts"
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

/**
 * A write whose outcome is unknown. Until the reader settles it (a re-send
 * that proves what happened) or sets it aside ("Start a new, different
 * write"), it holds the form: a new review would stamp a new
 * created_at_time, which no canister deduplicates against it. Set aside, it
 * is still named on every confirm step.
 */
interface Unresolved {
  readonly sent: Sent
  readonly setAside: boolean
}

/** The same write: the same bytes from the same sender (a re-send of it). */
const sameWrite = (a: Sent, b: Sent): boolean =>
  a.caller === b.caller && sameBytes(a.call.bytes, b.call.bytes)

/** Whether a failure is the canister's own duplicate answer. */
const isDuplicateAnswer = (error: unknown): boolean =>
  isReactorError(error) &&
  error.kind === "canister_err" &&
  isDuplicateErr(error.err)

/**
 * The unresolved writes once `attempt` settled with `result`. A write that
 * may have executed joins them (again, if it was set aside). Sending the
 * same write again settles it only by proving what happened, and only on a
 * canister known to deduplicate: a duplicate answer (it had run) or a
 * success (it had not). Elsewhere an Err named Duplicate is the canister's
 * own word, not proof. Any other answer is about the new send alone.
 */
function afterSettled(
  current: readonly Unresolved[],
  attempt: Sent,
  result: CallResult,
  known: boolean
): readonly Unresolved[] {
  const failure = result.ok ? undefined : result.error
  const proves = known && (result.ok || isDuplicateAnswer(failure))
  if (proves) return current.filter((u) => !sameWrite(u.sent, attempt))
  if (!isReactorError(failure) || !failure.mayHaveExecuted) return current
  return current.some((u) => sameWrite(u.sent, attempt))
    ? current.map((u) =>
        sameWrite(u.sent, attempt) ? { ...u, setAside: false } : u
      )
    : [...current, { sent: attempt, setAside: false }]
}

/** Why the form is held while a write's outcome is unknown. */
const HOLD_REASON =
  "The last write may have executed. Re-send it or read the state back below; to send anything else, start a new, different write first."

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

/** What a write sent after "Start a new, different write" is to the unknown one. */
function startOverHint(
  shape: DedupeShape | undefined,
  dedupe: boolean
): string {
  if (shape === undefined) {
    return "This method has no created_at_time, so nothing tells a new write from the unknown one: if that one ran, the next runs as well."
  }
  if (dedupe) {
    return "A new write gets its own created_at_time, so the canister does not take it for a re-send of the unknown one: if that one ran, the next runs as well."
  }
  return "With deduplication off, the next write carries the created_at_time the form has: left empty, the canister has nothing to deduplicate on, so if the unknown one ran, the next runs as well."
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
  const known = knownDeduplicating(iface, method)
  const duplicateTag = shape === undefined ? "Duplicate" : duplicateTagOf(shape)
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
  // Oldest first. Kept for the runner's life: setting one aside settles
  // nothing about it.
  const [unresolved, setUnresolved] = useState<readonly Unresolved[]>([])
  const [readBackOpen, setReadBackOpen] = useState(false)
  const [notice, setNotice] = useState<string>()
  const dedupeId = useId()
  // The confirm step, the re-send offer and "Start a new, different write"
  // go away once used, taking the focus with them: it comes back to the
  // form's button once the page has settled.
  const submitRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  const backToForm = () => {
    refocus.current = true
  }
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    submitRef.current?.focus()
  })

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

  // The caller the latest render shows. The client `useClient()` returns
  // sends only as its own render's caller: a press handled before a switch
  // reached this component is refused (`caller_changed`), nothing is sent,
  // and the step comes back with the sender shown since.
  const shownCaller = useRef(client.caller())
  shownCaller.current = client.caller()

  const send = async (call: PreparedCall, caller: string, resend: boolean) => {
    const attempt: Sent = { call, caller, resend }
    setSent(attempt)
    // Whatever was being confirmed is not what goes out now.
    setPending(undefined)
    setReadBackOpen(false)
    setNotice(undefined)
    let result: CallResult
    try {
      result = { ok: true, reply: await mutation.mutateAsync(call.vars) }
    } catch (failure) {
      if (
        !resend &&
        isReactorError(failure) &&
        failure.code === "caller_changed" &&
        shownCaller.current !== caller
      ) {
        mutation.reset()
        setSent(undefined)
        setPending({ call, caller: shownCaller.current })
        setNotice(
          "The signed-in principal changed: check the sender, then send again."
        )
        return
      }
      result = { ok: false, error: failure }
    }
    setUnresolved((current) => afterSettled(current, attempt, result, known))
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

  const unknown = isReactorError(error) && error.mayHaveExecuted
  // Read from the mutation as well as from `unresolved`, which catches up
  // only once the send's own await resumes.
  const settledNow =
    sent !== undefined &&
    !mutation.isPending &&
    known &&
    (mutation.isSuccess || isDuplicateAnswer(error))
  const open =
    settledNow && sent !== undefined
      ? unresolved.filter((u) => !sameWrite(u.sent, sent))
      : unresolved
  const holding = unknown || open.some((u) => !u.setAside)
  // The outcome on screen answers the same write sent again (a re-send),
  // and that write is still unknown: an Err such as TooOld, a refusal, or a
  // success or duplicate answer from a canister not known to deduplicate.
  const openAfterResend =
    sent !== undefined &&
    !mutation.isPending &&
    !unknown &&
    open.some((u) => sameWrite(u.sent, sent))

  const onSubmit = (submitted: PreparedCall) => {
    if (holding) return
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
      backToForm()
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
    backToForm()
    void send(pending.call, caller, false)
  }

  const onResend = () => {
    if (again === undefined || sent === undefined) return
    // `again.arg` is the very object first sent: the mutation sends it only
    // as that write (its bytes, its canister, its sender), or refuses.
    backToForm()
    void send({ ...sent.call, vars: again.arg }, again.from, true)
  }

  // As the wallet's "Start a new, different transfer": the explicit step
  // before a write that is not the unknown one. It sends nothing, and the
  // unknown writes stay named on the confirm step.
  const startOver = () => {
    setUnresolved((current) =>
      current.map((u) => (u.setAside ? u : { ...u, setAside: true }))
    )
    mutation.reset()
    setSent(undefined)
    setPending(undefined)
    setReadBackOpen(false)
    setNotice(undefined)
    backToForm()
  }

  const readBack =
    sent === undefined
      ? undefined
      : suggestReadBack(iface, method, sent.call.values, sent.caller)
  // Read as "it had already run" only for a write that carried
  // created_at_time: elsewhere an Err named Duplicate may mean anything.
  const duplicate =
    shape !== undefined &&
    sent !== undefined &&
    createdAtTimeOf(sent.call.vars) !== null &&
    isReactorError(error) &&
    error.kind === "canister_err"
      ? duplicateTagIn(error.err)
      : undefined

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
            {!dedupe
              ? "Off: created_at_time is sent as the form below has it. Left empty, a lost reply has no safe re-send."
              : known
                ? `Set to the current time when you review the call, so a lost reply can be re-sent safely: the canister answers ${duplicateTag} to the same bytes from the same sender.`
                : `Set to the current time when you review the call. If this canister deduplicates on it, as ICRC-1 ledgers do, a lost reply can be re-sent: it answers ${duplicateTag} to the same bytes from the same sender. Nothing here proves that it does.`}
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
            : holding
              ? HOLD_REASON
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
        submitRef={submitRef}
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
          earlierUnknown={open.map((u) => ({
            bytes: u.sent.call.bytes,
            caller: u.sent.caller,
          }))}
          busy={mutation.isPending}
          onConfirm={onConfirm}
          onCancel={() => {
            setPending(undefined)
            backToForm()
          }}
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
            known={known}
            units={units}
          />
        ) : error !== null ? (
          <div className="stack-sm">
            {duplicate !== undefined && !known && (
              <div className="notice notice-warn" role="status">
                <p className="notice-title">
                  {duplicate}: the canister says it had already run this
                </p>
                <p>
                  This canister is not known to deduplicate on created_at_time,
                  so the studio cannot tell what {duplicate} means here. Treat
                  the first send as unknown and read the state back.
                </p>
              </div>
            )}
            {duplicate !== undefined && known && (
              <div className="notice notice-success" role="status">
                <p className="notice-title">
                  {duplicate}: it had already executed
                </p>
                <p>
                  {sent?.resend === true
                    ? "The first send ran. The canister recognised the same bytes from the same sender and ran nothing more."
                    : "The canister had already run a write of these exact bytes from this sender, and ran nothing now."}
                </p>
              </div>
            )}
            <ErrorPanel
              error={error}
              method={method}
              units={units}
              earlierUnknown={openAfterResend}
              onReadBack={
                (unknown || openAfterResend) && readBack !== undefined
                  ? () => openReadBack(readBack)
                  : undefined
              }
            />
            {again !== undefined ? (
              <ResendPanel
                from={again.from}
                createdAt={createdAtNanos(createdAtTimeOf(again.arg))}
                known={known}
                duplicateTag={duplicateTag}
                busy={mutation.isPending}
                onResend={onResend}
              />
            ) : (
              (unknown || openAfterResend) && (
                <NoResendNotice
                  reason={
                    openAfterResend
                      ? `${resendLeftOpen(error)}.`
                      : noResendReason(shape, sent, auth.principal)
                  }
                />
              )
            )}
          </div>
        ) : null}
        {mutation.isSuccess && openAfterResend && (
          <NoResendNotice
            reason="this canister is not known to deduplicate on created_at_time, so the re-send that ran says nothing about the first send: if it does not deduplicate, both ran."
            onReadBack={
              readBack === undefined ? undefined : () => openReadBack(readBack)
            }
          />
        )}
        {holding && !mutation.isPending && (
          <div className="stack-xs">
            <div className="row">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={startOver}
              >
                Start a new, different write
              </button>
            </div>
            <p className="text-xs muted">
              Sends nothing: it frees the form. {startOverHint(shape, dedupe)}
            </p>
          </div>
        )}
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
  /** Whether the canister is known to deduplicate the method. */
  known: boolean
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
          {!props.resend
            ? "Executed"
            : props.known
              ? "Re-sent: it executed now, once"
              : "Re-sent: it executed"}
        </p>
        <p>
          {!props.resend
            ? ""
            : props.known
              ? "The canister had not run the first send, so it ran this one. "
              : "If this canister deduplicates on created_at_time, the first send had not run; if it does not, the first one may have run too. "}
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
