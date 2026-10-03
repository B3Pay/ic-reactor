import type { ReactorError, ReactorErrorKind } from "@ic-reactor/core"
import type { ReactNode } from "react"

/** What each kind means for the person looking at the page. */
const KINDS: Record<ReactorErrorKind, { title: string; meaning: string }> = {
  invalid_args: {
    title: "Refused before sending",
    meaning: "The arguments do not encode as the method's Candid types.",
  },
  unauthenticated: {
    title: "Refused before sending",
    meaning: "An update needs a signed-in caller, and nobody is signed in.",
  },
  not_delivered: {
    title: "Not delivered",
    meaning:
      "The replica or a boundary node turned the request away, or a read got no answer.",
  },
  outcome_unknown: {
    title: "Outcome unknown",
    meaning: "The call went out and no trustworthy answer came back.",
  },
  rejected: {
    title: "Rejected",
    meaning: "The IC or the canister rejected the call.",
  },
  invalid_reply: {
    title: "Reply did not decode",
    meaning: "A reply came back, but not as the method's result type.",
  },
  canister_err: {
    title: "The canister said no",
    meaning: "The method ran and answered with the Err arm of its result.",
  },
  cancelled: {
    title: "Cancelled",
    meaning: "The caller changed, or the call was aborted.",
  },
}

/** The reject codes of the interface specification. */
const REJECT_NAMES: Record<number, string> = {
  1: "SYS_FATAL",
  2: "SYS_TRANSIENT",
  3: "DESTINATION_INVALID",
  4: "CANISTER_REJECT",
  5: "CANISTER_ERROR",
  6: "SYS_UNKNOWN",
}

/** The fields of a `ReactorError` this panel reads, whatever its `Err` type. */
export type ShownError = Pick<
  ReactorError,
  | "kind"
  | "mayHaveExecuted"
  | "message"
  | "code"
  | "rejectCode"
  | "httpStatus"
  | "issues"
>

/**
 * A failed call, by its `kind`, with whether it may have executed. `detail`
 * describes a `canister_err`, whose `err` only the caller knows the type of.
 */
export function ErrorPanel(props: { error: ShownError; detail?: ReactNode }) {
  const { error, detail } = props
  const kind = KINDS[error.kind]
  return (
    <div className="error" role="alert" data-kind={error.kind}>
      <strong>
        {kind.title} <code>{error.kind}</code>
      </strong>
      <p className="plain">{detail ?? kind.meaning}</p>
      <ul className="facts">
        <li>
          May have executed:{" "}
          <strong>{error.mayHaveExecuted ? "yes" : "no"}</strong>
        </li>
        {error.rejectCode !== undefined && (
          <li>
            Reject code {error.rejectCode} (
            {REJECT_NAMES[error.rejectCode] ?? "unknown"})
          </li>
        )}
        {error.httpStatus !== undefined && <li>HTTP {error.httpStatus}</li>}
        {error.code !== undefined && (
          <li>
            Code <code>{error.code}</code>
          </li>
        )}
        {error.issues?.map((issue, i) => (
          <li key={i}>
            <code>{issue.path}</code> {issue.message}
          </li>
        ))}
      </ul>
      <details>
        <summary>Message</summary>
        <p>{error.message}</p>
      </details>
    </div>
  )
}
