import { isBoxedOpt, type AnyFieldSchema } from "@meantjs/schema"
import { Fragment, useState, type ReactElement } from "react"
import { groupDigits, type TokenUnits } from "../lib/format.ts"
import { isAmountName } from "./hints.ts"
import {
  BigValue,
  BlobValue,
  FuncRefValue,
  MismatchValue,
  PrincipalValue,
  TextValue,
} from "./leaves.tsx"
import {
  armOf,
  childPath,
  displayLabel,
  elementsOf,
  isBytes,
  isTagOnly,
  orderedFields,
  ownValue,
  resolve,
  type RecordNode,
  type TupleNode,
} from "./schema.ts"

/** What every node of one tree shares. */
export interface TreeContext {
  readonly units?: TokenUnits
  /**
   * Whether `units` applies to a bigint with no field name above it (the
   * whole value is an amount, as `icrc1_balance_of`'s reply is). Below a
   * field, the field's name decides (`isAmountName`).
   */
  readonly unitsAtRoot: boolean
  /** Show base units instead of token amounts. */
  readonly raw: boolean
  /** Replaces "Open as canister" links with this callback. */
  readonly onOpenCanister?: (id: string) => void
}

export interface ValueNodeProps {
  schema: AnyFieldSchema
  value: unknown
  ctx: TreeContext
  /** The value's path in the codec's grammar (`$.to.owner`). */
  path: string
  depth: number
  /** The record field (or table column) this value sits under. */
  fieldKey?: string
  /** Inside a table cell: shorter principals and blobs. */
  compact?: boolean
}

/** Vec items per page, in tables and lists alike. */
export const PAGE_SIZE = 25

// Values decode to at most 256 levels; past this many the tree stops and the
// Candid and JSON views (which have no such limit) take over.
const MAX_TREE_DEPTH = 32

const BIG = new Set(["nat", "int", "nat64", "int64"])

/**
 * Whether a tree of this schema can show a bigint in token units, by the same
 * rule `ValueNode` applies: so the "Raw amounts" switch appears only where it
 * changes something.
 */
export function showsAmounts(
  schema: AnyFieldSchema,
  unitsAtRoot: boolean
): boolean {
  // Visited (node, field name) pairs: a node under another name may differ.
  const seen = new WeakMap<object, Set<string>>()
  const walk = (
    s: AnyFieldSchema,
    key: string | typeof PAIR_KEY | undefined
  ): boolean => {
    const node = resolve(s)
    if (node.kind === "primitive") {
      if (!BIG.has(node.primitive)) return false
      // A pair's key is runtime text ("icrc1:fee"): it may name an amount.
      if (key === PAIR_KEY) return true
      return key === undefined ? unitsAtRoot : isAmountName(key)
    }
    const names = seen.get(node) ?? new Set<string>()
    const name =
      key === undefined ? "root" : key === PAIR_KEY ? "pair" : `field:${key}`
    if (names.has(name)) return false
    names.add(name)
    seen.set(node, names)
    switch (node.kind) {
      case "opt":
      case "vec": {
        const inner = resolve(node.inner)
        const pair = inner.kind === "tuple" ? textKeyedPair(inner) : undefined
        return pair !== undefined && node.kind === "vec"
          ? walk(pair, PAIR_KEY)
          : walk(node.inner, key)
      }
      case "record":
        return orderedFields(node).some(([field, f]) => walk(f, field))
      case "tuple":
        return elementsOf(node).some((element) => walk(element, key))
      case "variant":
        return Object.keys(node.arms).some((tag) => {
          const arm = armOf(node, tag)
          return arm !== undefined && walk(arm, key)
        })
      default:
        return false
    }
  }
  return walk(schema, undefined)
}

/** The key of a `(text, X)` pair's value: known only at run time. */
const PAIR_KEY = Symbol("pair key")

