import { FunctionName } from "@ic-reactor/react/dist/types"
import { useICDVQueryCall } from "./ICDVProvider"
import { jsonToString } from "@ic-reactor/core/dist/utils"
import { ICDV } from "./declarations/icdv"

interface ICDVTokenProps {
  functionName: FunctionName<ICDV>
}

const ICDVToken: React.FC<ICDVTokenProps> = ({ functionName }) => {
  const { call, data, loading } = useICDVQueryCall({
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

export default ICDVToken
