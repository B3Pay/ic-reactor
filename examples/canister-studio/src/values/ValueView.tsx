// STUB (FOUNDATION): the props are the contract; B2 implements the viewer.
import type { AnyFieldSchema } from "@candid-core/schema"
import type { JSX } from "react"
import type { TokenUnits } from "../lib/format.ts"

export interface ValueViewProps {
  schema: AnyFieldSchema
  value: unknown
  units?: TokenUnits
  /** The value's path, for keys and labels (codec grammar). */
  path?: string
  depth?: number
}

/** Any Candid value, viewed with its schema. */
export function ValueView(props: ValueViewProps): JSX.Element {
  void props
  return <span className="muted">(value viewer not implemented yet)</span>
}
