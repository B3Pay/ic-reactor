import type { ReactElement } from "react"
import type { CanisterInterface } from "../../interface/types.ts"
import { Code } from "../Code.tsx"
import { safeFileName } from "../download.ts"

/** The canister's Candid, as the studio read it (server-rendered). */
export function CandidTab({
  iface,
  did,
}: {
  iface: CanisterInterface
  did: string
}): ReactElement {
  const source = iface.source
  return (
    <div className="stack">
      <p className="text-sm muted">
        {source.kind === "typed"
          ? "The committed .did this canister’s typed module was generated from."
          : source.kind === "metadata"
            ? "The canister’s candid:service metadata, exactly as the certified read returned it."
            : source.kind === "tmp_hack"
              ? "What the canister’s __get_candid_interface_tmp_hack query answered. Not certified."
              : "The pasted .did."}
      </p>
      <Code
        text={did}
        label="candid"
        showSize
        download={{
          filename: `${safeFileName(iface.registry?.slug ?? iface.name)}.did`,
        }}
        maxHeight="70vh"
        ariaLabel={`Candid interface of ${iface.name}`}
      />
    </div>
  )
}
