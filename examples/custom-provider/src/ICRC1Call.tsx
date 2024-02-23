import { FunctionName } from "@ic-reactor/react/dist/types"
import { useICRC1QueryCall } from "./ICRC1Provider"
import { ICRC1 } from "./declarations/icrc1"

export function convertToString(json: any) {
  return JSON.stringify(
    json,
    (_, value) => (typeof value === "bigint" ? `BigInt(${value})` : value),
    2
  )
}

interface ICRC1CallProps {
  functionName: FunctionName<ICRC1>
}

const ICRC1Call: React.FC<ICRC1CallProps> = ({ functionName }) => {
  const { call, data, loading } = useICRC1QueryCall({
    functionName,
  })

  return (
    <div>
      <span>
        <strong>{functionName}</strong>:{" "}
        <button onClick={call} disabled={loading}>
          ↻
        </button>{" "}
        {loading ? "Loading..." : convertToString(data)}
      </span>
    </div>
  )
}

export default ICRC1Call
