import { isReactorError, type ReactorError } from "@ic-reactor/core"
import type { JSX } from "react"
import type { MethodInfo } from "../interface/types.ts"
import type { TokenUnits } from "../lib/format.ts"
import { ErrValueView } from "../values/ReplyView.tsx"
import {
  KIND_INFO,
  causeDetails,
  codeMeaning,
  rejectMeaning,
  rejectName,
  verdictOf,
  type Verdict,
} from "./error-info.ts"

export interface ErrorPanelProps {
  error: unknown
  method?: MethodInfo
  /**
   * Offered while a write's outcome is unknown: this error's
   * (`mayHaveExecuted`), or an earlier send's (`earlierUnknown`).
   */
  onReadBack?(): void
  /**
   * The error answers a re-send of a write whose outcome is still unknown:
   * whatever it says, it says it about the re-send only.
   */
  earlierUnknown?: boolean
  /** Token units for amounts in a canister_err payload (InsufficientFunds, BadFee). */
  units?: TokenUnits
}

const VERDICTS: Readonly<
  Record<
    Verdict,
    { readonly label: string; readonly badge: string; readonly advice: string }
  >
> = {
  may_have_executed: {
    label: "MAY HAVE EXECUTED",
    badge: "badge badge-lg badge-err",
    advice:
      "The outcome is unknown. Do not send it again blindly: read the state back first.",
  },
  answered_err: {
    label: "Outcome known: it ran and answered Err",
    badge: "badge badge-lg badge-warn",
    advice: "The canister decided. Nothing is pending.",
  },
  not_executed: {
    label: "Certainly not executed",
    badge: "badge badge-lg badge-ok",
    advice: "Nothing changed: fix what is wrong and send again.",
  },
}

/**
 * A failed call: kind, code, whether it may have executed, reject details,
 * the canister's Err payload and what the error means.
 */
export function ErrorPanel(props: ErrorPanelProps): JSX.Element {
  const { error, method, onReadBack, units, earlierUnknown } = props
  if (!isReactorError(error)) {
    // Not a call failure: a bug, or a TypeError the client threw at build time.
    const message = error instanceof Error ? error.message : String(error)
    return (
      <div className="notice notice-danger call-error" role="alert">
        <p className="notice-title">Unexpected error</p>
        <p className="break-all">{message}</p>
      </div>
    )
  }
  return (
    <ReactorErrorPanel
      error={error}
      method={method}
      onReadBack={onReadBack}
      units={units}
      earlierUnknown={earlierUnknown === true}
    />
  )
}

// After a re-send, an answer about the re-send is not one about the first
// send, which may still have executed: nothing about that is settled.
const AFTER_RESEND: typeof VERDICTS = {
  may_have_executed: VERDICTS.may_have_executed,
  answered_err: {
    label: "The re-send ran and answered Err",
    badge: "badge badge-lg badge-warn",
    advice:
      "This answers the re-send only: the first send may still have executed. Read the state back.",
  },
  not_executed: {
    label: "The re-send certainly did not execute",
    badge: "badge badge-lg badge-warn",
    advice:
      "It says nothing about the first send, which may still have executed. Read the state back.",
  },
}

function ReactorErrorPanel(props: {
  error: ReactorError<unknown>
  method: MethodInfo | undefined
  onReadBack: (() => void) | undefined
  units: TokenUnits | undefined
  earlierUnknown: boolean
}): JSX.Element {
  const { error, method, onReadBack, units, earlierUnknown } = props
  const info = KIND_INFO[error.kind]
  const verdict = verdictOf(error)
  const shown = (earlierUnknown ? AFTER_RESEND : VERDICTS)[verdict]
  const cause = causeDetails(error)
  const write =
    method !== undefined &&
    (method.mode === "update" || method.mode === "oneway")
  const codeText =
    error.code === undefined ? undefined : codeMeaning(error.code)
  const tone =
    verdict === "answered_err" && !earlierUnknown
      ? "notice-warn"
      : "notice-danger"
  return (
    <div
      className={`notice ${tone} call-error`}
      role="alert"
      data-kind={error.kind}
      data-verdict={verdict}
    >
      <p className="notice-title">
        {info.title} <code className="code-inline">{error.kind}</code>
        {error.code !== undefined && (
          <>
            {" "}
            <code className="code-inline">{error.code}</code>
          </>
        )}
      </p>
      <div className="call-verdict" data-verdict={verdict}>
        <span className={shown.badge}>{shown.label}</span>
        <span className="call-verdict-advice">{shown.advice}</span>
      </div>
      <p>{info.meaning}</p>
      {codeText !== undefined && <p className="muted">{codeText}</p>}
      {error.kind === "canister_err" && method !== undefined && (
        <div className="call-err-payload">
          <ErrValueView method={method} err={error.err} units={units} />
        </div>
      )}
      {error.issues !== undefined && error.issues.length > 0 && (
        <ul className="list-plain call-issues" aria-label="Issues">
          {error.issues.map((issue, i) => (
            <li key={`${issue.path}:${i}`}>
              <code className="code-inline">{issue.path}</code> {issue.message}
            </li>
          ))}
        </ul>
      )}
      <dl className="kv kv-compact">
        <dt>Method</dt>
        <dd className="mono break-all">{error.method}</dd>
        <dt>Canister</dt>
        <dd className="mono break-all">{error.canisterId}</dd>
        {error.rejectCode !== undefined && (
          <>
            <dt>Reject code</dt>
            <dd>
              {error.rejectCode} {rejectName(error.rejectCode) ?? ""}:{" "}
              {rejectMeaning(error.rejectCode, write, error.canisterId)}
            </dd>
          </>
        )}
        {cause.rejectErrorCode !== undefined && (
          <>
            <dt>IC error code</dt>
            <dd className="mono">{cause.rejectErrorCode}</dd>
          </>
        )}
        {cause.rejectMessage !== undefined && (
          <>
            <dt>Reject message</dt>
            <dd className="break-all">{cause.rejectMessage}</dd>
          </>
        )}
        {error.httpStatus !== undefined && (
          <>
            <dt>HTTP status</dt>
            <dd>{error.httpStatus}</dd>
          </>
        )}
        {cause.bodyText !== undefined && (
          <>
            <dt>Response body</dt>
            <dd className="break-all">{cause.bodyText}</dd>
          </>
        )}
      </dl>
      {onReadBack !== undefined &&
        (error.mayHaveExecuted || earlierUnknown) && (
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={onReadBack}>
              Read the state back
            </button>
          </div>
        )}
      <details className="disclosure">
        <summary>Full message</summary>
        <div className="disclosure-body">
          <pre className="code break-all">{error.message}</pre>
        </div>
      </details>
    </div>
  )
}
