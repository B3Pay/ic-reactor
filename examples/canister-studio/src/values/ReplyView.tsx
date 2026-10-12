import { Fragment, type JSX } from "react"
import type { MethodInfo } from "../interface/types.ts"
import type { TokenUnits } from "../lib/format.ts"
import { candidArgsText } from "./candid-text.ts"
import { isAmountMethod } from "./hints.ts"
import { ValueInspector } from "./Inspector.tsx"
import { toDisplayJson } from "./json.ts"
import { MismatchValue } from "./leaves.tsx"
import { isTagOnly, replySchemas } from "./schema.ts"
import { showsAmounts, TagBadge, ValueNode, type TreeContext } from "./tree.tsx"

export { ErrValueView, type ErrValueViewProps } from "./ErrValueView.tsx"

export interface ReplyViewProps {
  method: MethodInfo
  /**
   * What the call resolved with: `undefined` for no results, the value for
   * one, the Ok payload when the one result is an Ok/Err variant, the tuple
   * for several.
   */
  reply: unknown
  /** A ledger's units, for the amounts in the reply. */
  units?: TokenUnits
  /** Replaces the "Open as canister" links with this callback. */
  onOpenCanister?(id: string): void
}

const WIDTH = 80

/**
 * A method's reply, viewed with its result schemas as a Tree, as Candid text
 * (the reply message the canister sent, Ok/Err variant included) or as JSON
 * (what the call resolved with).
 */
export function ReplyView({
  method,
  reply,
  units,
  onOpenCanister,
}: ReplyViewProps): JSX.Element {
  const shape = replySchemas(method)
  if (shape.kind === "none") {
    return (
      <p className="value-empty muted">
        No reply value: <code className="mono">{method.name}</code> returns
        nothing.
      </p>
    )
  }

  const unitsAtRoot = isAmountMethod(method.name)
  const tree = (raw: boolean): TreeContext => ({
    units,
    unitsAtRoot,
    raw,
    onOpenCanister,
  })
  const json = (): string => toDisplayJson(reply)
  const label = "reply"
  const schemas =
    shape.kind === "one"
      ? [shape.schema]
      : shape.kind === "result"
        ? [shape.ok]
        : shape.schemas
  const hasUnits =
    units !== undefined &&
    schemas.some((schema) => showsAmounts(schema, unitsAtRoot))

  switch (shape.kind) {
    case "one":
      return (
        <ValueInspector
          label={label}
          hasUnits={hasUnits}
          renderTree={(raw) => (
            <ValueNode
              schema={shape.schema}
              value={reply}
              ctx={tree(raw)}
              path="$"
              depth={0}
            />
          )}
          candid={() =>
            candidArgsText(method.results, [reply], { width: WIDTH })
          }
          json={json}
        />
      )
    case "result": {
      const bare = isTagOnly(shape.ok)
      // The call resolved with the Ok payload; the canister sent the variant.
      const sent = bare
        ? { tag: shape.okTag }
        : { tag: shape.okTag, value: reply }
      return (
        <ValueInspector
          label={label}
          hasUnits={hasUnits}
          candidNote={`The reply message: the call resolved with the ${shape.okTag} payload.`}
          renderTree={(raw) => (
            <div className="value-result">
              <TagBadge tag={shape.okTag} />
              {bare ? null : (
                <ValueNode
                  schema={shape.ok}
                  value={reply}
                  ctx={tree(raw)}
                  path="$"
                  depth={0}
                />
              )}
            </div>
          )}
          candid={() =>
            candidArgsText(method.results, [sent], { width: WIDTH })
          }
          json={json}
        />
      )
    }
    case "many":
      return (
        <ValueInspector
          label={label}
          hasUnits={hasUnits}
          renderTree={(raw) =>
            Array.isArray(reply) && reply.length === shape.schemas.length ? (
              <dl className="kv kv-compact value-record">
                {shape.schemas.map((schema, i) => (
                  <Fragment key={i}>
                    <dt>Result {i}</dt>
                    <dd>
                      <ValueNode
                        schema={schema}
                        value={reply[i]}
                        ctx={tree(raw)}
                        path={`$[${i}]`}
                        depth={0}
                      />
                    </dd>
                  </Fragment>
                ))}
              </dl>
            ) : (
              <MismatchValue
                expected={`tuple of ${shape.schemas.length}`}
                value={reply}
              />
            )
          }
          candid={() => {
            if (!Array.isArray(reply))
              throw new TypeError(
                `$: expected ${shape.schemas.length} results, got ${toDisplayJson(reply)}`
              )
            return candidArgsText(shape.schemas, reply, { width: WIDTH })
          }}
          json={json}
        />
      )
  }
}
