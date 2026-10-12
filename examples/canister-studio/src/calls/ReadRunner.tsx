import { isReactorError } from "@ic-reactor/core"
import { useAuth, useClient } from "@ic-reactor/react"
import { skipToken, useQuery } from "@tanstack/react-query"
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type JSX,
} from "react"
import { ActionButton } from "../components/ActionButton.tsx"
import { issuesFromReactorError, type CallCheck } from "../forms/engine.ts"
import { MethodForm } from "../forms/MethodForm.tsx"
import { CallPreview } from "../values/CallPreview.tsx"
import { ReplyView } from "../values/ReplyView.tsx"
import { CacheKeyPanel } from "./CacheKeyPanel.tsx"
import { ErrorPanel } from "./ErrorPanel.tsx"
import { SIGN_IN_REASON, submitLabelOf, type CallKind } from "./kinds.ts"
import { prepareCall, type PreparedCall } from "./prepare.ts"
import { readQueryOptions } from "./query-options.ts"
import { readNow, recordRead } from "./read.ts"
import type { MethodRunnerProps } from "./MethodRunner.tsx"
import { ShareLink } from "./ShareLink.tsx"
import { canisterOf } from "./useCanisterHandle.ts"

/**
 * A read: a `query` or `composite_query` (with the certified twin for a
 * `query`), or an update the registry marks idempotent, read through
 * `{ update: "idempotent" }`.
 *
 * The read is `useQuery(readQueryOptions(…))`, built in render so its key
 * always carries the current caller, and skipped until something is
 * submitted. Nothing carries data across keys: a new argument, a new caller
 * or the certified twin starts empty until it loads.
 */
