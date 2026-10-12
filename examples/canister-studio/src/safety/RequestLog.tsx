import type { JSX } from "react"
import { shortPrincipal } from "../lib/format.ts"
import type { LoggedRequest } from "./scenarios.ts"

/** What happened to a request, in a few words. */
function noteOf(request: LoggedRequest): string {
  if (request.refused !== undefined) return request.refused
  if (request.dropped === true) return "ran, reply lost"
  if (request.endpoint === "read_state") return "state read (keys, certificate)"
  return ""
}

/**
 * The requests the in-memory replica received during a run, in order: what
 * left the client, as the replica saw it after checking each signature.
 */
export function RequestLog(props: {
  readonly requests: readonly LoggedRequest[]
  readonly caption: string
}): JSX.Element {
  const { requests, caption } = props
  if (requests.length === 0) {
    return (
      <p className="safety-log-empty">
        <span className="badge badge-ok">0 requests</span> Nothing reached the
        replica.
      </p>
    )
  }
  return (
    <div className="table-wrap">
      <table className="table table-compact safety-log">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="num">
              #
            </th>
            <th scope="col">Endpoint</th>
            <th scope="col">Method</th>
            <th scope="col">Caller</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request, i) => (
            // The log only grows during a run and is replaced as a whole, so
            // the position is the request's identity.
            <tr
              key={i}
              className={
                request.refused !== undefined || request.dropped === true
                  ? "safety-log-flagged"
                  : undefined
              }
            >
              <td className="num">{i + 1}</td>
              <td>
                <code className="code-inline">{request.endpoint}</code>
              </td>
              <td className="mono">{request.methodName ?? ""}</td>
              <td
                className="mono nowrap"
                title={
                  request.caller === undefined ? undefined : request.caller
                }
              >
                {request.caller === undefined
                  ? ""
                  : shortPrincipal(request.caller)}
              </td>
              <td>{noteOf(request)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
