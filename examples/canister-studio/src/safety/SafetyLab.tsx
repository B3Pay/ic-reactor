import { useCallback, useRef, useState, type JSX } from "react"
import { loadLabRuntime } from "./mock-ledger.ts"
import { ScenarioCard, type RunState } from "./ScenarioCard.tsx"
import { LAB_SETUP, SCENARIOS, type Scenario } from "./scenarios.ts"

const IDLE: RunState = { status: "idle" }

type LabStatus =
  | { readonly status: "ready" }
  | { readonly status: "unavailable"; readonly message: string }

/**
 * The Safety lab: each scenario runs on click, in the browser, against a fresh
 * `createTestClient()` (a mock ICRC-1 ledger on an in-memory replica that
 * signs and certifies like the real one, so nothing goes over the network),
 * and checks what ic-reactor did. The server renders the cards; nothing runs
 * until a visitor asks.
 */
export function SafetyLab(): JSX.Element {
  const [runs, setRuns] = useState<Readonly<Record<string, RunState>>>({})
  const [lab, setLab] = useState<LabStatus>({ status: "ready" })
  const [busy, setBusy] = useState(false)
  // A synchronous guard as well as the state: two clicks in one frame must
  // not start two runs.
  const running = useRef(false)

  const runScenarios = useCallback(
    async (list: readonly Scenario[]): Promise<void> => {
      if (running.current) return
      const setRun = (id: string, state: RunState): void =>
        setRuns((all) => ({ ...all, [id]: state }))
      running.current = true
      setBusy(true)
      try {
        await loadLabRuntime()
        setLab({ status: "ready" })
        for (const scenario of list) {
          setRun(scenario.id, { status: "running" })
          setRun(scenario.id, { status: "done", result: await scenario.run() })
        }
      } catch (cause) {
        setLab({
          status: "unavailable",
          message: cause instanceof Error ? cause.message : String(cause),
        })
      } finally {
        running.current = false
        setBusy(false)
      }
    },
    []
  )

  const done = SCENARIOS.flatMap((s) => {
    const state = runs[s.id]
    return state?.status === "done" ? [state.result.verdict.pass] : []
  })
  const passed = done.filter(Boolean).length
  const failed = done.length - passed

  return (
    <div className="stack-lg safety-lab">
      <section className="card" aria-labelledby="safety-intro-title">
        <div className="card-body stack">
          <h2 className="card-title" id="safety-intro-title">
            How the lab works
          </h2>
          <p>
            Every scenario creates a fresh test client from{" "}
            <code className="code-inline">@ic-reactor/core/testing</code> in
            this tab: a real ic-reactor client whose agent talks to an in-memory
            replica. The replica checks each signature and certifies each reply
            as the IC does, and runs a mock ICRC-1 ledger at the ckBTC ledger's
            id, with balances, a fee and{" "}
            <code className="code-inline">created_at_time</code> deduplication.
            Nothing leaves the page.
          </p>
          <p>
            Each run checks what ic-reactor did, step by step. If the library
            ever behaves differently from what a card says, its verdict turns to
            FAILED and names the check that did not hold.
          </p>
          <details className="disclosure">
            <summary>The setup every scenario starts from</summary>
            <div className="disclosure-body">
              <pre className="code">
                <code>{LAB_SETUP}</code>
              </pre>
            </div>
          </details>
          <div className="row row-between">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void runScenarios(SCENARIOS)}
            >
              {busy && (
                <span className="spinner spinner-sm" aria-hidden="true" />
              )}
              {busy ? "Running…" : "Run all scenarios"}
            </button>
            <p className="safety-tally" aria-live="polite">
              {done.length === 0
                ? `${SCENARIOS.length} scenarios, none run yet`
                : `${passed} passed, ${failed} failed, ${SCENARIOS.length - done.length} not run`}
            </p>
          </div>
          {lab.status === "unavailable" && (
            <div className="notice notice-warn" role="alert">
              <p className="notice-title">
                The test client could not start in this browser
              </p>
              <p className="break-all">{lab.message}</p>
              <p>
                Each card still says what the scenario shows when it runs, under
                Expected; <code className="code-inline">pnpm test</code> runs
                every scenario headless.
              </p>
            </div>
          )}
        </div>
      </section>

      <ol className="list-plain stack-lg" aria-label="Scenarios">
        {SCENARIOS.map((scenario, i) => (
          <li key={scenario.id} id={scenario.id} className="safety-item">
            <ScenarioCard
              number={i + 1}
              scenario={scenario}
              state={runs[scenario.id] ?? IDLE}
              blocked={busy}
              onRun={() => void runScenarios([scenario])}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
