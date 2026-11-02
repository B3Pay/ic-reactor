import type { CompatibilityReport } from "@meantjs/cli"
import { useId, useState, type ReactElement } from "react"
import { checkCompatibleInBrowser } from "../../interface/browser.ts"
import { checkLiveCompatibility } from "../../interface/functions.ts"
import { loadLivePayload } from "../../interface/load.ts"
import { serverResult } from "../../interface/server-result.ts"
import type {
  CanisterInterface,
  InterfaceSource,
} from "../../interface/types.ts"
import { ActionButton } from "../ActionButton.tsx"
import { Notice } from "../Notice.tsx"
import { ProvenanceBadge } from "../ProvenanceBadge.tsx"
import { Spinner } from "../Spinner.tsx"
import { useTask, type TaskState } from "../use-task.ts"
import { CompatReport } from "./CompatReport.tsx"

interface Checked {
  report: CompatibilityReport
  liveSource: InterfaceSource
}

/**
 * The live interface, for a check: the page's own for a canister read live,
 * a fresh live read for a typed one (whose page shows the committed .did),
 * from the browser when the server function cannot run.
 */
async function liveInterface(
  iface: CanisterInterface
): Promise<{ did: string; source: InterfaceSource }> {
  if (iface.source.kind !== "typed" && iface.did !== undefined) {
    return { did: iface.did, source: iface.source }
  }
  const payload = await loadLivePayload(iface.canisterId)
  if (!payload.ok) throw new Error(`${payload.code}: ${payload.message}`)
  return { did: payload.did, source: payload.source }
}

/** A pasted .did against the live interface, checked in the browser. */
async function checkPasted(
  written: string,
  iface: CanisterInterface
): Promise<Checked> {
  const live = await liveInterface(iface)
  const report = await checkCompatibleInBrowser(written, live.did)
  if (!report.ok) throw new Error(report.message)
  return { report, liveSource: live.source }
}

/** A typed canister's committed .did against the live one, checked on the server. */
async function checkCommitted(iface: CanisterInterface): Promise<Checked> {
  const result = await serverResult(
    checkLiveCompatibility({ data: { canisterId: iface.canisterId } })
  )
  if (!result.ok) throw new Error(result.message)
  return { report: result.report, liveSource: result.source }
}

/**
 * Is a written interface still good against the canister? Typed canisters
 * check their committed .did against the live one, on the server; any
 * canister checks a pasted .did, in the browser (`checkCompatible`, with the
 * compiler's WASM loaded on first use).
 */
export function CompatibilityTab({
  iface,
}: {
  iface: CanisterInterface
}): ReactElement {
  const typed = iface.source.kind === "typed" && iface.registry !== undefined
  return (
    <div className="stack-xl">
      <p className="text-sm muted">
        The live service must be a Candid subtype of the written one: every
        written method still there, with the same mode, arguments it accepts and
        results the written types can read. Methods only the live service has
        are fine.
      </p>
      {typed && <CommittedCheck iface={iface} />}
      <PastedCheck iface={iface} />
    </div>
  )
}

function CommittedCheck({ iface }: { iface: CanisterInterface }): ReactElement {
  const task = useTask<Checked>()
  const state = task.state
  return (
    <section className="stack" aria-labelledby="compat-committed-title">
      <h3 id="compat-committed-title" className="section-title">
        Committed .did against mainnet
      </h3>
      <p className="text-sm muted">
        The server reads the canister’s live interface and checks that the .did
        the typed module was generated from still describes it.
      </p>
      <div className="row">
        <ActionButton
          className="btn btn-primary"
          unavailable={state.status === "running"}
          onClick={() => task.run(() => checkCommitted(iface))}
        >
          {state.status === "done" ? "Check again" : "Check against mainnet"}
        </ActionButton>
        {state.status === "running" && (
          <Spinner size="sm" label="Checking compatibility" />
        )}
      </div>
      <CheckOutcome state={state} writtenLabel="committed .did" />
    </section>
  )
}

function PastedCheck({ iface }: { iface: CanisterInterface }): ReactElement {
  const ids = useId()
  const [written, setWritten] = useState("")
  const task = useTask<Checked>()
  const state = task.state
  return (
    <section className="stack" aria-labelledby="compat-pasted-title">
      <h3 id="compat-pasted-title" className="section-title">
        Your .did against mainnet
      </h3>
      <div className="field">
        <label htmlFor={`${ids}-did`} className="field-label">
          Written .did (a full interface or the subset your app calls)
        </label>
        <textarea
          id={`${ids}-did`}
          className="textarea mono iface-compat-input"
          spellCheck={false}
          placeholder={
            "service : {\n  icrc1_balance_of : (record { owner : principal; subaccount : opt blob }) -> (nat) query;\n}"
          }
          value={written}
          onChange={(event) => {
            setWritten(event.target.value)
            task.reset()
          }}
        />
        <p className="field-hint">
          Checked in your browser; the text is never sent anywhere.
        </p>
      </div>
      <div className="row">
        <ActionButton
          className="btn btn-primary"
          unavailable={written.trim() === "" || state.status === "running"}
          onClick={() => task.run(() => checkPasted(written, iface))}
        >
          Check
        </ActionButton>
        {state.status === "running" && (
          <Spinner size="sm" label="Checking compatibility" />
        )}
      </div>
      <CheckOutcome state={state} writtenLabel="written .did" />
    </section>
  )
}

function CheckOutcome({
  state,
  writtenLabel,
}: {
  state: TaskState<Checked>
  writtenLabel: string
}): ReactElement | null {
  if (state.status === "failed") {
    return (
      <Notice tone="danger" title="The check did not run">
        <p className="break-all">{state.message}</p>
      </Notice>
    )
  }
  if (state.status !== "done") return null
  return (
    <div className="stack-sm">
      <p className="row-sm text-sm muted">
        <span>Live interface:</span>
        <ProvenanceBadge source={state.value.liveSource} size="md" />
      </p>
      <CompatReport
        report={state.value.report}
        writtenLabel={writtenLabel}
        liveLabel="live interface"
      />
    </div>
  )
}
