import type { CompatibilityReport } from "@candid-core/cli"
import { useEffect, useState, type ReactElement } from "react"
import {
  checkCompatibleInBrowser,
  moduleInBrowser,
  projectInBrowser,
} from "../../interface/browser.ts"
import { loadLivePayload } from "../../interface/load.ts"
import type {
  CanisterInterface,
  InterfaceSource,
} from "../../interface/types.ts"
import { groupDigits } from "../../lib/format.ts"
import { ActionButton } from "../ActionButton.tsx"
import { ModeBadge } from "../Badge.tsx"
import { Code } from "../Code.tsx"
import { CompatReport } from "../interface/CompatReport.tsx"
import { Notice } from "../Notice.tsx"
import { ProvenanceBadge } from "../ProvenanceBadge.tsx"
import { Spinner } from "../Spinner.tsx"
import { useTask } from "../use-task.ts"

/** The TypeScript module `didToModule` writes for the pasted .did. */
export function PlaygroundModule({ did }: { did: string }): ReactElement {
  const task = useTask<string>()
  const { run } = task
  useEffect(() => {
    run(async () => {
      const result = await moduleInBrowser(did)
      if (!result.ok) throw new Error(result.message)
      return result.module
    })
  }, [run, did])
  const state = task.state
  if (state.status === "failed") {
    return (
      <Notice tone="danger" title="No module">
        <p className="break-all">{state.message}</p>
      </Notice>
    )
  }
  if (state.status !== "done") {
    return (
      <div className="row text-sm muted">
        <Spinner size="sm" label="Generating" />
        <span>Generating the module in your browser…</span>
      </div>
    )
  }
  return (
    <Code
      text={state.value}
      label="typescript"
      showSize
      download={{
        filename: "service.ts",
        type: "text/typescript;charset=utf-8",
      }}
      maxHeight="70vh"
      ariaLabel="Generated TypeScript module"
    />
  )
}

/** Some methods of the pasted .did, as a self-contained .did. */
export function PlaygroundProject({
  iface,
  did,
}: {
  iface: CanisterInterface
  did: string
}): ReactElement {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set())
  const task = useTask<string>()
  const state = task.state

  const toggle = (name: string, on: boolean): void => {
    setChosen((previous) => {
      const next = new Set(previous)
      if (on) next.add(name)
      else next.delete(name)
      return next
    })
    task.reset()
  }

  return (
    <div className="stack-lg">
      <fieldset className="fieldset iface-project-methods">
        <legend>
          Methods ({groupDigits(chosen.size)} of{" "}
          {groupDigits(iface.methods.length)} chosen)
        </legend>
        <ul className="list-plain iface-project-list">
          {iface.methods.map((method) => (
            <li key={method.name}>
              <label className="iface-project-item">
                <input
                  type="checkbox"
                  checked={chosen.has(method.name)}
                  onChange={(event) =>
                    toggle(method.name, event.target.checked)
                  }
                />
                <span className="mono truncate grow">{method.name}</span>
                <ModeBadge mode={method.mode} />
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="row">
        <ActionButton
          className="btn btn-primary"
          unavailable={chosen.size === 0 || state.status === "running"}
          onClick={() =>
            task.run(async () => {
              const names = iface.methods
                .map((method) => method.name)
                .filter((name) => chosen.has(name))
              const result = await projectInBrowser(did, names)
              if (!result.ok) throw new Error(result.message)
              return result.did
            })
          }
        >
          Project
        </ActionButton>
        {state.status === "running" && <Spinner size="sm" label="Projecting" />}
      </div>
      {state.status === "failed" && (
        <Notice tone="danger" title="Projection failed">
          <p className="break-all">{state.message}</p>
        </Notice>
      )}
      {state.status === "done" && (
        <Code
          text={state.value}
          label="candid"
          showSize
          download={{ filename: "service.projected.did" }}
          maxHeight="60vh"
          ariaLabel="Projected Candid interface"
        />
      )}
    </div>
  )
}

interface LiveCheck {
  report: CompatibilityReport
  source: InterfaceSource
}

/**
 * The pasted .did against the target canister's live interface (read on the
 * server, or in the browser where server functions cannot run; checked in
 * the browser): can an app written against the paste call this canister?
 */
export function PlaygroundCompat({
  did,
  target,
}: {
  did: string
  target: string | undefined
}): ReactElement {
  const task = useTask<LiveCheck>()
  const state = task.state
  if (target === undefined) {
    return (
      <p className="text-sm muted">
        Enter a target canister above to check the pasted .did against its live
        interface.
      </p>
    )
  }
  return (
    <div className="stack">
      <div className="row">
        <ActionButton
          className="btn btn-primary"
          unavailable={state.status === "running"}
          onClick={() =>
            task.run(async () => {
              const live = await loadLivePayload(target)
              if (!live.ok) throw new Error(`${live.code}: ${live.message}`)
              const report = await checkCompatibleInBrowser(did, live.did)
              if (!report.ok) throw new Error(report.message)
              return { report, source: live.source }
            })
          }
        >
          Check against <span className="mono">{target}</span>
        </ActionButton>
        {state.status === "running" && (
          <Spinner size="sm" label="Checking compatibility" />
        )}
      </div>
      {state.status === "failed" && (
        <Notice tone="danger" title="The check did not run">
          <p className="break-all">{state.message}</p>
        </Notice>
      )}
      {state.status === "done" && (
        <div className="stack-sm">
          <p className="row-sm text-sm muted">
            <span>Live interface:</span>
            <ProvenanceBadge source={state.value.source} size="md" />
          </p>
          <CompatReport
            report={state.value.report}
            writtenLabel="pasted .did"
            liveLabel="live interface"
          />
        </div>
      )}
    </div>
  )
}
