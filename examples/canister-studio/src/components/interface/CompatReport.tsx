import type { CompatibilityReport } from "@candid-core/cli"
import type { ReactElement } from "react"
import { groupDigits } from "../../lib/format.ts"
import { Badge } from "../Badge.tsx"
import { Notice } from "../Notice.tsx"

/**
 * A compatibility check's result: whether the live interface is still a
 * Candid subtype of the written one, each finding by method and path, and
 * the interface identities (equal ids: unchanged).
 */
export function CompatReport({
  report,
  writtenLabel,
  liveLabel,
}: {
  report: CompatibilityReport
  writtenLabel: string
  liveLabel: string
}): ReactElement {
  const unchanged = report.written.interface_id === report.live.interface_id
  const errors = report.diagnostics.filter((d) => d.severity === "error")
  const warnings = report.diagnostics.filter((d) => d.severity === "warning")
  return (
    <div className="stack">
      {report.compatible ? (
        <Notice tone="success" title={unchanged ? "Unchanged" : "Compatible"}>
          <p>
            {unchanged
              ? `The ${liveLabel} is the ${writtenLabel}: the same interface id.`
              : `The ${liveLabel} differs (it may have more methods), but every method of the ${writtenLabel} still exists with the same mode and compatible types. Calls written against it keep working.`}
          </p>
        </Notice>
      ) : (
        <Notice tone="danger" title="Not compatible">
          <p>
            {groupDigits(errors.length)}{" "}
            {errors.length === 1 ? "finding breaks" : "findings break"} calls
            written against the {writtenLabel}.
          </p>
        </Notice>
      )}

      <dl className="kv kv-compact">
        <dt>{writtenLabel}</dt>
        <dd className="mono break-all">{report.written.interface_id}</dd>
        <dt>{liveLabel}</dt>
        <dd className="mono break-all">{report.live.interface_id}</dd>
      </dl>

      {report.diagnostics.length > 0 && (
        <div className="table-wrap">
          <table className="table table-compact">
            <caption className="sr-only">
              Compatibility findings: {groupDigits(errors.length)} errors,{" "}
              {groupDigits(warnings.length)} warnings
            </caption>
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Method</th>
                <th scope="col">Where</th>
                <th scope="col">Finding</th>
              </tr>
            </thead>
            <tbody>
              {report.diagnostics.map((diagnostic, i) => (
                <tr
                  key={`${diagnostic.method ?? ""}-${diagnostic.path ?? ""}-${i}`}
                >
                  <td>
                    <Badge
                      tone={diagnostic.severity === "error" ? "err" : "warn"}
                    >
                      {diagnostic.severity}
                    </Badge>
                  </td>
                  <td className="mono break-all">{diagnostic.method ?? ""}</td>
                  <td className="mono break-all">{diagnostic.path ?? ""}</td>
                  <td className="break-all">
                    <span className="mono subtle">{diagnostic.code}</span>{" "}
                    {diagnostic.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