export function ReadRunner(
  props: MethodRunnerProps & {
    kind: Extract<CallKind, { kind: "read" | "idempotent" }>
  }
): JSX.Element {
  const { iface, method, kind, hints, units, onShare } = props
  const client = useClient()
  const auth = useAuth()
  const idempotent = kind.kind === "idempotent"
  const certifiable = kind.kind === "read" && kind.certifiable
  const [certified, setCertified] = useState(
    () => certifiable && props.certified === true
  )
  // A shared link's read is built from the same values the page's loader
  // prefetched with, so it hydrates under the same key. A write never runs
  // from a link, and an idempotent update waits for a click.
  const [submitted, setSubmitted] = useState<PreparedCall | undefined>(() =>
    props.autoRun === true && !idempotent && props.initialValues !== undefined
      ? prepareCall(method, props.initialValues)
      : undefined
  )
  const [check, setCheck] = useState<CallCheck>()
  const certifiedId = useId()
  // A read run at once (a shared link, a quick read, a replay) goes through
  // `useQuery`, not `readNow`: it is recorded once, when its first answer is
  // on screen in the browser, unless the reader ran another read first.
  const autoRecord = useRef(submitted !== undefined)

  const signedIn = auth.status === "signed-in"
  const blocked = idempotent && !signedIn
  const can = canisterOf(client, iface, certified)
  const options = readQueryOptions(
    client,
    can,
    method,
    submitted !== undefined && !blocked ? submitted.vars : skipToken,
    { idempotent }
  )
  const read = useQuery(options)

  // Effects never run on the server, so a server render records nothing.
  useEffect(() => {
    if (!autoRecord.current || submitted === undefined) return
    if (read.status === "pending") return
    autoRecord.current = false
    recordRead(
      iface,
      method,
      client.caller(),
      submitted,
      read.status === "success"
        ? { ok: true, reply: read.data }
        : { ok: false, error: read.error }
    )
  }, [read.status, read.data, read.error, submitted, iface, method, client])

  const run = (call: PreparedCall, twin = certified) => {
    autoRecord.current = false
    setSubmitted(call)
    readNow(client, canisterOf(client, iface, twin), iface, method, call, {
      idempotent,
    })
  }

  const onCertified = (next: boolean) => {
    setCertified(next)
    if (submitted !== undefined) run(submitted, next)
  }

  const onChange = useCallback((next: CallCheck) => setCheck(next), [])

  const error = read.error
  const preview =
    check?.ok === true &&
    check.values !== undefined &&
    check.bytes !== undefined
      ? { values: check.values, bytes: check.bytes }
      : undefined

  return (
    <div className="stack call-read">
      {kind.kind === "read" && (
        <div className="stack-xs">
          <label className="switch-label">
            <input
              type="checkbox"
              className="switch"
              checked={certified}
              disabled={!certifiable}
              aria-describedby={certifiedId}
              onChange={(event) => onCertified(event.target.checked)}
            />
            Certified
          </label>
          <p id={certifiedId} className="field-hint">
            {!certifiable
              ? "A composite query has no certified path: ic-reactor refuses to read it certified."
              : certified
                ? 'Read as a replicated call whose reply is checked against the IC\'s certificate: slower, and trusted beyond one replica. Its key ends in "certified".'
                : "One replica answers, unverified: fast. Switch on to read the certified twin."}
          </p>
        </div>
      )}
      {idempotent && (
        <div className="notice notice-info" role="note">
          <p className="notice-title">An update, read like a query</p>
          <p>
            The registry marks <span className="mono">{method.name}</span>{" "}
            idempotent: it answers the same however often it runs and changes
            nothing, so it is cached as a read (
            <code className="code-inline">{'{ update: "idempotent" }'}</code>)
            and not fetched again on focus. It still goes through consensus, so
            it needs a signed-in caller.
          </p>
        </div>
      )}
      <MethodForm
        method={method}
        hints={hints}
        initialValues={props.initialValues}
        submitLabel={submitLabelOf(kind, method.mode)}
        disabledReason={blocked ? SIGN_IN_REASON : undefined}
        busy={read.isFetching}
        externalIssues={
          error === null ? undefined : issuesFromReactorError(error)
        }
        onSubmit={(call) => run(call)}
        onChange={onChange}
        callerPrincipal={signedIn ? auth.principal : undefined}
      />
      {preview !== undefined && (
        <details className="disclosure">
          <summary>Preview the call</summary>
          <div className="disclosure-body">
            <CallPreview
              method={method}
              values={preview.values}
              bytes={preview.bytes}
            />
          </div>
        </details>
      )}
      <div className="row row-between">
        {/* The result's own arguments once there is one, whatever the
            form holds since; before that, the form's. */}
        <ShareLink
          canisterId={iface.canisterId}
          method={method.name}
          bytes={submitted?.bytes ?? preview?.bytes}
          run={!idempotent}
          certified={certified}
          label={
            submitted === undefined && !idempotent
              ? "Copy link to run these arguments"
              : undefined
          }
          onShare={onShare}
        />
        {submitted !== undefined && (
          <ActionButton
            className="btn btn-sm"
            unavailable={read.isFetching || blocked}
            onClick={() => run(submitted)}
          >
            Refetch
          </ActionButton>
        )}
      </div>
      <CacheKeyPanel
        queryKey={options.queryKey}
        status={submitted === undefined ? undefined : read.status}
        fetching={read.isFetching}
      />
      <div className="call-outcome" aria-live="polite">
        {submitted === undefined ? null : error !== null ? (
          <ErrorPanel error={error} method={method} units={units} />
        ) : read.data !== undefined ? (
          <div className="stack-sm call-reply">
            <div className="row-sm">
              <span className="badge badge-ok">Reply</span>
              {certified && (
                <span className="badge badge-certified">Certified</span>
              )}
              {read.isFetching && (
                <span className="spinner spinner-sm" aria-label="Refreshing" />
              )}
            </div>
            <ReplyView method={method} reply={read.data} units={units} />
          </div>
        ) : blocked ? (
          <p className="muted">{SIGN_IN_REASON}</p>
        ) : (
          <p className="row-sm muted" role="status">
            <span className="spinner spinner-sm" aria-hidden="true" /> Reading…
          </p>
        )}
      </div>
      {error !== null &&
        isReactorError(error) &&
        error.kind === "cancelled" && (
          <p className="text-xs muted">
            A read made for a caller who is no longer current is cancelled,
            never sent as someone else.
          </p>
        )}
    </div>
  )
}
