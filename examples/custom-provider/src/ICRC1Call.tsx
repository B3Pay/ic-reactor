/**
 * ICRC1Call Component
 *
 * A styled component that displays the result of calling an ICRC1 method.
 */
import { ReactorArgs } from "@ic-reactor/core"
import { useICRC1Context } from "./ICRC1Provider"
import type { ICRC1 } from "./declarations/icrc1"

type FunctionName = keyof ICRC1

interface ICRC1CallProps<M extends FunctionName = FunctionName> {
  functionName: M
  args?: ReactorArgs<ICRC1, M>
  icon?: string
  label?: string
  isBalance?: boolean
}

// Format value for display
const formatValue = (data: unknown): string => {
  if (data === undefined || data === null) return "-"

  // Format bigint values with thousand separators
  if (typeof data === "bigint") {
    return data.toLocaleString()
  }

  // Format numbers
  if (typeof data === "number") {
    return data.toLocaleString()
  }

  // Format strings directly
  if (typeof data === "string") {
    return data
  }

  return String(data)
}

const ICRC1Call = <M extends FunctionName>({
  functionName,
  args,
  icon = "📌",
  label,
}: ICRC1CallProps<M>) => {
  const { hooks } = useICRC1Context()

  const { data, isLoading, refetch } = hooks.useActorQuery({
    functionName,
    args,
  })

  const displayLabel = label || functionName

  return (
    <div className="token-info-item">
      <span className="token-info-label">
        <span>{icon}</span>
        <span>{displayLabel}</span>
      </span>
      <span className={`token-info-value ${isLoading ? "loading" : ""}`}>
        {isLoading ? (
          <>
            <span className="spinner" />
            <span>Loading...</span>
          </>
        ) : (
          <>
            <span style={{ wordBreak: "break-all" }}>{formatValue(data)}</span>
            <button
              className="btn btn-icon"
              onClick={() => refetch()}
              disabled={isLoading}
              title="Refresh"
            >
              ↻
            </button>
          </>
        )}
      </span>
    </div>
  )
}

export default ICRC1Call
