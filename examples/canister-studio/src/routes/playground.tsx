import { createFileRoute } from "@tanstack/react-router"
import { useId, useMemo, useState, type ReactElement } from "react"
import { z } from "zod"
import { ActionButton } from "../components/ActionButton.tsx"
import { Card } from "../components/Card.tsx"
import { useCanisterIdInput } from "../components/canister-id-input.ts"
import { Notice } from "../components/Notice.tsx"
import { PlaygroundForms } from "../components/playground/PlaygroundForms.tsx"
import {
  PlaygroundCompat,
  PlaygroundModule,
  PlaygroundProject,
} from "../components/playground/PlaygroundTools.tsx"
import { SAMPLE_DID } from "../components/playground/sample.ts"
import { ProvenanceBadge } from "../components/ProvenanceBadge.tsx"
import { RouteError } from "../components/RouteError.tsx"
import { Spinner } from "../components/Spinner.tsx"
import { Tabs } from "../components/Tabs.tsx"
import { useTask } from "../components/use-task.ts"
import { compileDidInBrowser } from "../interface/browser.ts"
import { useCanisterInterface } from "../interface/load.ts"
import type { InterfacePayload } from "../interface/types.ts"
import { formatByteSize, groupDigits } from "../lib/format.ts"
import { KNOWN_CANISTERS } from "../lib/registry.ts"

const searchSchema = z.object({
  // Prefills the target canister (the canister page links here when a
  // canister publishes no interface). Checked again as it is typed.
  target: z.string().max(64).optional().catch(undefined),
})

type ToolTab = "forms" | "typescript" | "project" | "compatibility"

const encoder = new TextEncoder()

/** A message ended as a sentence, so another can follow it. */
const asSentence = (text: string): string =>
  /[.!?]$/.test(text) ? text : `${text}.`

export const Route = createFileRoute("/playground")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Playground · Canister Studio" },
      {
        name: "description",
        content:
          "Paste a .did, compile it in the browser, and get forms, a TypeScript module, a projection and a compatibility check against a live canister.",
      },
    ],
  }),
  errorComponent: (props) => (
    <RouteError {...props} title="The playground failed" />
  ),
  component: PlaygroundPage,
})

type Compiled = Extract<InterfacePayload, { ok: true }>

function PlaygroundPage(): ReactElement {
  const search = Route.useSearch()
  const ids = useId()
  const [did, setDid] = useState(SAMPLE_DID)
  const [compiledDid, setCompiledDid] = useState<string | undefined>(undefined)
  const compile = useTask<InterfacePayload>()
  const target = useCanisterIdInput(search.target ?? "")
  const targetId = target.verdict.state === "ok" ? target.verdict.id : undefined

  const runCompile = (): void => {
    const text = did
    setCompiledDid(text)
    compile.run(() => compileDidInBrowser(text))
  }

  const state = compile.state
  const payload = state.status === "done" ? state.value : undefined

  return (
    <div className="page playground">
      <header className="page-header">
        <h1 className="page-title">Playground</h1>
        <p className="page-subtitle">
          Paste a .did and compile it in your browser (the compiler’s WASM loads
          on first use). Every method gets a form; give a canister id to call it
          on mainnet.
        </p>
      </header>

      <div className="grid grid-2 pg-inputs">
        <Card title=".did source" headingLevel={2}>
          <div className="field">
            <label htmlFor={`${ids}-did`} className="sr-only">
              Candid interface
            </label>
            <textarea
              id={`${ids}-did`}
              className="textarea mono pg-source"
              spellCheck={false}
              value={did}
              onChange={(event) => setDid(event.target.value)}
              aria-describedby={`${ids}-did-hint`}
            />
            <p id={`${ids}-did-hint`} className="field-hint tabular">
              {formatByteSize(encoder.encode(did).length)}; compiled in this
              tab, never sent to a server.
            </p>
          </div>
          <div className="row">
            <ActionButton
              className="btn btn-primary"
              onClick={runCompile}
              unavailable={did.trim() === "" || state.status === "running"}
            >
              {state.status === "running" ? "Compiling…" : "Compile"}
            </ActionButton>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setDid(SAMPLE_DID)}
              disabled={did === SAMPLE_DID}
            >
              Restore the sample
            </button>
            {state.status === "running" && (
              <Spinner size="sm" label="Compiling" />
            )}
            {payload !== undefined && compiledDid !== did && (
              <span className="text-xs muted">
                Edited since the last compile.
              </span>
            )}
          </div>
        </Card>

        <Card title="Target canister (optional)" headingLevel={2}>
          <div className="field">
            <label htmlFor={`${ids}-target`} className="field-label">
              Canister id
            </label>
            <input
              id={`${ids}-target`}
              className="input mono"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Leave empty to encode only"
              list={`${ids}-known`}
              value={target.text}
              onChange={(event) => target.setText(event.target.value)}
              // Leaving the field is when a mistyped id is said to be one:
              // it is dropped otherwise, and the forms only encode.
              onBlur={() => {
                if (target.text.trim() !== "") target.attempt()
              }}
              aria-invalid={target.showProblem}
              aria-describedby={`${ids}-target-hint`}
            />
            <datalist id={`${ids}-known`}>
              {KNOWN_CANISTERS.map((known) => (
                <option key={known.id} value={known.id}>
                  {known.name}
                </option>
              ))}
            </datalist>
            <p
              id={`${ids}-target-hint`}
              className={target.showProblem ? "field-error" : "field-hint"}
            >
              {target.verdict.state === "invalid"
                ? target.showProblem
                  ? `${asSentence(target.verdict.message)} Until it is a canister id, forms only encode.`
                  : "Not a canister id yet: forms only encode."
                : targetId !== undefined
                  ? "Forms call this canister on mainnet."
                  : "Without one, a form shows the exact Candid message it would send."}
            </p>
          </div>
          {targetId !== undefined && (
            <Notice tone="warn" title="Nothing ties the paste to this canister">
              <p>
                Calls encode with the pasted types and decode replies with them.
                If the canister’s real interface differs, a call fails (
                <code className="code-inline">invalid_reply</code>) or worse,
                means something else: check compatibility first.
              </p>
            </Notice>
          )}
        </Card>
      </div>

      {state.status === "failed" && (
        <Notice tone="danger" title="The compiler did not run">
          <p className="break-all">{state.message}</p>
        </Notice>
      )}
      {payload !== undefined && !payload.ok && (
        <CompileFailure payload={payload} />
      )}
      {payload !== undefined && payload.ok && compiledDid !== undefined && (
        <CompiledTools
          key={payload.didSha256}
          payload={payload}
          did={compiledDid}
          target={targetId}
        />
      )}
    </div>
  )
}

