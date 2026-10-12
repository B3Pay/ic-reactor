import { Link } from "@tanstack/react-router"
import type { ReactElement } from "react"
import type { CanisterInterface, InterfacePayload } from "../interface/types.ts"
import { formatNanos, groupDigits } from "../lib/format.ts"
import { ModeBadge } from "./Badge.tsx"
import { canisterDisplayName } from "./canister-names.ts"
import { CopyButton } from "./CopyButton.tsx"
import { Disclosure } from "./Disclosure.tsx"
import { modeCounts } from "./modes.ts"
import { Notice } from "./Notice.tsx"
import { provenanceShort, provenanceText } from "./provenance.ts"
import { ProvenanceBadge } from "./ProvenanceBadge.tsx"

type OkPayload = Extract<InterfacePayload, { ok: true }>

export interface CanisterHeaderProps {
  canisterId: string
  /** Present once the interface loaded; absent for a failed load. */
  payload?: OkPayload
  iface?: CanisterInterface
}

/** Hex shortened to its first and last characters: "a1b2c3d4…9f8e". */
function shortHex(hex: string): string {
  return hex.length <= 20 ? hex : `${hex.slice(0, 10)}…${hex.slice(-8)}`
}

/**
 * The top of every canister page: name, id, where the interface came from
 * and how far to trust it, the module hash, the methods by mode, what the
 * schema loader left out, and the page tabs.
 */
export function CanisterHeader({
  canisterId,
  payload,
  iface,
}: CanisterHeaderProps): ReactElement {
  const name = iface?.name ?? canisterDisplayName(canisterId)
  const source = payload?.source
  const moduleHash =
    source !== undefined && "moduleHash" in source ? source.moduleHash : null
  const description = iface?.registry?.description

  return (
    <header className="canister-header">
      <div className="canister-header-top">
        <div className="stack-sm grow">
          <div className="row">
            <h1 className="page-title canister-title">{name}</h1>
            {source !== undefined && <ProvenanceBadge source={source} />}
          </div>
          <div className="row-sm canister-id">
            <span className="sr-only">Canister id: </span>
            <code className="mono break-all">{canisterId}</code>
            <CopyButton text={canisterId} label="Copy canister id" iconOnly />
            <a
              className="text-xs"
              href={`https://dashboard.internetcomputer.org/canister/${canisterId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              IC dashboard
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
          {description !== undefined && (
            <p className="page-subtitle">{description}</p>
          )}
        </div>
        {iface !== undefined && (
          <ul
            className="list-plain row-sm canister-mode-counts"
            aria-label="Methods by mode"
          >
            {modeCounts(iface.methods).map(({ mode, count }) => (
              <li key={mode} className="row-sm row-nowrap">
                <span className="tabular canister-mode-count">
                  {groupDigits(count)}
                </span>
                <ModeBadge mode={mode} />
                <span className="sr-only">
                  {count === 1 ? " method" : " methods"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {source?.kind === "tmp_hack" && (
        <Notice tone="danger" title="UNCERTIFIED interface" role="none">
          <p>{provenanceText(source)}</p>
          <p>
            Forms and reply viewers below follow this text. Treat every reply as
            unverified until the canister publishes certified metadata.
          </p>
        </Notice>
      )}

      {payload !== undefined && (
        <dl className="kv kv-compact canister-facts">
          <dt>Source</dt>
          <dd>{source === undefined ? "" : provenanceShort(source)}</dd>
          <dt>Module hash</dt>
          <dd className="row-sm">
            {moduleHash === null ? (
              <span className="muted">
                {source?.kind === "typed"
                  ? "Not read: the interface is the committed .did"
                  : "Not available"}
              </span>
            ) : (
              <>
                <code className="mono" title={moduleHash}>
                  {shortHex(moduleHash)}
                </code>
                <CopyButton
                  text={moduleHash}
                  label="Copy module hash"
                  iconOnly
                />
              </>
            )}
          </dd>
          <dt>Interface SHA-256</dt>
          <dd className="row-sm">
            <code className="mono" title={payload.didSha256}>
              {shortHex(payload.didSha256)}
            </code>
            <CopyButton
              text={payload.didSha256}
              label="Copy interface hash"
              iconOnly
            />
          </dd>
          {payload.cache !== "typed" && (
            <>
              <dt>Read</dt>
              <dd className="tabular">
                {formatNanos(
                  BigInt(Math.trunc(payload.fetchedAt)) * 1_000_000n
                )}
                <span className="muted">
                  {payload.cache === "hit"
                    ? " (from the server's cache)"
                    : " (fresh)"}
                </span>
              </dd>
            </>
          )}
        </dl>
      )}

      {iface !== undefined && iface.omitted.length > 0 && (
        <Disclosure
          summary="Left out of the forms"
          meta={`${groupDigits(iface.omitted.length)} ${iface.omitted.length === 1 ? "entry" : "entries"}`}
        >
          <p className="text-sm muted">
            The schema loader could not represent these declarations or methods,
            so the studio offers no form for them.
          </p>
          <ul className="list-plain stack-xs text-sm">
            {iface.omitted.map((entry) => (
              <li key={`${entry.kind}:${entry.name}`} className="row-sm">
                <span className="badge">{entry.kind}</span>
                <code className="mono break-all">{entry.name}</code>
                <span className="muted">
                  {entry.reason}
                  {entry.via === undefined ? "" : ` (via ${entry.via})`}
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      <nav className="tabs" aria-label="Canister pages">
        <Link
          to="/canister/$canisterId"
          params={{ canisterId }}
          className="tab"
          activeOptions={{ exact: true, includeSearch: false }}
          activeProps={{ className: "active" }}
        >
          Methods
        </Link>
        <Link
          to="/canister/$canisterId/interface"
          params={{ canisterId }}
          className="tab"
          activeOptions={{ includeSearch: false }}
          activeProps={{ className: "active" }}
        >
          Interface
        </Link>
      </nav>
    </header>
  )
}
