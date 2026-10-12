import { Link } from "@tanstack/react-router"
import { useMemo, type ReactElement } from "react"
import { MethodRunner } from "../../calls/MethodRunner.tsx"
import { heuristicHints } from "../../forms/hints.ts"
import type { CanisterInterface, MethodInfo } from "../../interface/types.ts"
import { Badge, ModeBadge } from "../Badge.tsx"
import { EmptyState } from "../EmptyState.tsx"
import { Notice } from "../Notice.tsx"
import { decodeSharedArgs, isReadMode } from "./shared-call.ts"
import { registryUnits } from "./use-canister-page.ts"

export interface MethodWorkspaceProps {
  iface: CanisterInterface
  /** The `?method=` text, even when no such method exists. */
  methodName: string
  method: MethodInfo | undefined
  /** A shared link's argument bytes (hex). */
  argsHex?: string
  /** A shared link asks to read at once. */
  run: boolean
  certified: boolean
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
  const isRead = isReadMode(method.mode)
  const idempotent =
    iface.registry?.idempotentUpdates?.includes(method.name) === true
  // Shared links run reads only: a write always waits for its sender.
  const autoRun =
    run &&
    isRead &&
    initialValues !== undefined &&
    !(certified && method.mode === "composite_query")

  return (
    <div className="stack-lg">
      <header className="method-heading">
        <div className="row">
          <h2 className="method-heading-name mono break-all">{method.name}</h2>
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
      {shared?.ok === true && run && !isRead && (
        <Notice tone="info" title="Opened from a shared link">
          <p>
            The form holds the link’s arguments. Shared links never send a
            write: review it, then send it yourself.
          </p>
        </Notice>
      )}
      {shared?.ok === true && autoRun && (
        <p className="text-xs muted" role="note">
          Opened from a shared link: read at once with the link’s arguments.{" "}
          <Link
            to="/canister/$canisterId"
            params={{ canisterId: iface.canisterId }}
            search={{ method: method.name }}
          >
            Start from an empty form
          </Link>
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
