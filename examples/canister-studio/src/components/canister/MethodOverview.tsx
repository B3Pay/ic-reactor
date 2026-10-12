import { encodeArgs } from "@candid-core/schema/codec"
import { Link } from "@tanstack/react-router"
import type { ReactElement } from "react"
import type { CanisterInterface, MethodInfo } from "../../interface/types.ts"
import { toHex } from "../../lib/hex.ts"
import { ModeBadge } from "../Badge.tsx"
import { movesThisPage, type WorkspaceTarget } from "./workspace-key.ts"

const QUICK_READS = 8

// "DIDL" plus an empty type table and no values: the arguments of a method
// that takes none.
const NO_ARGS_HEX = (() => {
  const encoded = encodeArgs([], [])
  return encoded.ok ? toHex(encoded.bytes) : ""
})()

/** Queries and composite queries without arguments: one click reads them. */
function quickReads(methods: readonly MethodInfo[]): MethodInfo[] {
  return methods
    .filter(
      (method) =>
        method.args.length === 0 &&
        method.results.length > 0 &&
        (method.mode === "query" || method.mode === "composite_query")
    )
    .slice(0, QUICK_READS)
}

/**
 * The workspace before a method is picked: how the page works, and the
 * canister's argument-free reads as links that run at once. Each link is a
 * shared-call URL, so opening it in a new tab renders its result on the
 * server; clicked here, the page stays where it is.
 */
export function MethodOverview({
  iface,
  onPick,
}: {
  iface: CanisterInterface
  /** Called as a quick read is picked in this page, before the page moves to it. */
  onPick?(target: WorkspaceTarget): void
}): ReactElement {
  const reads = quickReads(iface.methods)
  return (
    <div className="stack-lg">
      <section className="card" aria-labelledby="overview-title">
        <div className="card-body">
          <h2 id="overview-title" className="card-title">
            Pick a method
          </h2>
          <p className="text-sm muted">
            Each method gets a form built from its Candid types. Queries run as
            soon as you ask, signed in or not; updates and oneway calls need you
            signed in, and show the sender, the target and the exact argument
            bytes before they are sent. Every call you run or send lands in your{" "}
            <Link to="/history">history</Link> with a link to share it.
          </p>
        </div>
      </section>

      {reads.length > 0 && NO_ARGS_HEX !== "" && (
        <section className="section" aria-labelledby="quick-reads-title">
          <h2 id="quick-reads-title" className="section-title">
            Quick reads
          </h2>
          <ul className="list-plain grid method-quick-reads">
            {reads.map((method) => (
              <li key={method.name}>
                <Link
                  to="/canister/$canisterId"
                  params={{ canisterId: iface.canisterId }}
                  search={{ method: method.name, args: NO_ARGS_HEX, run: true }}
                  resetScroll={false}
                  onClick={(event) => {
                    if (movesThisPage(event))
                      onPick?.({ method: method.name, args: NO_ARGS_HEX })
                  }}
                  className="card card-interactive method-quick-read"
                >
                  <span className="mono truncate" title={method.name}>
                    {method.name}
                  </span>
                  <ModeBadge mode={method.mode} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
