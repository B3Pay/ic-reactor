import { decodeArgs } from "@candid-core/schema/codec"
import { useMemo, type JSX } from "react"
import { ModeBadge } from "../components/Badge.tsx"
import { CopyButton } from "../components/CopyButton.tsx"
import type { MethodInfo } from "../interface/types.ts"
import { formatByteSize, groupDigits } from "../lib/format.ts"
import { toHex } from "../lib/hex.ts"
import { candidArgsText } from "./candid-text.ts"
import { useSha256 } from "./use-sha256.ts"

export interface CallPreviewProps {
  method: MethodInfo
  values: readonly unknown[]
  /** The exact encoded argument bytes. */
  bytes: Uint8Array
}

/**
 * What a call will send: its Candid text, size, SHA-256 and the hex bytes
 * (collapsible). The Candid text is printed from the bytes themselves,
 * decoded against the method's argument types, so it shows what is sent,
 * not what the form believes it holds.
 */
export function CallPreview({
  method,
  values,
  bytes,
}: CallPreviewProps): JSX.Element {
  const hex = useMemo(() => toHex(bytes), [bytes])
  const preview = useMemo(
    () => previewText(method, values, bytes),
    [method, values, bytes]
  )
  const sha256 = useSha256(bytes)
  const size = bytes.length

  return (
    <div className="call-preview stack-sm">
      <dl className="kv kv-compact">
        <dt>Method</dt>
        <dd className="row row-sm">
          <code className="mono break-all">{method.name}</code>
          <ModeBadge mode={method.mode} />
        </dd>
        <dt>Size</dt>
        <dd className="tabular">
          {groupDigits(size)} {size === 1 ? "byte" : "bytes"}
          {size >= 1024 ? ` (${formatByteSize(size)})` : null}
        </dd>
        <dt>SHA-256</dt>
        <dd className="row row-sm">
          {sha256 === undefined ? (
            <span className="subtle">computing…</span>
          ) : (
            <>
              <code className="mono break-all" data-testid="call-sha256">
                {sha256}
              </code>
              <CopyButton text={sha256} label="Copy the SHA-256" iconOnly />
            </>
          )}
        </dd>
      </dl>

      <div className="stack-xs">
        <div className="row row-between">
          <span className="text-sm muted">Arguments as Candid text</span>
          {preview.text === undefined ? null : (
            <CopyButton
              text={preview.text}
              a11yLabel="Copy the arguments as Candid text"
            />
          )}
        </div>
        {preview.warning === undefined ? null : (
          <div className="notice notice-warn" role="status">
            <p>{preview.warning}</p>
          </div>
        )}
        {preview.text === undefined ? null : (
          <pre
            className="code value-code"
            tabIndex={0}
            aria-label="Arguments as Candid text"
          >
            {preview.text}
          </pre>
        )}
      </div>

      <details className="disclosure call-preview-bytes">
        <summary>
          Argument bytes (hex, {groupDigits(size)}{" "}
          {size === 1 ? "byte" : "bytes"})
        </summary>
        <div className="disclosure-body">
          <code className="mono break-all call-preview-hex">{hex}</code>
          <div className="row row-end">
            <CopyButton text={hex} a11yLabel="Copy the argument bytes as hex" />
          </div>
        </div>
      </details>
    </div>
  )
}

interface PreviewText {
  readonly text?: string
  readonly warning?: string
}

function previewText(
  method: MethodInfo,
  values: readonly unknown[],
  bytes: Uint8Array
): PreviewText {
  const fromValues = attempt(() =>
    candidArgsText(method.args, values, { width: 80 })
  )
  const decoded = decodeArgs(method.args, bytes)
  if (!decoded.ok) {
    const issue = decoded.issues[0]
    return {
      text: fromValues,
      warning: `These bytes do not decode as ${method.name}'s arguments${issue === undefined ? "" : ` (${issue.path}: ${issue.message})`}. The text below is the form's values, not the bytes.`,
    }
  }
  const fromBytes = attempt(() =>
    candidArgsText(method.args, decoded.values, { width: 80 })
  )
  if (fromBytes === undefined) return { text: fromValues }
  if (fromValues !== undefined && fromValues !== fromBytes) {
    return {
      text: fromBytes,
      warning:
        "The form's values and the encoded bytes differ. The text below is decoded from the bytes, which are what will be sent.",
    }
  }
  return { text: fromBytes }
}

function attempt(compute: () => string): string | undefined {
  try {
    return compute()
  } catch {
    return undefined
  }
}
