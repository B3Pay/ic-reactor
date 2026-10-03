// Scenario 8 (with src/components/LedgerError.tsx): errors on the server.
//
// Rule: every rejection a client call produces is a `ReactorError`; test it
// with `isReactorError(error)`, then read `kind`. Anything else is a bug in
// this app, and is thrown on.
//
// A server section shows its own failure: the page renders the kind here, on
// the server, so it is in the HTML. An `error.tsx` boundary would not do: in a
// production build Next replaces a Server Component's error with a generic one
// before the browser sees it, and the kind would be gone.
import { isReactorError, type ReactorErrorKind } from "@ic-reactor/core"

/** What a section shows of a failed call: plain data, safe to pass to any component. */
export interface ErrorSummary {
  readonly kind: ReactorErrorKind
  /** The IC reject code, when the IC or the canister rejected the call. */
  readonly rejectCode?: number
  /** The HTTP status a replica or boundary node answered with, when there was one. */
  readonly httpStatus?: number
  readonly message: string
}

/**
 * The summary of a failed call.
 *
 * @throws `error` itself when it is not a `ReactorError`: not a failure of
 * the call, but of this app.
 */
export function summarizeError(error: unknown): ErrorSummary {
  if (!isReactorError(error)) throw error
  return {
    kind: error.kind,
    ...(error.rejectCode !== undefined && { rejectCode: error.rejectCode }),
    ...(error.httpStatus !== undefined && { httpStatus: error.httpStatus }),
    message: error.message,
  }
}