/** One value, rendered after its schema's resolved kind. */
export function ValueNode(props: ValueNodeProps): ReactElement {
  const { schema, value, ctx, path, depth, fieldKey, compact = false } = props
  if (depth > MAX_TREE_DEPTH) {
    return (
      <span className="muted">
        Nested too deep to show here; see the Candid view.
      </span>
    )
  }
  const node = resolve(schema)
  switch (node.kind) {
    case "primitive": {
      const p = node.primitive
      if (p === "null" || p === "reserved" || p === "empty") {
        return <span className="chip">{p}</span>
      }
      if (p === "bool") {
        return typeof value === "boolean" ? (
          <span className="mono value-bool">{String(value)}</span>
        ) : (
          <MismatchValue expected="bool" value={value} />
        )
      }
      if (p === "text") {
        return typeof value === "string" ? (
          <TextValue text={value} compact={compact} />
        ) : (
          <MismatchValue expected="text" value={value} />
        )
      }
      if (p === "principal") {
        return typeof value === "string" ? (
          <PrincipalValue
            text={value}
            compact={compact}
            onOpenCanister={ctx.onOpenCanister}
          />
        ) : (
          <MismatchValue expected="principal" value={value} />
        )
      }
      if (BIG.has(p)) {
        if (typeof value !== "bigint")
          return <MismatchValue expected={p} value={value} />
        const amount =
          fieldKey === undefined ? ctx.unitsAtRoot : isAmountName(fieldKey)
        return (
          <BigValue
            value={value}
            primitive={p}
            fieldKey={fieldKey}
            units={amount ? ctx.units : undefined}
            raw={ctx.raw}
          />
        )
      }
      // nat8..int32, float32, float64: JavaScript numbers.
      if (typeof value !== "number")
        return <MismatchValue expected={p} value={value} />
      return (
        <span className="mono tabular" title={p}>
          {p.startsWith("float") ? String(value) : groupDigits(value)}
        </span>
      )
    }
    case "blob":
      return isBytes(value) ? (
        <BlobValue bytes={value} compact={compact} />
      ) : (
        <MismatchValue expected="blob" value={value} />
      )
    case "unit":
      return <span className="chip">record {"{}"}</span>
    case "opt": {
      if (value === null) return <span className="chip value-none">none</span>
      if (isBoxedOpt(node)) {
        if (
          typeof value !== "object" ||
          value === null ||
          !Object.hasOwn(value, "some")
        ) {
          return <MismatchValue expected="boxed opt" value={value} />
        }
        return (
          <ValueNode
            {...props}
            schema={node.inner}
            value={ownValue(value, "some")}
            path={childPath(path, "some")}
            depth={depth + 1}
          />
        )
      }
      return <ValueNode {...props} schema={node.inner} depth={depth + 1} />
    }
    case "vec":
      return Array.isArray(value) ? (
        <VecValue {...props} item={node.inner} items={value} />
      ) : (
        <MismatchValue expected="vec" value={value} />
      )
    case "record": {
      if (typeof value !== "object" || value === null) {
        return <MismatchValue expected="record" value={value} />
      }
      return (
        <RecordValue
          node={node}
          value={value}
          ctx={ctx}
          path={path}
          depth={depth}
          compact={compact}
        />
      )
    }
    case "tuple": {
      const elements = elementsOf(node)
      if (!Array.isArray(value) || value.length !== elements.length) {
        return (
          <MismatchValue
            expected={`tuple of ${elements.length}`}
            value={value}
          />
        )
      }
      return (
        <dl className="kv kv-compact value-record">
          {elements.map((element, i) => (
            <Fragment key={i}>
              <dt className="mono">{i}</dt>
              <dd>
                <ValueNode
                  schema={element}
                  value={value[i]}
                  ctx={ctx}
                  path={childPath(path, i)}
                  depth={depth + 1}
                  fieldKey={fieldKey}
                  compact={compact}
                />
              </dd>
            </Fragment>
          ))}
        </dl>
      )
    }
    case "variant": {
      const tag =
        typeof value === "object" && value !== null
          ? ownValue(value, "tag")
          : undefined
      const arm = typeof tag === "string" ? armOf(node, tag) : undefined
      if (typeof tag !== "string" || arm === undefined) {
        return <MismatchValue expected="variant" value={value} />
      }
      return (
        <VariantValue
          tag={tag}
          arm={arm}
          value={value as object}
          ctx={ctx}
          path={path}
          depth={depth}
          fieldKey={fieldKey}
          compact={compact}
        />
      )
    }
    case "func": {
      const ref =
        typeof value === "object" && value !== null ? value : undefined
      const principal =
        ref === undefined ? undefined : ownValue(ref, "principal")
      const method = ref === undefined ? undefined : ownValue(ref, "method")
      if (typeof principal !== "string" || typeof method !== "string") {
        return <MismatchValue expected="func reference" value={value} />
      }
      return (
        <FuncRefValue principal={principal} method={method} mode={node.mode} />
      )
    }
    case "service":
      return typeof value === "string" ? (
        <PrincipalValue
          text={value}
          compact={compact}
          service
          onOpenCanister={ctx.onOpenCanister}
        />
      ) : (
        <MismatchValue expected="service reference" value={value} />
      )
  }
}

