import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { RouteError } from "../components/RouteError.tsx"
import { SafetyLab } from "../safety/SafetyLab.tsx"

const RULES = [
  "A write from the anonymous principal is refused before anything is sent.",
  "Arguments that do not encode never leave the browser, and each issue names its field.",
  "Every failed write says whether it may have executed.",
  "A write is never retried blindly: the only re-send is the deduplicated one resendOf offers.",
  "A read made for one caller is never served to another.",
] as const

export const Route = createFileRoute("/safety")({
  head: () => ({
    meta: [
      { title: "Safety lab · Canister Studio" },
      {
        name: "description",
        content:
          "Lost replies, traps, 429s, a caller switching mid-flight: each rule ic-reactor enforces, run against an in-memory replica in the browser.",
      },
    ],
  }),
  errorComponent: (props) => (
    <RouteError {...props} title="The safety lab failed" />
  ),
  component: SafetyPage,
})

function SafetyPage(): ReactElement {
  return (
    <div className="page safety">
      <header className="page-header">
        <h1 className="page-title">Safety lab</h1>
        <p className="page-subtitle">
          Each scenario runs real ic-reactor calls against an in-memory replica
          in your browser: a mock ICRC-1 ledger, no network, nothing spent. Run
          one to see the requests, the error and what the client did about it.
        </p>
      </header>
      <section className="card card-inset" aria-labelledby="rules-title">
        <div className="card-body">
          <h2 id="rules-title" className="card-title">
            What the client guarantees
          </h2>
          <ul className="stack-xs text-sm safety-rules">
            {RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </section>
      <SafetyLab />
    </div>
  )
}
