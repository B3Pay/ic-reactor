import { isReactorError } from "@ic-reactor/core"
import { useId, type JSX } from "react"
import { ErrorPanel } from "../calls/ErrorPanel.tsx"
import { ReplyView } from "../values/ReplyView.tsx"
import { LabTransferForm } from "./LabTransferForm.tsx"
import { LAB_UNITS, labMethod } from "./mock-ledger.ts"
import { RequestLog } from "./RequestLog.tsx"
import type {
  Scenario,
  ScenarioReply,
  ScenarioResult,
  ScenarioStep,
} from "./scenarios.ts"

/** Where a scenario's card is: never run, running, or run with its result. */
export type RunState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "done"; readonly result: ScenarioResult }

export interface ScenarioCardProps {
  readonly number: number
  readonly scenario: Scenario
  readonly state: RunState
  /** Set while another run is going: one scenario runs at a time. */
  readonly blocked: boolean
  onRun(): void
}

/** One scenario: what it claims, the code it runs, a Run button, and what came back. */
export function ScenarioCard(props: ScenarioCardProps): JSX.Element {
  const { number, scenario, state, blocked, onRun } = props
  const titleId = useId()
  const running = state.status === "running"
  return (
    <article
      className="card safety-card"
      aria-labelledby={titleId}
      aria-busy={running}
    >
      <header className="card-header safety-card-header">
        <span className="safety-number" aria-hidden="true">
          {number}
        </span>
        <h2 className="card-title safety-card-title" id={titleId}>
          <span className="sr-only">Scenario {number}: </span>
          {scenario.title}
        </h2>
        <VerdictBadge state={state} />
      </header>
      <div className="card-body stack">
        <p>{scenario.narrative}</p>
        <p className="safety-rule">
          <span className="safety-rule-label">The rule</span>
          {scenario.rule}
        </p>
        <p className="text-sm">
          <strong>Expected: </strong>
          <span className="muted">{scenario.expected}</span>
        </p>
        <details className="disclosure">
          <summary>The code it runs</summary>
          <div className="disclosure-body">
            <pre className="code">
              <code>{scenario.code}</code>
            </pre>
          </div>
        </details>
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onRun}
            disabled={running || blocked}
          >
            {running && (
              <span className="spinner spinner-sm" aria-hidden="true" />
            )}
            {running
              ? "Running…"
              : state.status === "done"
                ? "Run again"
                : "Run"}
          </button>
        </div>
        {/* Present from the first render, so screen readers announce each verdict. */}
        <p className="sr-only" aria-live="polite">
          {state.status === "done"
            ? `Scenario ${number} ${state.result.verdict.pass ? "passed" : "failed"}. ${state.result.verdict.summary}`
            : ""}
        </p>
        {state.status === "done" && (
          <ScenarioOutcome scenario={scenario} result={state.result} />
        )}
      </div>
    </article>
  )
}

function VerdictBadge(props: { readonly state: RunState }): JSX.Element {
  const { state } = props
  if (state.status === "idle") {
    return <span className="badge safety-verdict">Not run</span>
  }
  if (state.status === "running") {
    return <span className="badge badge-info safety-verdict">Running</span>
  }
  return state.result.verdict.pass ? (
    <span className="badge badge-ok badge-dot safety-verdict">Pass</span>
  ) : (
    <span className="badge badge-err badge-dot safety-verdict">Fail</span>
  )
}

function ScenarioOutcome(props: {
  readonly scenario: Scenario
  readonly result: ScenarioResult
}): JSX.Element {
  const { scenario, result } = props
  return (
    <div className="stack safety-outcome">
      {result.verdict.pass ? (
        <div className="notice notice-success">
          <p className="notice-title">
            Verdict: ic-reactor did what this claims
          </p>
          <p>{result.verdict.summary}</p>
        </div>
      ) : (
        <div className="notice notice-danger">
          <p className="notice-title">Verdict: FAILED</p>
          <p>{result.verdict.summary}</p>
        </div>
      )}

      <section className="stack-sm" aria-label="Steps and checks">
        <h3 className="safety-subtitle">Steps and checks</h3>
        <ol className="list-plain safety-steps">
          {result.steps.map((step, i) => (
            // Steps are recorded once per run and never reordered.
            <StepItem key={i} step={step} />
          ))}
        </ol>
      </section>

      <section className="stack-sm" aria-label="Request log">
        <h3 className="safety-subtitle">
          Request log{" "}
          <span className="muted text-sm">
            ({result.requests.length}{" "}
            {result.requests.length === 1 ? "request" : "requests"})
          </span>
        </h3>
        <RequestLog
          requests={result.requests}
          caption={`Requests the replica received in scenario ${scenario.title}`}
        />
      </section>

      {result.error !== undefined && (
        <section className="stack-sm" aria-label="The error">
          <h3 className="safety-subtitle">The ReactorError</h3>
          <LabErrorPanel error={result.error} />
        </section>
      )}

      {result.moreErrors?.map((more) => (
        <section key={more.label} className="stack-sm" aria-label={more.label}>
          <h3 className="safety-subtitle">{more.label}</h3>
          <LabErrorPanel
            error={more.error}
            afterResend={more.afterResend === true}
          />
        </section>
      ))}

      {result.form !== undefined && (
        <section className="stack-sm" aria-label="The arguments in a form">
          <h3 className="safety-subtitle">The issues on a form</h3>
          <p className="text-sm muted">
            The studio's automatic form for icrc1_transfer, prefilled with the
            refused argument. Fix the fields and send it to a fresh lab.
          </p>
          <LabTransferForm
            method={result.form.method}
            values={result.form.values}
            error={result.error}
          />
        </section>
      )}

      {result.reply !== undefined && <LabReply reply={result.reply} />}
    </div>
  )
}

const STEP_MARKS: Readonly<
  Record<ScenarioStep["status"], { mark: string; label: string }>
> = {
  pass: { mark: "✓", label: "Check held" },
  fail: { mark: "✗", label: "Check FAILED" },
  info: { mark: "→", label: "Step" },
}

function StepItem(props: { readonly step: ScenarioStep }): JSX.Element {
  const { step } = props
  const { mark, label } = STEP_MARKS[step.status]
  return (
    <li className={`safety-step safety-step-${step.status}`}>
      <span className="safety-step-mark" aria-hidden="true">
        {mark}
      </span>
      <span className="sr-only">{label}: </span>
      <span className="safety-step-text">
        <span>{step.label}</span>
        {step.detail !== undefined && step.detail !== "" && (
          <span className="safety-step-detail mono break-all">
            {step.detail}
          </span>
        )}
      </span>
    </li>
  )
}

/** ErrorPanel with the mock ledger's method, so a canister_err shows its typed Err payload. */
function LabErrorPanel(props: {
  readonly error: unknown
  readonly afterResend?: boolean
}): JSX.Element {
  const method = isReactorError(props.error)
    ? labMethod(props.error.method)
    : undefined
  return (
    <ErrorPanel
      error={props.error}
      method={method}
      units={LAB_UNITS}
      earlierUnknown={props.afterResend}
    />
  )
}

function LabReply(props: {
  readonly reply: ScenarioReply
}): JSX.Element | null {
  const { reply } = props
  const method = labMethod(reply.method)
  if (method === undefined) return null
  return (
    <section className="stack-sm" aria-label="The reply">
      <h3 className="safety-subtitle">
        Reply of <span className="mono">{reply.method}</span>
      </h3>
      <ReplyView
        method={method}
        reply={reply.value}
        units={reply.tokens ? LAB_UNITS : undefined}
      />
    </section>
  )
}