function CompileFailure({
  payload,
}: {
  payload: Extract<InterfacePayload, { ok: false }>
}): ReactElement {
  return (
    <Notice tone="danger" title="The .did did not compile">
      <p className="break-all">{payload.message}</p>
      {payload.diagnostics !== undefined && payload.diagnostics.length > 0 && (
        <ul className="list-plain stack-xs">
          {payload.diagnostics.map((diagnostic, i) => (
            <li key={`${diagnostic.code}-${i}`} className="break-all">
              <span className="mono">{diagnostic.code}</span>:{" "}
              {diagnostic.message}
            </li>
          ))}
        </ul>
      )}
    </Notice>
  )
}

function CompiledTools({
  payload,
  did,
  target,
}: {
  payload: Compiled
  did: string
  target: string | undefined
}): ReactElement {
  const [tab, setTab] = useState<ToolTab>("forms")
  // The interface calls the target, or nothing: a pasted interface is
  // rebuilt per target (its canister id is part of the interface).
  const targeted = useMemo<Compiled>(
    () => ({ ...payload, canisterId: target ?? "" }),
    [payload, target]
  )
  const iface = useCanisterInterface(targeted)
  if (iface === undefined) return <></>

  return (
    <section className="stack" aria-label="Compiled interface">
      <div className="row">
        <ProvenanceBadge source={iface.source} />
        <span className="text-sm muted">
          {groupDigits(iface.methods.length)}{" "}
          {iface.methods.length === 1 ? "method" : "methods"}
          {iface.omitted.length > 0
            ? `, ${groupDigits(iface.omitted.length)} left out`
            : ""}
        </span>
      </div>
      <Tabs<ToolTab>
        label="Playground tools"
        selected={tab}
        onSelect={setTab}
        tabs={[
          { key: "forms", label: "Forms" },
          { key: "typescript", label: "TypeScript" },
          { key: "project", label: "Project" },
          { key: "compatibility", label: "Compatibility" },
        ]}
      >
        {tab === "forms" && <PlaygroundForms iface={iface} target={target} />}
        {tab === "typescript" && <PlaygroundModule did={did} />}
        {tab === "project" && <PlaygroundProject iface={iface} did={did} />}
        {tab === "compatibility" && (
          <PlaygroundCompat key={target ?? ""} did={did} target={target} />
        )}
      </Tabs>
    </section>
  )
}
