import type { AnyFieldSchema } from "@candid-core/schema"
import type { JSX } from "react"
import type { TokenUnits } from "../lib/format.ts"
import { ValueNode } from "./tree.tsx"

export interface ValueViewProps {
  schema: AnyFieldSchema
  value: unknown
  /**
   * Token units for amounts: the value itself when it is a bare number, and
   * fields named like amounts below it (`amount`, `fee`, `balance`, `e8s`).
   */
  units?: TokenUnits
  /** The value's path, for keys and labels (codec grammar); `$` by default. */
  path?: string
  depth?: number
  /** Replaces the "Open as canister" links with this callback. */
  onOpenCanister?(id: string): void
}

/**
 * Any Candid value, viewed with its schema: numbers grouped (amounts in
 * units), principals with copy and an open link, blobs as hex, opt `null` as
 * "none", variants as a tag badge, records as key/value lists, vecs of
 * records as tables paged at 25.
 */
export function ValueView({
  schema,
  value,
  units,
  path = "$",
  depth = 0,
  onOpenCanister,
}: ValueViewProps): JSX.Element {
  return (
    <div className="value-view">
      <ValueNode
        schema={schema}
        value={value}
        ctx={{ units, unitsAtRoot: true, raw: false, onOpenCanister }}
        path={path}
        depth={depth}
      />
    </div>
  )
}
