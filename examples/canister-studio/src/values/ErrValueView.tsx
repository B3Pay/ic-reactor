import type { JSX } from "react"
import type { MethodInfo } from "../interface/types.ts"
import type { TokenUnits } from "../lib/format.ts"
import { candidArgsText } from "./candid-text.ts"
import { ValueInspector } from "./Inspector.tsx"
import { toDisplayJson } from "./json.ts"
import { isTagOnly, replySchemas } from "./schema.ts"
import { showsAmounts, TagBadge, ValueNode } from "./tree.tsx"

export interface ErrValueViewProps {
  method: MethodInfo
  /** A `canister_err` ReactorError's `err` payload. */
  err: unknown
  /** A ledger's units, for amounts in the payload (`InsufficientFunds`). */
  units?: TokenUnits
}

/**
 * A `canister_err` payload, viewed with the Err arm's schema: the canister
 * answered, and its answer was the Err arm of the method's result.
 */
export function ErrValueView({
  method,
  err,
  units,
}: ErrValueViewProps): JSX.Element {
  const shape = replySchemas(method)
  if (shape.kind !== "result") {
    // canister_err comes only from an Ok/Err result; anything else is shown
    // as it arrived.
    return (
      <div className="stack-xs">
        <p className="subtle text-xs">
          <code className="mono">{method.name}</code> has no Err result arm; the
          payload as JSON:
        </p>
        <pre className="code value-code">{toDisplayJson(err)}</pre>
      </div>
    )
  }
  const bare = isTagOnly(shape.err)
  const sent = bare ? { tag: shape.errTag } : { tag: shape.errTag, value: err }
  return (
    <ValueInspector
      label="Err payload"
      hasUnits={units !== undefined && showsAmounts(shape.err, false)}
      candidNote={`The reply message: the canister answered ${shape.errTag}.`}
      renderTree={(raw) => (
        <div className="value-result">
          <TagBadge tag={shape.errTag} />
          {bare ? null : (
            <ValueNode
              schema={shape.err}
              value={err}
              ctx={{ units, unitsAtRoot: false, raw }}
              path="$"
              depth={0}
            />
          )}
        </div>
      )}
      candid={() => candidArgsText(method.results, [sent], { width: 80 })}
      json={() => toDisplayJson(err)}
    />
  )
}
