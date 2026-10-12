import { useId, useState, type ReactElement } from "react"
import { projectInterface } from "../../interface/functions.ts"
import type { CanisterInterface } from "../../interface/types.ts"
import { groupDigits } from "../../lib/format.ts"
import { ModeBadge } from "../Badge.tsx"
import { Code } from "../Code.tsx"
import { safeFileName } from "../download.ts"
import { Notice } from "../Notice.tsx"
import { Spinner } from "../Spinner.tsx"
import { useTask } from "../use-task.ts"

interface Projection {
  did: string
  methods: string[]
}

/**
 * Pick methods, get a self-contained .did with exactly those methods and
 * every type they reach (`projectDid` on the server, from the canister's
 * live interface): the written side of a compatibility check, or the input
 * of a small generated module.
 */
export function ProjectTab({
  iface,
}: {
  iface: CanisterInterface
}): ReactElement {
  const ids = useId()
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set())
  const [filter, setFilter] = useState("")
  const task = useTask<Projection>()

  const needle = filter.trim().toLowerCase()
  const shown = iface.methods.filter(
    (method) => needle === "" || method.name.toLowerCase().includes(needle)
  )

  const toggle = (name: string, on: boolean): void => {
    setChosen((previous) => {
      const next = new Set(previous)
      if (on) next.add(name)
      else next.delete(name)
      return next
    })
    task.reset()
  }

  const setAll = (on: boolean): void => {
    setChosen((previous) => {
      const next = new Set(previous)
      for (const method of shown) {
        if (on) next.add(method.name)
        else next.delete(method.name)
      }
      return next
    })
    task.reset()
  }

  const project = (): void => {
    const methods = iface.methods
      .map((method) => method.name)
      .filter((name) => chosen.has(name))
    task.run(async () => {
      const result = await projectInterface({
        data: { canisterId: iface.canisterId, methods },
      })
      if (!result.ok) throw new Error(result.message)
      return { did: result.did, methods: result.methods }
    })
  }

  const state = task.state
  return (
    <div className="stack-lg">
      <p className="text-sm muted">
        Choose the methods your app calls. The projection keeps their doc
        comments and the declarations they reach, nothing else.
      </p>
      <fieldset className="fieldset iface-project-methods">
        <legend>
          Methods ({groupDigits(chosen.size)} of{" "}
          {groupDigits(iface.methods.length)} chosen)
        </legend>
        <div className="row row-between">
          <label htmlFor={`${ids}-filter`} className="sr-only">
            Filter methods
          </label>
          <input
            id={`${ids}-filter`}
            type="search"
            className="input grow iface-project-filter"
            placeholder="Filter methods"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <div className="row-sm">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setAll(true)}
            >
              Choose {needle === "" ? "all" : "shown"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setAll(false)}
            >
              Clear {needle === "" ? "all" : "shown"}
            </button>
          </div>
        </div>
        <ul className="list-plain iface-project-list">
          {shown.map((method) => (
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
        <button
          type="button"
          className="btn btn-primary"
          onClick={project}
          disabled={chosen.size === 0 || state.status === "running"}
        >
          {state.status === "running"
            ? "Projecting…"
            : `Project ${groupDigits(chosen.size)} ${chosen.size === 1 ? "method" : "methods"}`}
        </button>
        {chosen.size === 0 && (
          <span className="text-sm muted">Choose at least one method.</span>
        )}
        {state.status === "running" && (
          <Spinner size="sm" label="Projecting the interface" />
        )}
      </div>
      {state.status === "failed" && (
        <Notice tone="danger" title="Projection failed">
          <p className="break-all">{state.message}</p>
        </Notice>
      )}
      {state.status === "done" && (
        <Code
          text={state.value.did}
          label={`candid (${groupDigits(state.value.methods.length)} methods)`}
          showSize
          download={{
            filename: `${safeFileName(iface.registry?.slug ?? iface.name)}.projected.did`,
          }}
          maxHeight="60vh"
          ariaLabel="Projected Candid interface"
        />
      )}
    </div>
  )
}
