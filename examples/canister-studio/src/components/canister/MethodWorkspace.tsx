import { Link } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, type ReactElement } from "react"
import { callKindOf, type CallKind } from "../../calls/kinds.ts"
import { MethodRunner } from "../../calls/MethodRunner.tsx"
import { heuristicHints } from "../../forms/hints.ts"
import type { CanisterInterface, MethodInfo } from "../../interface/types.ts"
import { Badge, ModeBadge } from "../Badge.tsx"
import { EmptyState } from "../EmptyState.tsx"
import { Notice } from "../Notice.tsx"
import { decodeSharedArgs, readsAtOnce } from "./shared-call.ts"
import { registryUnits } from "./use-canister-page.ts"

export interface MethodWorkspaceProps {
  iface: CanisterInterface
  /** The `?method=` text, even when no such method exists. */
  methodName: string
  method: MethodInfo | undefined
  /** A link's argument bytes (hex): shared, a quick read, a replay. */
  argsHex?: string
  /** The link asks to read at once. */
  run: boolean
  certified: boolean
  /**
   * Asked once, as the workspace mounts: whether the reader just picked this
   * method on the page. If so and its heading is out of view or low on the
   * screen (on a phone the list sits above the workspace), the workspace
   * scrolls the heading up and moves focus there.
   */
  wasPicked?(): boolean
}

/** Room left above a heading scrolled to, below the sticky header. */
const HEADING_GAP_PX = 16

/** Why a link that asks to run a method only fills its form. */
const NOT_RUN: Readonly<Record<CallKind["kind"], string>> = {
  read: "A composite query has no certified path, so it is not read at once from a certified link: the form holds the link’s arguments.",
  idempotent:
    "The form holds the link’s arguments. An idempotent update still goes through consensus as you: links never send one, so send it yourself.",
  update:
    "The form holds the link’s arguments. Links never send a write: review it, then send it yourself.",
  oneway:
    "The form holds the link’s arguments. Links never send a write: review it, then send it yourself.",
  call: "The form holds the link’s arguments. A query without results is called, not read at once: press Call to send it.",
}

/**
 * The selected method: its heading and docs, what a shared link brought
 * (arguments decoded from the link, or why they could not be), and the
 * runner with its form, call, reply and errors.
 */
export function MethodWorkspace({
  iface,
  methodName,
  method,
  argsHex,
  run,
  certified,
  wasPicked,
}: MethodWorkspaceProps): ReactElement {
  const units = useMemo(() => registryUnits(iface.registry), [iface.registry])
  const hints = useMemo(
    () => heuristicHints(units === undefined ? undefined : { units }),
    [units]
  )
  // Decoded on both sides from the same bytes, so the server's prefetch and
  // the runner build the same arguments, and the same query key. Memoized:
  // the runner gets the same initial values on every render.
  const shared = useMemo(
    () =>
      method === undefined || argsHex === undefined
        ? undefined
        : decodeSharedArgs(method, argsHex),
    [method, argsHex]
  )

  const heading = useRef<HTMLHeadingElement>(null)
  // Once per mount, on purpose: the page keys the workspace by method.
  useEffect(() => {
    const picked = wasPicked?.() === true
    const element = heading.current
    if (!picked || element === null) return
    // Measured, not assumed: the sticky header wraps to two rows on a phone.
    const header =
      document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0
    // Left alone in the upper half of the screen, where the form below it
    // shows too; moved up from anywhere else, out of view included.
    const { top } = element.getBoundingClientRect()
    if (top >= header && top <= window.innerHeight / 2) return
    window.scrollTo({ top: window.scrollY + top - header - HEADING_GAP_PX })
    element.focus({ preventScroll: true })
  }, [])

  if (method === undefined) {
    return (
      <EmptyState title="No such method">
        <p>
          This canister has no method named{" "}
          <code className="code-inline break-all">{methodName}</code>.
        </p>
        <p>Pick one from the list.</p>
      </EmptyState>
    )
  }

  const initialValues = shared?.ok === true ? shared.values : undefined
  const kind = callKindOf(iface, method)
  const idempotent = kind.kind === "idempotent"
  // The same rule as the route's loader, so the runner reads at once exactly
  // what the server prefetched: a write always waits for its sender.
  const autoRun =
    run && initialValues !== undefined && readsAtOnce(kind, certified)

  return (
    <div className="stack-lg">
      <header className="method-heading">
        <div className="row">
          <h2
            ref={heading}
            className="method-heading-name mono break-all"
            tabIndex={-1}
          >
            {method.name}
          </h2>
          <ModeBadge mode={method.mode} size="lg" />
          {idempotent && (
            <Badge
              tone="info"
              size="lg"
              title="The registry marks this update as idempotent: it is offered as a read through { update: 'idempotent' }, and still needs you signed in."
            >
              idempotent
            </Badge>
          )}
        </div>
        {method.doc !== undefined && method.doc !== "" && (
          <p className="method-heading-doc text-sm muted">{method.doc}</p>
        )}
      </header>

      {shared !== undefined && !shared.ok && (
        <Notice tone="warn" title="The shared arguments were not used">
          <p className="break-all">{shared.message}</p>
          <p>The form starts from its defaults instead.</p>
        </Notice>
      )}
      {shared?.ok === true && run && !autoRun && (
        <Notice tone="info" title="Not run from the link">
          <p>{NOT_RUN[kind.kind]}</p>
        </Notice>
      )}
      {/* The same link comes from a shared URL, a quick read or a replay, so
          it says what happened, not where it came from. */}
      {shared?.ok === true && autoRun && (
        <p className="text-xs muted" role="note">
          {method.args.length === 0 ? (
            "Read at once: it takes no arguments."
          ) : (
            <>
              Read at once with the link’s arguments.{" "}
              <Link
                to="/canister/$canisterId"
                params={{ canisterId: iface.canisterId }}
                search={{
                  method: method.name,
                  certified: certified ? true : undefined,
                }}
              >
                Start from an empty form
              </Link>
            </>
          )}
        </p>
      )}

      <MethodRunner
        iface={iface}
        method={method}
        initialValues={initialValues}
        autoRun={autoRun}
        certified={certified}
        hints={hints}
        units={units}
      />
    </div>
  )
}
