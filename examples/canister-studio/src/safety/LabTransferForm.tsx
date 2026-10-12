import { useMemo, useState, type JSX } from "react"
import { ErrorPanel } from "../calls/ErrorPanel.tsx"
import { issuesFromReactorError } from "../forms/engine.ts"
import { heuristicHints } from "../forms/hints.ts"
import { MethodForm } from "../forms/MethodForm.tsx"
import type { MethodInfo } from "../interface/types.ts"
import { groupDigits } from "../lib/format.ts"
import { LAB_UNITS, labMethod } from "./mock-ledger.ts"
import { RequestLog } from "./RequestLog.tsx"
import { sendTransferInLab, type LabSend } from "./scenarios.ts"

const HINTS = heuristicHints({ units: LAB_UNITS })

type SendState =
  | { readonly status: "idle" }
  | { readonly status: "sending" }
  | { readonly status: "done"; readonly outcome: LabSend }

/**
 * The refused transfer in the studio's automatic form, with the
 * `invalid_args` issues on the fields their `$args[0]…` paths name. Fixing
 * them and submitting sends the corrected transfer to a fresh lab.
 */
export function LabTransferForm(props: {
  readonly method: string
  readonly values: readonly unknown[]
  readonly error: unknown
}): JSX.Element {
  const method: MethodInfo | undefined = labMethod(props.method)
  const issues = useMemo(
    () => issuesFromReactorError(props.error),
    [props.error]
  )
  const [state, setState] = useState<SendState>({ status: "idle" })

  if (method === undefined) {
    return <p className="muted">The mock ledger has no {props.method}.</p>
  }

  const submit = (call: { vars: unknown }): void => {
    setState({ status: "sending" })
    void sendTransferInLab(call.vars).then((outcome) =>
      setState({ status: "done", outcome })
    )
  }

  return (
    <div className="stack">
      <MethodForm
        method={method}
        hints={HINTS}
        initialValues={props.values}
        externalIssues={issues}
        submitLabel="Send the corrected transfer in the lab"
        busy={state.status === "sending"}
        onSubmit={submit}
      />
      {state.status === "done" && (
        <div className="stack-sm" aria-live="polite">
          {state.outcome.ok ? (
            <div className="notice notice-success" role="status">
              <p className="notice-title">Sent: it encodes now</p>
              <p>
                The lab ledger answered Ok with block index{" "}
                <span className="mono">{groupDigits(state.outcome.block)}</span>
                .
              </p>
            </div>
          ) : (
            <ErrorPanel
              error={state.outcome.error}
              method={method}
              units={LAB_UNITS}
            />
          )}
          <RequestLog
            requests={state.outcome.requests}
            caption="Requests of the corrected transfer"
          />
        </div>
      )}
    </div>
  )
}
