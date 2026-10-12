import type { MethodMode } from "@candid-core/schema"
import { Link } from "@tanstack/react-router"
import { useId, useState, type ReactElement } from "react"
import { argsFitInUrl, sharedCallUrl } from "../../calls/share.ts"
import { useCallHistory, type HistoryEntry } from "../../calls/history.ts"
import { formatNanos, groupDigits, shortPrincipal } from "../../lib/format.ts"
import { fromHex } from "../../lib/hex.ts"
import { Badge, ModeBadge } from "../Badge.tsx"
import { MODE_LABEL, MODE_ORDER } from "../modes.ts"
import { CopyButton } from "../CopyButton.tsx"
import { EmptyState } from "../EmptyState.tsx"

type OutcomeFilter = "all" | HistoryEntry["outcome"]
type ModeFilter = "all" | MethodMode

const OUTCOME_LABEL: Readonly<Record<HistoryEntry["outcome"], string>> = {
  ok: "Ok",
  canister_err: "Canister Err",
  error: "Failed",
}

/**
 * This browser's call history: filter by text, outcome and mode; replay a call
 * (reads run again, writes open prefilled and wait for you); copy its
 * shared link; clear it all. Browser only (the page renders it inside
 * `ClientOnly`): the history lives in this browser's storage.
 */
export function HistoryList(): ReactElement {
  const history = useCallHistory()
  const ids = useId()
  const [text, setText] = useState("")
  const [outcome, setOutcome] = useState<OutcomeFilter>("all")
  const [mode, setMode] = useState<ModeFilter>("all")
  const [confirmClear, setConfirmClear] = useState(false)

  const needle = text.trim().toLowerCase()
  const shown = history.entries.filter(
    (entry) =>
      (outcome === "all" || entry.outcome === outcome) &&
      (mode === "all" || entry.mode === mode) &&
      (needle === "" ||
        entry.method.toLowerCase().includes(needle) ||
        entry.canisterName.toLowerCase().includes(needle) ||
        entry.canisterId.includes(needle))
  )

  if (history.entries.length === 0) {
    return (
      <EmptyState
        title="No calls yet"
        actions={
          <Link
            to="/canister/$canisterId"
            params={{ canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai" }}
            className="btn btn-primary"
          >
            Make a first read
          </Link>
        }
      >
        <p>
          Every call you run or send in this browser lands here, with its exact
          argument bytes, so you can replay it or share it.
        </p>
      </EmptyState>
    )
  }

  return (
    <div className="stack">
      <div className="row history-filters">
        <div className="field grow">
          <label htmlFor={`${ids}-text`} className="field-label">
            Search
          </label>
          <input
            id={`${ids}-text`}
            type="search"
            className="input"
            placeholder="Method, canister name or id"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${ids}-outcome`} className="field-label">
            Outcome
          </label>
          <select
            id={`${ids}-outcome`}
            className="select"
            value={outcome}
            onChange={(event) =>
              setOutcome(event.target.value as OutcomeFilter)
            }
          >
            <option value="all">All</option>
            {(["ok", "canister_err", "error"] as const).map((value) => (
              <option key={value} value={value}>
                {OUTCOME_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-mode`} className="field-label">
            Mode
          </label>
          <select
            id={`${ids}-mode`}
            className="select"
            value={mode}
            onChange={(event) => setMode(event.target.value as ModeFilter)}
          >
            <option value="all">All</option>
            {MODE_ORDER.map((value) => (
              <option key={value} value={value}>
                {MODE_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="history-clear">
          {confirmClear ? (
            <div className="row-sm">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  history.clear()
                  setConfirmClear(false)
                }}
              >
                Clear {groupDigits(history.entries.length)} calls
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setConfirmClear(false)}
              >
                Keep them
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setConfirmClear(true)}
            >
              Clear history
            </button>
          )}
        </div>
      </div>

      <p className="text-xs muted" role="status" aria-live="polite">
        {groupDigits(shown.length)} of {groupDigits(history.entries.length)}{" "}
        calls
      </p>

      {shown.length === 0 ? (
        <p className="muted text-sm">No call matches these filters.</p>
      ) : (
        <div className="table-wrap">
          <table className="table history-table">
            <caption className="sr-only">
              Calls made in this browser, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">When (UTC)</th>
                <th scope="col">Canister</th>
                <th scope="col">Method</th>
                <th scope="col">Caller</th>
                <th scope="col">Outcome</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HistoryRow({ entry }: { entry: HistoryEntry }): ReactElement {
  // An entry keeps the method's mode, not its results, so a query without
  // results is offered as a replay too. The page reads at once only what it
  // can read (`readsAtOnce`) and opens the rest prefilled, so this guess
  // costs a label, never a call.
  const isRead = entry.mode === "query" || entry.mode === "composite_query"
  // Empty bytes: arguments too large to keep, so the link opens the method
  // unfilled (and runs nothing).
  const bytes = fromHex(entry.argsHex) ?? new Uint8Array()
  const fits = bytes.length > 0 && argsFitInUrl(bytes)
  const shareUrl = `${window.location.origin}${sharedCallUrl(entry.canisterId, entry.method, bytes, isRead)}`
  return (
    <tr>
      <td className="tabular nowrap text-xs">
        {formatNanos(BigInt(Math.trunc(entry.at)) * 1_000_000n)}
      </td>
      <td>
        <div className="stack-xs">
          <span>{entry.canisterName}</span>
          <span className="mono subtle text-xs" title={entry.canisterId}>
            {shortPrincipal(entry.canisterId)}
          </span>
        </div>
      </td>
      <td>
        <div className="stack-xs">
          <span className="mono break-all">{entry.method}</span>
          <ModeBadge mode={entry.mode} />
        </div>
      </td>
      <td className="mono text-xs" title={entry.caller}>
        {shortPrincipal(entry.caller)}
      </td>
      <td>
        <div className="stack-xs">
          <span className="row-sm">
            <Badge
              tone={
                entry.outcome === "ok"
                  ? "ok"
                  : entry.outcome === "canister_err"
                    ? "warn"
                    : "err"
              }
            >
              {OUTCOME_LABEL[entry.outcome]}
            </Badge>
            {entry.kind !== undefined && (
              <span className="mono text-xs muted">{entry.kind}</span>
            )}
            {entry.mayHaveExecuted === true && (
              <Badge
                tone="err"
                title="The write may have executed: read the state back before sending it again"
              >
                may have executed
              </Badge>
            )}
          </span>
          <span className="text-xs muted break-all">{entry.summary}</span>
        </div>
      </td>
      <td>
        <div className="row-sm row-nowrap">
          <Link
            to="/canister/$canisterId"
            params={{ canisterId: entry.canisterId }}
            search={{
              method: entry.method,
              args: fits ? entry.argsHex : undefined,
              run: fits && isRead ? true : undefined,
            }}
            className="btn btn-sm"
            title={
              isRead
                ? "Open the method and read it again with these arguments"
                : "Open the method with these arguments; writes are never sent from a link"
            }
          >
            {isRead ? "Replay" : "Open"}
          </Link>
          <CopyButton text={shareUrl} label="Copy shared link" iconOnly />
        </div>
      </td>
    </tr>
  )
}
