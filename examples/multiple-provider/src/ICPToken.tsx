import { FunctionName } from "@ic-reactor/react/dist/types"
import { useICRC2QueryCall } from "./ICRC2Provider"
import { ICRC2 } from "./declarations/icrc2"
import { jsonToString } from "@ic-reactor/core/dist/utils"

interface ICPTokenProps {
  functionName: FunctionName<ICRC2>
}

const ICPToken: React.FC<ICPTokenProps> = ({ functionName }) => {
  const { call, data, loading } = useICRC2QueryCall({
    functionName,
  })

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div>
        <strong>{functionName}</strong>:{" "}
        <button onClick={call} disabled={loading}>
          ↻
        </button>
      </div>
      {loading ? "Loading..." : jsonToString(data)}
    </div>
  )
}

export default ICPToken
