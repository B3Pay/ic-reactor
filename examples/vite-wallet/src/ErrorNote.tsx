// How the wallet words a failed call. Every rejection a client call produces
// is a `ReactorError`: its `kind` says what happened, and `mayHaveExecuted`
// whether a failed write may have taken effect anyway, which is the question
// a person needs answered before trying again.
import { isReactorError } from "@ic-reactor/core"

/** One sentence for a failure, and whether it is a warning (it may have happened). */
export function explain(
  error: unknown,
  refusal?: string
): { text: string; unknownOutcome: boolean } {
  if (!isReactorError(error)) {
    return {
      text: error instanceof Error ? error.message : String(error),
      unknownOutcome: false,
    }
  }
  if (error.kind === "canister_err") {
    return {
      text: `Refused by the canister: ${refusal ?? error.message}`,
      unknownOutcome: false,
    }
  }
  if (error.kind === "unauthenticated") {
    return {
      text: "Not sent: nobody is signed in, and the client refuses a write before sending it (unauthenticated).",
      unknownOutcome: false,
    }
  }
  if (error.mayHaveExecuted) {
    return {
      text: `Outcome unknown (${error.kind}): it may have gone through. The client re-read what it may have changed; check that before trying again.`,
      unknownOutcome: true,
    }
  }
  if (error.code === "canister_id_unresolved") {
    return {
      text: "Not sent: the ic_env cookie names no backend. Deploy it (pnpm icp:deploy), then reload the page.",
      unknownOutcome: false,
    }
  }
  return {
    text: `Not done, and certainly not executed (${error.kind}${error.code ? `, ${error.code}` : ""}): ${error.message}`,
    unknownOutcome: false,
  }
}

export function ErrorNote(props: { error: unknown; refusal?: string }) {
  const { text, unknownOutcome } = explain(props.error, props.refusal)
  return (
    <p className={unknownOutcome ? "warn" : "error"} role="alert">
      {text}
    </p>
  )
}
