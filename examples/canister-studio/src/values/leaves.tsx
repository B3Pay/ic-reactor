import type { MethodMode } from "@meantjs/schema"
import {
  defaultStringifySearch,
  Link,
  useRouter,
  type AnyRouter,
} from "@tanstack/react-router"
import { useMemo, useState, type MouseEvent, type ReactElement } from "react"
import {
  formatNanos,
  formatTokens,
  groupDigits,
  shortPrincipal,
  type TokenUnits,
} from "../lib/format.ts"
import { toHex } from "../lib/hex.ts"
import { isCanisterId } from "../lib/ids.ts"
import { ModeBadge } from "../components/Badge.tsx"
import { CopyButton } from "../components/CopyButton.tsx"
import { isNanosTimestamp } from "./hints.ts"
import { toDisplayJson } from "./json.ts"

// The leaf renderers of the value tree. Every string from a canister goes
// into the page as a text node (React escapes it); nothing here sets HTML.

export interface PrincipalValueProps {
  text: string
  /** Table cells show the short form; the full text is in the title. */
  compact?: boolean
  /** A service reference reads "service" before the principal. */
  service?: boolean
  /** Replaces the "Open as canister" link with a button calling this. */
  onOpenCanister?: (id: string) => void
}

/** Principal text, monospace, with copy and (for a canister id) an open link. */
export function PrincipalValue({
  text,
  compact = false,
  service = false,
  onOpenCanister,
}: PrincipalValueProps): ReactElement {
  const canister = isCanisterId(text)
  const openLabel = compact ? "Open" : "Open as canister"
  return (
    <span className="value-principal">
      {service ? <span className="subtle">service</span> : null}
      <code className="mono break-all" title={compact ? text : undefined}>
        {compact ? shortPrincipal(text) : text}
      </code>
      <CopyButton
        text={text}
        label={service ? "Copy service principal" : "Copy principal"}
        iconOnly
        className="value-copy"
      />
      {canister && onOpenCanister !== undefined ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label={`Open as canister: ${text}`}
          onClick={() => onOpenCanister(text)}
        >
          {openLabel}
        </button>
      ) : null}
      {canister && onOpenCanister === undefined ? (
        <Link
          to="/canister/$canisterId"
          params={{ canisterId: text }}
          className="value-open"
          aria-label={`Open as canister: ${text}`}
        >
          {openLabel}
        </Link>
      ) : null}
    </span>
  )
}

export interface BigValueProps {
  value: bigint
  primitive: string
  /** The field this number sits under, for the timestamp hint. */
  fieldKey?: string
  /** Set when this number is a token amount in these units. */
  units?: TokenUnits
  /** Show base units even when `units` is set. */
  raw: boolean
}

/** A nat/int (any width held as a bigint): grouped, in token units when hinted. */
export function BigValue({
  value,
  primitive,
  fieldKey,
  units,
  raw,
}: BigValueProps): ReactElement {
  const grouped = groupDigits(value)
  const tokens =
    units !== undefined && !raw ? tokenText(value, units) : undefined
  const time =
    fieldKey !== undefined && isNanosTimestamp(fieldKey, value)
      ? formatNanos(value)
      : undefined
  return (
    <span className="value-number">
      {tokens === undefined ? (
        <span className="mono tabular" title={primitive}>
          {grouped}
        </span>
      ) : (
        <span
          className="mono tabular value-amount"
          title={`${grouped} base units (${primitive})`}
        >
          {tokens}
        </span>
      )}
      {time === undefined ? null : (
        <span className="value-time subtle">{time}</span>
      )}
    </span>
  )
}

function tokenText(value: bigint, units: TokenUnits): string | undefined {
  try {
    return formatTokens(value, units.decimals, units.symbol)
  } catch {
    // Decimals outside 0-255 (a hint from a misbehaving ledger): show raw.
    return undefined
  }
}

const LONG_TEXT = 160

/** Text from a canister: as text, isolated for bidi, long text in a block. */
export function TextValue({
  text,
  compact = false,
}: {
  text: string
  compact?: boolean
}): ReactElement {
  if (text === "") return <span className="chip">empty text</span>
  const long = text.length > LONG_TEXT || text.includes("\n")
  if (long && !compact) {
    return (
      <pre className="code code-wrap value-text-block">
        <bdi>{text}</bdi>
      </pre>
    )
  }
  return (
    <span className="value-text" title={long ? text : undefined}>
      <bdi>{long ? `${text.slice(0, LONG_TEXT)}…` : text}</bdi>
    </span>
  )
}