/** A tag badge, toned for Ok and Err. */
export function TagBadge({ tag }: { tag: string }): ReactElement {
  const tone =
    tag === "Ok" || tag === "ok"
      ? "badge-ok"
      : tag === "Err" || tag === "err"
        ? "badge-err"
        : "badge-accent"
  return <span className={`badge ${tone} value-tag`}>{displayLabel(tag)}</span>
}

function VariantValue({
  tag,
  arm,
  value,
  ctx,
  path,
  depth,
  fieldKey,
  compact,
}: {
  tag: string
  arm: AnyFieldSchema
  value: object
  ctx: TreeContext
  path: string
  depth: number
  fieldKey?: string
  compact: boolean
}): ReactElement {
  if (isTagOnly(arm)) return <TagBadge tag={tag} />
  if (!Object.hasOwn(value, "value")) {
    return <MismatchValue expected={`payload of ${tag}`} value={value} />
  }
  return (
    <span className="value-variant">
      <TagBadge tag={tag} />
      <span className="value-variant-payload">
        {/* The payload keeps the field name above the variant: the Nat of
            an ICRC metadata entry "icrc1:fee" is still a fee. */}
        <ValueNode
          schema={arm}
          value={ownValue(value, "value")}
          ctx={ctx}
          path={childPath(path, "value")}
          depth={depth + 1}
          fieldKey={fieldKey}
          compact={compact}
        />
      </span>
    </span>
  )
}

function RecordValue({
  node,
  value,
  ctx,
  path,
  depth,
  compact,
}: {
  node: RecordNode
  value: object
  ctx: TreeContext
  path: string
  depth: number
  compact: boolean
}): ReactElement {
  const fields = orderedFields(node)
  if (fields.length === 0) return <span className="chip">record {"{}"}</span>
  return (
    <dl className="kv kv-compact value-record">
      {fields.map(([key, field]) => {
        const fieldPath = childPath(path, key)
        return (
          <Fragment key={key}>
            <dt
              title={
                displayLabel(key) === key ? undefined : `unnamed field ${key}`
              }
            >
              {displayLabel(key)}
            </dt>
            <dd>
              {Object.hasOwn(value, key) ? (
                <ValueNode
                  schema={field}
                  value={ownValue(value, key)}
                  ctx={ctx}
                  path={fieldPath}
                  depth={depth + 1}
                  fieldKey={key}
                  compact={compact}
                />
              ) : (
                <span className="badge badge-warn">missing</span>
              )}
            </dd>
          </Fragment>
        )
      })}
    </dl>
  )
}

type VecValueProps = ValueNodeProps & {
  item: AnyFieldSchema
  items: readonly unknown[]
}

/**
 * A vec, paged at {@link PAGE_SIZE}: records as a table (one column per
 * field), `(text, X)` pairs as a key/value list (ICRC metadata), anything
 * else as a numbered list.
 */
