import { useAuth } from "@ic-reactor/react"
import { useMemo, useState, type ReactElement } from "react"
import { MethodRunner } from "../../calls/MethodRunner.tsx"
import { MethodForm } from "../../forms/MethodForm.tsx"
import { heuristicHints } from "../../forms/hints.ts"
import type { CanisterInterface, MethodInfo } from "../../interface/types.ts"
import { CallPreview } from "../../values/CallPreview.tsx"
import { ModeBadge } from "../Badge.tsx"
import { EmptyState } from "../EmptyState.tsx"
import { MethodPicker } from "./MethodPicker.tsx"

interface Encoded {
  method: string
  values: unknown[]
  bytes: Uint8Array
}

/**
 * A form per method of the pasted interface. Without a target canister the
 * form only encodes (the exact Candid message, its text and hash); with one,
 * the method runs against mainnet through the same runner the canister pages
 * use.
 */
export function PlaygroundForms({
  iface,
  target,
}: {
  iface: CanisterInterface
  /** A valid canister id, or nothing (encode only). */
  target: string | undefined
}): ReactElement {
  const auth = useAuth()
  const [selected, setSelected] = useState<string | undefined>(
    iface.methods[0]?.name
  )
  const [encoded, setEncoded] = useState<Encoded | undefined>(undefined)
  const hints = useMemo(() => heuristicHints(), [])
  const method: MethodInfo | undefined =
    selected === undefined ? undefined : iface.method(selected)

  if (iface.methods.length === 0) {
    return (
      <EmptyState title="No methods">
        <p>The interface declares a service without methods.</p>
      </EmptyState>
    )
  }

  return (
    <div className="layout-sidebar pg-forms">
      <aside className="sidebar">
        <MethodPicker
          methods={iface.methods}
          selected={method?.name}
          onSelect={(name) => {
            setSelected(name)
            setEncoded(undefined)
          }}
        />
      </aside>
      <div className="content stack-lg">
        {method === undefined ? (
          <p className="muted">Pick a method.</p>
        ) : (
          <>
            <header className="method-heading">
              <div className="row">
                <h3 className="method-heading-name mono break-all">
                  {method.name}
                </h3>
                <ModeBadge mode={method.mode} size="lg" />
              </div>
              {method.doc !== undefined && method.doc !== "" && (
                <p className="method-heading-doc text-sm muted">{method.doc}</p>
              )}
            </header>
            {target === undefined ? (
              <>
                <MethodForm
                  key={method.name}
                  method={method}
                  hints={hints}
                  submitLabel="Encode"
                  callerPrincipal={
                    auth.status === "signed-in" ? auth.principal : undefined
                  }
                  onSubmit={({ values, bytes }) =>
                    setEncoded({ method: method.name, values, bytes })
                  }
                />
                {encoded !== undefined && encoded.method === method.name && (
                  <CallPreview
                    method={method}
                    values={encoded.values}
                    bytes={encoded.bytes}
                  />
                )}
              </>
            ) : (
              <MethodRunner
                key={`${target}\u0000${method.name}`}
                iface={iface}
                method={method}
                hints={hints}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
