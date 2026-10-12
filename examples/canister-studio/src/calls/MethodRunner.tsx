import type { JSX } from "react"
import type { HintResolver } from "../forms/hints.ts"
import type { CanisterInterface, MethodInfo } from "../interface/types.ts"
import type { TokenUnits } from "../lib/format.ts"
import { callKindOf, type CallKind } from "./kinds.ts"
import { ReadRunner } from "./ReadRunner.tsx"
import { WriteRunner } from "./WriteRunner.tsx"

export interface MethodRunnerProps {
  iface: CanisterInterface
  method: MethodInfo
  /** Prefill (history, a shared link). */
  initialValues?: readonly unknown[]
  /** Read at once with `initialValues` (a shared query link with `run=1`). Ignored for writes. */
  autoRun?: boolean
  /** Use the certified twin for queries. */
  certified?: boolean
  hints?: HintResolver
  units?: TokenUnits
  onShare?(url: string): void
}

const KIND_NOTES: Readonly<Record<CallKind["kind"], string>> = {
  read: "A read: cached per caller and arguments, safe to repeat.",
  idempotent: "An idempotent update: read like a query, through consensus.",
  update: "A write: reviewed before it is sent, and sent once.",
  oneway: "A oneway write: sent once, with no reply and no outcome.",
  call: "A query without results: called, not cached.",
}

/**
 * The composite every method page uses: MethodForm, the call (query, update,
 * oneway, idempotent read), ReplyView, errors, safe re-send, the cache panel,
 * the share link and history. The page shows the method's name, mode and
 * docs above it.
 *
 * The runner below is keyed by canister, interface and method: another
 * method starts from a clean form, with no reply, error or offer of the
 * previous one.
 */
export function MethodRunner(props: MethodRunnerProps): JSX.Element {
  const { iface, method } = props
  const kind = callKindOf(iface, method)
  const key = `${iface.canisterId}\u0000${iface.didSha256 ?? ""}\u0000${method.name}`
  return (
    <section className="card call-runner" aria-label={`Call ${method.name}`}>
      <div className="card-body stack">
        <p className="call-kind-note text-sm muted">{KIND_NOTES[kind.kind]}</p>
        {kind.kind === "read" || kind.kind === "idempotent" ? (
          <ReadRunner key={key} {...props} kind={kind} />
        ) : (
          <WriteRunner key={key} {...props} kind={kind} />
        )}
      </div>
    </section>
  )
}