function VecValue(props: VecValueProps): ReactElement {
  const { item, items, ctx, path, depth, fieldKey, compact = false } = props
  const [page, setPage] = useState(0)
  if (items.length === 0) return <span className="chip">empty vec</span>

  const pages = Math.ceil(items.length / PAGE_SIZE)
  const current = Math.min(page, pages - 1)
  const start = current * PAGE_SIZE
  const shown = items.slice(start, start + PAGE_SIZE)
  const itemNode = resolve(item)
  const pairKey =
    itemNode.kind === "tuple" ? textKeyedPair(itemNode) : undefined

  let body: ReactElement
  if (itemNode.kind === "record" && orderedFields(itemNode).length > 0) {
    body = (
      <RecordTable
        node={itemNode}
        rows={shown}
        start={start}
        ctx={ctx}
        path={path}
        depth={depth}
      />
    )
  } else if (pairKey !== undefined) {
    body = (
      <dl className="kv kv-compact value-record value-pairs">
        {shown.map((pair, i) => {
          const index = start + i
          if (
            !Array.isArray(pair) ||
            pair.length !== 2 ||
            typeof pair[0] !== "string"
          ) {
            return (
              <Fragment key={index}>
                <dt className="mono">{index}</dt>
                <dd>
                  <MismatchValue expected="(text, value) pair" value={pair} />
                </dd>
              </Fragment>
            )
          }
          const key: string = pair[0]
          return (
            <Fragment key={index}>
              <dt className="mono">
                <bdi>{key}</bdi>
              </dt>
              <dd>
                <ValueNode
                  schema={pairKey}
                  value={pair[1]}
                  ctx={ctx}
                  path={childPath(childPath(path, index), 1)}
                  depth={depth + 1}
                  fieldKey={key}
                  compact={compact}
                />
              </dd>
            </Fragment>
          )
        })}
      </dl>
    )
  } else {
    body = (
      <ol className="value-list">
        {shown.map((entry, i) => (
          <li key={start + i} className="value-entry">
            <span className="value-index mono subtle" aria-hidden="true">
              {start + i}
            </span>
            <ValueNode
              schema={item}
              value={entry}
              ctx={ctx}
              path={childPath(path, start + i)}
              depth={depth + 1}
              fieldKey={fieldKey}
              compact={compact}
            />
          </li>
        ))}
      </ol>
    )
  }

  return (
    <div className="value-vec">
      <span className="badge value-count">
        {groupDigits(items.length)} {items.length === 1 ? "item" : "items"}
      </span>
      {body}
      {pages > 1 ? (
        <Pager
          page={current}
          pages={pages}
          total={items.length}
          onPage={setPage}
        />
      ) : null}
    </div>
  )
}

/** The value schema of a `record { text; X }` pair, else `undefined`. */
function textKeyedPair(node: TupleNode): AnyFieldSchema | undefined {
  const elements = elementsOf(node)
  const [key, value] = elements
  if (elements.length !== 2 || key === undefined || value === undefined)
    return undefined
  const keyNode = resolve(key)
  return keyNode.kind === "primitive" && keyNode.primitive === "text"
    ? value
    : undefined
}

function RecordTable({
  node,
  rows,
  start,
  ctx,
  path,
  depth,
}: {
  node: RecordNode
  rows: readonly unknown[]
  start: number
  ctx: TreeContext
  path: string
  depth: number
}): ReactElement {
  const columns = orderedFields(node)
  return (
    <div className="table-wrap value-table-wrap">
      <table className="table table-compact value-table">
        <thead>
          <tr>
            <th scope="col" className="num">
              #
            </th>
            {columns.map(([key]) => (
              <th key={key} scope="col">
                {displayLabel(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const index = start + i
            const rowPath = childPath(path, index)
            return (
              <tr key={index}>
                <td className="num mono subtle">{index}</td>
                {typeof row === "object" && row !== null ? (
                  columns.map(([key, field]) => (
                    <td
                      key={key}
                      className={isNumeric(field) ? "num" : undefined}
                    >
                      {Object.hasOwn(row, key) ? (
                        <ValueNode
                          schema={field}
                          value={ownValue(row, key)}
                          ctx={ctx}
                          path={childPath(rowPath, key)}
                          depth={depth + 2}
                          fieldKey={key}
                          compact
                        />
                      ) : (
                        <span className="badge badge-warn">missing</span>
                      )}
                    </td>
                  ))
                ) : (
                  <td colSpan={columns.length}>
                    <MismatchValue expected="record" value={row} />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function isNumeric(schema: AnyFieldSchema): boolean {
  const node = resolve(schema)
  return node.kind === "primitive" && /^(nat|int|float)/.test(node.primitive)
}

function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number
  pages: number
  total: number
  onPage: (page: number) => void
}): ReactElement {
  const first = page * PAGE_SIZE + 1
  const last = Math.min(total, (page + 1) * PAGE_SIZE)
  return (
    <div
      className="value-pager"
      role="group"
      aria-label={`Pages of ${groupDigits(total)} items`}
    >
      <button
        type="button"
        className="btn btn-sm"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span className="muted text-xs tabular" aria-live="polite">
        {groupDigits(first)}–{groupDigits(last)} of {groupDigits(total)}
      </span>
      <button
        type="button"
        className="btn btn-sm"
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  )
}
