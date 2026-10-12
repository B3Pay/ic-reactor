import type { ReactElement } from "react"
import type { InterfaceSource } from "../interface/types.ts"
import { Badge } from "./Badge.tsx"
import { provenanceText } from "./provenance.ts"

/**
 * Where an interface came from: Typed, Certified metadata, or an
 * UNCERTIFIED fallback (labelled loudly, never hidden).
 */
export function ProvenanceBadge({
  source,
  size = "lg",
}: {
  source: InterfaceSource
  size?: "md" | "lg"
}): ReactElement {
  const title = provenanceText(source)
  switch (source.kind) {
    case "typed":
      return (
        <Badge tone="accent" size={size} title={title} dot>
          Typed
        </Badge>
      )
    case "metadata":
      return (
        <Badge tone="certified" size={size} title={title} dot>
          Certified metadata
        </Badge>
      )
    case "tmp_hack":
      return (
        <Badge tone="err" size={size} title={title} dot>
          UNCERTIFIED
        </Badge>
      )
    case "pasted":
      return (
        <Badge tone="warn" size={size} title={title} dot>
          Pasted .did
        </Badge>
      )
  }
}