const BLOB_PREVIEW_BYTES = 64
const COMPACT_BLOB_BYTES = 8
// Past this size a blob is data (a module, a certificate), not text.
const UTF8_PREVIEW_MAX_BYTES = 4096

/** A blob: length, hex (first 64 bytes, all on request), UTF-8 when printable. */
export function BlobValue({
  bytes,
  compact = false,
}: {
  bytes: Uint8Array
  compact?: boolean
}): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const limit = compact ? COMPACT_BLOB_BYTES : BLOB_PREVIEW_BYTES
  const cut = !expanded && bytes.length > limit
  const hex = useMemo(
    () => toHex(cut ? bytes.subarray(0, limit) : bytes),
    [bytes, cut, limit]
  )
  const text = useMemo(
    () =>
      compact || bytes.length > UTF8_PREVIEW_MAX_BYTES
        ? undefined
        : utf8Preview(bytes),
    [bytes, compact]
  )
  const zero = useMemo(() => bytes.every((b) => b === 0), [bytes])
  if (bytes.length === 0) return <span className="chip">empty blob</span>
  return (
    <span className="value-blob">
      <span className="badge">
        {bytes.length} {bytes.length === 1 ? "byte" : "bytes"}
      </span>
      {zero ? <span className="chip">all zero</span> : null}
      <code className="mono break-all value-hex">
        {hex}
        {cut ? "…" : null}
      </code>
      {cut && !compact ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setExpanded(true)}
        >
          Show all {bytes.length} bytes
        </button>
      ) : null}
      <CopyButton
        text={() => toHex(bytes)}
        label="Copy the bytes as hex"
        iconOnly
        className="value-copy"
      />
      {text === undefined ? null : (
        <span className="value-utf8 muted">
          UTF-8: <bdi className="value-text">{text}</bdi>
        </span>
      )}
    </span>
  )
}

/**
 * The bytes as text when they are valid UTF-8 with nothing but printable
 * characters (tab and newlines allowed), else `undefined`.
 */
export function utf8Preview(bytes: Uint8Array): string | undefined {
  let text: string
  try {
    // ignoreBOM: a leading EF BB BF is part of the bytes, kept in the text
    // (U+FEFF), as the form's text mode keeps it.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes
    )
  } catch {
    return undefined
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text)) {
    return undefined
  }
  return text.length > LONG_TEXT ? `${text.slice(0, LONG_TEXT)}…` : text
}

/**
 * A func reference: `func "<principal>".<method>`, with a link that opens
 * that method on that canister. The link carries a search param, so it is a
 * built href navigated through the router (the method page's search schema
 * belongs to the routes, not to this viewer).
 */
export function FuncRefValue({
  principal,
  method,
  mode,
}: {
  principal: string
  method: string
  mode: MethodMode
}): ReactElement {
  // Optional: the viewer also renders outside a router (tests, previews).
  const router: AnyRouter | undefined = useRouter({ warn: false })
  const canister = isCanisterId(principal)
  const href = `/canister/${encodeURIComponent(principal)}${defaultStringifySearch({ method })}`

  function open(event: MouseEvent<HTMLAnchorElement>): void {
    if (router === undefined || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void router.navigate({ href })
  }

  return (
    <span className="value-func">
      <span className="subtle">func</span>
      <code className="mono break-all">
        {principal}.<bdi>{method}</bdi>
      </code>
      <ModeBadge mode={mode} />
      {canister ? (
        <a
          className="value-open"
          href={href}
          onClick={open}
          aria-label={`Open method: ${method} on ${principal}`}
        >
          Open method
        </a>
      ) : null}
    </span>
  )
}

/** A value that does not have its schema's shape: said plainly, with its JSON. */
export function MismatchValue({
  expected,
  value,
}: {
  expected: string
  value: unknown
}): ReactElement {
  return (
    <span className="value-mismatch">
      <span className="badge badge-warn">expected {expected}</span>
      <code className="mono break-all">{toDisplayJson(value)}</code>
    </span>
  )
}
